import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dumpPath = path.resolve(__dirname, '..', '..', 'data', 'carbiran_mysql_final.sql');

function basename(value) {
  const normalized = value.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] || value;
}

function signatureFilename(userId, currentValue) {
  const file = basename(currentValue);
  const ext = file.includes('.') ? file.slice(file.lastIndexOf('.')) : '';
  return `${userId}-signature${ext}`;
}

let sql = fs.readFileSync(dumpPath, 'utf8');

sql = sql.replace(/INSERT INTO `signatures_situation` VALUES ([\s\S]*?);/, (_match, values) => {
  const updatedValues = values.replace(
    /\('([^']*)','([^']*)','([^']*)','([^']*)','([^']*)','([^']*)',(\d+),'([^']*)'\)/g,
    (_tuple, id, demandeId, role, userId, currentValue, signeLe, ordre, circuit) =>
      `('${id}','${demandeId}','${role}','${userId}','${signatureFilename(userId, currentValue)}','${signeLe}',${ordre},'${circuit}')`
  );

  return `INSERT INTO \`signatures_situation\` VALUES ${updatedValues};`;
});

sql = sql.replace(/INSERT INTO `signatures_utilisateurs` VALUES ([\s\S]*?);/, (_match, values) => {
  const updatedValues = values.replace(
    /\('([^']*)','([^']*)','([^']*)','([^']*)','([^']*)'\)/g,
    (_tuple, id, userId, role, currentValue, createdAt) =>
      `('${id}','${userId}','${role}','${signatureFilename(userId, currentValue)}','${createdAt}')`
  );

  return `INSERT INTO \`signatures_utilisateurs\` VALUES ${updatedValues};`;
});

fs.writeFileSync(dumpPath, sql);
console.log(`Dump normalise: ${dumpPath}`);
