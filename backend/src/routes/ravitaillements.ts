import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth'
import {
  getRavitaillements,
  getRavitaillement,
  createRavitaillementHandler,
  updateRavitaillementHandler,
  deleteRavitaillementHandler,
} from '../controllers/ravitaillementController'

const router = Router()
const WRITE_ROLES = ['Admin', 'MENAGER']

router.get('/',       requireAuth, getRavitaillements)
router.get('/:id',    requireAuth, getRavitaillement)
router.post('/',      requireAuth, requireRole(...WRITE_ROLES), createRavitaillementHandler)
router.patch('/:id',  requireAuth, requireRole(...WRITE_ROLES), updateRavitaillementHandler)
router.delete('/:id', requireAuth, requireRole(...WRITE_ROLES), deleteRavitaillementHandler)

export default router
