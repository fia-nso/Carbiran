import pool from '../config/database'
import type { QueryResult } from 'pg'

export const findNotificationsByUserId = (userId: string): Promise<QueryResult> =>
  pool.query(
    `SELECT id, user_id, message, type, lu, demande_id, created_at
     FROM notifications
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 100`,
    [userId]
  )

export const markNotificationRead = (id: string, userId: string): Promise<QueryResult> =>
  pool.query(
    `UPDATE notifications SET lu = true
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [id, userId]
  )

export const markAllNotificationsRead = (userId: string): Promise<QueryResult> =>
  pool.query('UPDATE notifications SET lu = true WHERE user_id = $1', [userId])
