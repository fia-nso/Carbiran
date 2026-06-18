import { Request, Response } from 'express'
import { LogService } from '../services/logService'

const logService = new LogService()

export const getLogs = async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json(await logService.findAll())
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
    const log = await logService.create({
      user_id: req.user!.sub,
      user_email: req.user!.email,
      module, action, target_table, target_id,
      description, before_data, after_data, metadata,
    })
    res.status(201).json(log)
  } catch (err) {
    console.error('[POST /logs]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}
