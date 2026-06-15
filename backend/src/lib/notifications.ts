import pool from '../config/database';

export async function createNotification(
  userId: string,
  message: string,
  type: string,
  demandeId?: string | null
): Promise<void> {
  await pool.query(
    'INSERT INTO notifications (user_id, message, type, demande_id) VALUES ($1, $2, $3, $4)',
    [userId, message, type, demandeId ?? null]
  );
}

export async function notifyByRole(
  role: string,
  message: string,
  type: string,
  demandeId?: string | null
): Promise<void> {
  const { rows } = await pool.query<{ id: string }>(
    'SELECT id FROM users WHERE role = $1',
    [role]
  );
  await Promise.all(rows.map((r) => createNotification(r.id, message, type, demandeId)));
}

export async function notifyByRoles(
  roles: string[],
  message: string,
  type: string,
  demandeId?: string | null
): Promise<void> {
  if (roles.length === 0) return;
  const placeholders = roles.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE role IN (${placeholders})`,
    roles
  );
  await Promise.all(rows.map((r) => createNotification(r.id, message, type, demandeId)));
}

export async function notifyByRoleAndDept(
  role: string,
  departement: string,
  message: string,
  type: string,
  demandeId?: string | null
): Promise<void> {
  const { rows } = await pool.query<{ id: string }>(
    'SELECT id FROM users WHERE role = $1 AND departement = $2',
    [role, departement]
  );
  await Promise.all(rows.map((r) => createNotification(r.id, message, type, demandeId)));
}
