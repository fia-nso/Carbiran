import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth'
import {
  getCentres,
  getCentre,
  createCentreHandler,
  updateCentreHandler,
} from '../controllers/centreController'

const router = Router()

router.get('/',        requireAuth, getCentres)
router.get('/:code',   requireAuth, getCentre)
router.post('/',       requireAuth, requireRole('Admin'), createCentreHandler)
router.patch('/:code', requireAuth, requireRole('Admin'), updateCentreHandler)

export default router
