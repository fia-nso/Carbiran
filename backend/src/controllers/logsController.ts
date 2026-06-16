import { Request, Response } from 'express'
import { findAllLogs, createLog } from '../models/ActivityLog'

export const getLogs = async (_req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await findAllLogs()
    res.json(rows)
  } catch (err) {
    console.error('[GET /logs]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

export const createLogHandler = async (req: Request, res: Response): Promise<void> => {
  const {
    module, action, target_table, target_id,
    description, before_data, after_data, metadata,
  } = req.body as Record<string, unknown>

  try {
    const { rows } = await createLog(
      req.user!.sub,
      req.user!.email,
      module, action,
      target_table, target_id,
      description, before_data, after_data, metadata
    )
    res.status(201).json(rows[0])
  } catch (err) {
    console.error('[POST /logs]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}
