import pool from '../config/database'
import type { QueryResult } from 'pg'

export const findSignaturesByDemandeId = (demandeId: string): Promise<QueryResult> =>
  pool.query(
    `SELECT id, demande_id, role, user_id, signature_url, signe_le, ordre, circuit
     FROM signatures_situation
     WHERE demande_id = $1
     ORDER BY circuit, ordre`,
    [demandeId]
  )

export const findLatestSignatureUrls = (userIds: string[]): Promise<QueryResult> => {
  const ph = userIds.map((_, i) => `$${i + 1}`).join(', ')
  return pool.query(
    `SELECT user_id, signature_url FROM signatures_utilisateurs WHERE user_id IN (${ph})`,
    userIds
  )
}

export const findSignatureUtilisateur = (userId: string): Promise<QueryResult> =>
  pool.query(
    'SELECT id, user_id, role, signature_url, created_at FROM signatures_utilisateurs WHERE user_id = $1',
    [userId]
  )

export const findUserSignatureUrl = (userId: string): Promise<QueryResult> =>
  pool.query(
    'SELECT signature_url FROM signatures_utilisateurs WHERE user_id = $1',
    [userId]
  )

export const createSignature = (
  demandeId: string,
  role: string,
  userId: string,
  signatureUrl: string,
  ordre: number,
  circuit: string
): Promise<QueryResult> =>
  pool.query(
    `INSERT INTO signatures_situation (demande_id, role, user_id, signature_url, ordre, circuit)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [demandeId, role, userId, signatureUrl, ordre, circuit]
  )

export const upsertSignatureUtilisateur = (
  userId: string,
  role: string,
  url: string
): Promise<QueryResult> =>
  pool.query(
    `INSERT INTO signatures_utilisateurs (user_id, role, signature_url)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET role = $2, signature_url = $3, created_at = now()
     RETURNING *`,
    [userId, role, url]
  )
