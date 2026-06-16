import pool from '../config/database'
import type { QueryResult } from 'pg'

export const findAllLogs = (): Promise<QueryResult> =>
  pool.query(
    `SELECT id, created_at, user_id, user_email, module, action,
            target_table, target_id, description, before_data, after_data, metadata
     FROM activity_logs
     ORDER BY created_at DESC, id DESC
     LIMIT 500`
  )

export const createLog = (
  userId: string,
  userEmail: string,
  module: unknown,
  action: unknown,
  targetTable: unknown,
  targetId: unknown,
  description: unknown,
  beforeData: unknown,
  afterData: unknown,
  metadata: unknown
): Promise<QueryResult> =>
  pool.query(
    `INSERT INTO activity_logs
       (user_id, user_email, module, action, target_table, target_id,
        description, before_data, after_data, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING id`,
    [
      userId, userEmail,
      module ?? null, action ?? null,
      targetTable ?? null,
      targetId != null ? String(targetId) : null,
      description ?? null, beforeData ?? null, afterData ?? null, metadata ?? null,
    ]
  )
