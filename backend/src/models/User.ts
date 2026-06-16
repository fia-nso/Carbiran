import pool from '../config/database'
import type { QueryResult, Pool, PoolClient } from 'pg'

type Db = Pool | PoolClient

export const findUserByEmail = (email: string): Promise<QueryResult> =>
  pool.query(
    `SELECT id, email, password_hash, nom, prenom, role, departement, circuit_role, notification_email
     FROM users WHERE email = $1`,
    [email]
  )

export const findUserById = (id: string): Promise<QueryResult> =>
  pool.query(
    `SELECT id, email, nom, prenom, role, departement, circuit_role, notification_email
     FROM users WHERE id = $1`,
    [id]
  )

export const findUserPasswordHash = (id: string): Promise<QueryResult> =>
  pool.query('SELECT password_hash FROM users WHERE id = $1', [id])

export const findAllUsers = (): Promise<QueryResult> =>
  pool.query(
    `SELECT id, email, nom, prenom, role, departement, circuit_role, notification_email, created_at
     FROM users ORDER BY nom NULLS LAST, prenom NULLS LAST`
  )

export const createUser = (
  email: string,
  passwordHash: string,
  nom: string | null,
  prenom: string | null,
  role: string,
  departement: string | null,
  circuit_role: string | null,
  notification_email: string | null
): Promise<QueryResult> =>
  pool.query(
    `INSERT INTO users (email, password_hash, nom, prenom, role, departement, circuit_role, notification_email)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, email, nom, prenom, role, departement, circuit_role, notification_email`,
    [email, passwordHash, nom, prenom, role, departement, circuit_role, notification_email]
  )

export const updateUser = (
  id: string,
  fields: Record<string, unknown>,
  db: Db = pool
): Promise<QueryResult> => {
  const sets: string[] = []
  const params: unknown[] = []
  for (const [col, val] of Object.entries(fields)) {
    params.push(val)
    sets.push(`${col} = $${params.length}`)
  }
  params.push(id)
  return db.query(
    `UPDATE users SET ${sets.join(', ')}
     WHERE id = $${params.length}
     RETURNING id, email, nom, prenom, role, departement, circuit_role, notification_email`,
    params
  )
}

export const updateUserPassword = (id: string, hash: string): Promise<QueryResult> =>
  pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, id])

export const deleteUser = (id: string): Promise<QueryResult> =>
  pool.query('DELETE FROM users WHERE id = $1', [id])
