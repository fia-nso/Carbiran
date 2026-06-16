import { Request, Response } from 'express'
import {
  findNotificationsByUserId,
  markNotificationRead,
  markAllNotificationsRead,
} from '../models/Notification'

export const getNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await findNotificationsByUserId(req.user!.sub)
    res.json(rows)
  } catch (err) {
    console.error('[GET /notifications]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

export const markAllRead = async (req: Request, res: Response): Promise<void> => {
  try {
    await markAllNotificationsRead(req.user!.sub)
    res.json({ message: 'Toutes les notifications marquées comme lues' })
  } catch (err) {
    console.error('[PATCH /notifications/all/lu]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

export const markRead = async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'] as string
  try {
    const { rows } = await markNotificationRead(id, req.user!.sub)
    if (rows.length === 0) {
      res.status(404).json({ error: 'Notification introuvable' })
      return
    }
    res.json(rows[0])
  } catch (err) {
    console.error('[PATCH /notifications/:id/lu]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}
