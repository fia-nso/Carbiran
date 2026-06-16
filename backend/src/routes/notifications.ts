import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import {
  getNotifications,
  markAllRead,
  markRead,
} from '../controllers/notificationController'

const router = Router()

router.get('/',        requireAuth, getNotifications)
router.patch('/all/lu', requireAuth, markAllRead)
router.patch('/:id/lu', requireAuth, markRead)

export default router
