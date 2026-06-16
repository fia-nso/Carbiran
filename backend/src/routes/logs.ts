import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth'
import { getLogs, createLogHandler } from '../controllers/logsController'

const router = Router()

router.get('/',  requireAuth, requireRole('Admin', 'MENAGER'), getLogs)
router.post('/', requireAuth, createLogHandler)

export default router
