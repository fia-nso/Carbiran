import { Request, Response } from 'express'
import { NotificationService } from '../services/notificationQueryService'

const notificationService = new NotificationService()

export const getNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    res.json(await notificationService.findByUserId(req.user!.sub))
  } catch (err) {
    console.error('[GET /notifications]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

export const markAllRead = async (req: Request, res: Response): Promise<void> => {
  try {
    await notificationService.markAllRead(req.user!.sub)
    res.json({ message: 'Toutes les notifications marquées comme lues' })
  } catch (err) {
    console.error('[PATCH /notifications/all/lu]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

export const markRead = async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'] as string
  try {
    const notif = await notificationService.markRead(id, req.user!.sub)
    if (!notif) { res.status(404).json({ error: 'Notification introuvable' }); return }
    res.json(notif)
  } catch (err) {
    console.error('[PATCH /notifications/:id/lu]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}
