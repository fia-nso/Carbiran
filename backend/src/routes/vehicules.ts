import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth'
import {
  getVehicules,
  getVehicule,
  createVehiculeHandler,
  updateVehiculeHandler,
  deleteVehiculeHandler,
} from '../controllers/vehiculeController'

const router = Router()
const WRITE_ROLES = ['Admin', 'MENAGER']

router.get('/',       requireAuth, getVehicules)
router.get('/:id',    requireAuth, getVehicule)
router.post('/',      requireAuth, requireRole(...WRITE_ROLES), createVehiculeHandler)
router.patch('/:id',  requireAuth, requireRole(...WRITE_ROLES), updateVehiculeHandler)
router.delete('/:id', requireAuth, requireRole(...WRITE_ROLES), deleteVehiculeHandler)

export default router
