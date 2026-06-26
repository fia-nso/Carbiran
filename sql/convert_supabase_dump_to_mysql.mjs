import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

const inputPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(repoRoot, 'carbiran_data.sql');
const outputPath = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.join(repoRoot, 'carbiran_data_mysql.sql');

const DIRECT_TABLES = [
  'public.activity_logs',
  'public.demandes_ravitaillement',
  'public.vehicules',
  'public.demande_vehicules',
  'public.notifications',
  'public.photos_justification',
  'public.ravitaillements_vehicules',
  'public.signatures_situation',
  'public.signatures_utilisateurs',
];

function parseColumns(columnsSql) {
  return Array.from(columnsSql.matchAll(/"([^"]+)"/g), (match) => match[1]);
}

function splitTuples(valuesSql) {
  const tuples = [];
  let inString = false;
  let depth = 0;
  let current = '';

  for (let i = 0; i < valuesSql.length; i += 1) {
    const char = valuesSql[i];
    const next = valuesSql[i + 1];

    if (char === "'") {
      current += char;
      if (inString && next === "'") {
        current += next;
        i += 1;
      } else {
        inString = !inString;
      }
      continue;
    }

    if (!inString) {
      if (char === '(') {
        if (depth > 0) current += char;
        depth += 1;
        continue;
      }

      if (char === ')') {
        depth -= 1;
        if (depth === 0) {
          tuples.push(current);
          current = '';
          continue;
        }
      }
    }

    if (depth > 0) current += char;
  }

  return tuples;
}

function splitFields(tupleSql) {
  const fields = [];
  let inString = false;
  let current = '';

  for (let i = 0; i < tupleSql.length; i += 1) {
    const char = tupleSql[i];
    const next = tupleSql[i + 1];

    if (char === "'") {
      current += char;
      if (inString && next === "'") {
        current += next;
        i += 1;
      } else {
        inString = !inString;
      }
      continue;
    }

    if (!inString && char === ',') {
      fields.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim() !== '') fields.push(current.trim());
  return fields;
}

function normalizeToken(token) {
  const trimmed = token.trim();

  if (/^true$/i.test(trimmed)) return '1';
  if (/^false$/i.test(trimmed)) return '0';

  return trimmed.replace(
    /^'(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?)\+00'$/,
    "'$1'"
  );
}

function decodeSqlString(token) {
  const trimmed = token.trim();
  if (/^null$/i.test(trimmed)) return null;
  if (!(trimmed.startsWith("'") && trimmed.endsWith("'"))) return trimmed;
  return trimmed.slice(1, -1).replace(/''/g, "'");
}

function recordKey(record, columnName = 'id') {
  const value = record[columnName];
  return value == null ? null : decodeSqlString(value);
}

function chunk(array, size) {
  const out = [];
  for (let i = 0; i < array.length; i += size) {
    out.push(array.slice(i, i + size));
  }
  return out;
}

function buildInsertStatements(tableName, columns, rows) {
  if (rows.length === 0) {
    return [`-- ${tableName}: aucune ligne a importer`];
  }

  const header = `INSERT INTO \`${tableName}\` (${columns.map((column) => `\`${column}\``).join(', ')}) VALUES`;
  const statements = [];

  for (const part of chunk(rows, 200)) {
    const values = part
      .map((row) => `(${columns.map((column) => row[column]).join(', ')})`)
      .join(',\n');
    statements.push(`${header}\n${values};`);
  }

  return statements;
}

function parseDump(sql) {
  const insertRegex = /INSERT INTO\s+"([^"]+)"\."([^"]+)"\s+\(([\s\S]*?)\)\s+VALUES\s*([\s\S]*?);/g;
  const tables = new Map();
  let match;

  while ((match = insertRegex.exec(sql)) !== null) {
    const [, schema, table, columnsSql, valuesSql] = match;
    const key = `${schema}.${table}`;
    const columns = parseColumns(columnsSql);
    const rows = splitTuples(valuesSql).map((tuple) => {
      const values = splitFields(tuple).map(normalizeToken);
      const record = {};
      columns.forEach((column, index) => {
        record[column] = values[index];
      });
      return record;
    });

    tables.set(key, { columns, rows });
  }

  return tables;
}

function buildUsersRows(tables) {
  const authUsers = tables.get('auth.users')?.rows ?? [];
  const profiles = tables.get('public.profiles')?.rows ?? [];
  const profilesById = new Map(profiles.map((row) => [recordKey(row), row]));
  const usedProfiles = new Set();
  const rows = [];

  for (const authUser of authUsers) {
    const id = recordKey(authUser);
    const profile = profilesById.get(id);
    if (profile) usedProfiles.add(id);

    rows.push({
      id: authUser.id,
      email: profile?.email ?? authUser.email,
      password_hash: authUser.encrypted_password,
      nom: profile?.nom ?? 'NULL',
      prenom: profile?.prenom ?? 'NULL',
      role: profile?.role ?? "'viewer'",
      departement: profile?.departement ?? 'NULL',
      circuit_role: profile?.circuit_role ?? 'NULL',
      notification_email: profile?.notification_email ?? 'NULL',
      created_at: profile?.created_at ?? authUser.created_at,
      updated_at: profile?.updated_at ?? authUser.updated_at,
    });
  }

  const skippedProfileOnlyRows = profiles.filter((row) => !usedProfiles.has(recordKey(row))).length;

  return { rows, skippedProfileOnlyRows };
}

function buildDirectRows(rows, columns) {
  return rows.map((row) => {
    const out = {};
    for (const column of columns) out[column] = row[column];
    return out;
  });
}

const dumpSql = fs.readFileSync(inputPath, 'utf8');
const tables = parseDump(dumpSql);
const { rows: userRows, skippedProfileOnlyRows } = buildUsersRows(tables);

const statements = [
  '-- Conversion MySQL a partir de carbiran_data.sql (export Supabase/PostgreSQL)',
  '-- Tables Supabase specifiques ignorees: auth.identities, auth.sessions, storage.objects, etc.',
  '-- Utiliser ce fichier apres creation du schema MySQL cible.',
  'SET NAMES utf8mb4;',
  'SET FOREIGN_KEY_CHECKS = 0;',
  '',
  ...buildInsertStatements(
    'users',
    [
      'id',
      'email',
      'password_hash',
      'nom',
      'prenom',
      'role',
      'departement',
      'circuit_role',
      'notification_email',
      'created_at',
      'updated_at',
    ],
    userRows
  ),
  '',
];

for (const sourceTable of DIRECT_TABLES) {
  const table = tables.get(sourceTable);
  if (!table) continue;
  const tableName = sourceTable.replace('public.', '');
  statements.push(...buildInsertStatements(tableName, table.columns, buildDirectRows(table.rows, table.columns)));
  statements.push('');
}

statements.push(`-- Profils sans auth.users ignores: ${skippedProfileOnlyRows}`);
statements.push('SET FOREIGN_KEY_CHECKS = 1;');
statements.push('');

fs.writeFileSync(outputPath, `${statements.join('\n')}\n`, 'utf8');

console.log(`Fichier genere: ${outputPath}`);
