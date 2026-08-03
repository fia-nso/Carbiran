import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth'
import {
  getBon,
  getDemandes,
  getDemande,
  getHistoriqueVehicules,
  postDemande,
  patchDemande,
  deleteDemande,
  replaceDemandeVehicules,
  patchDemandeVehicule,
} from '../controllers/demandeController'

const router = Router()

router.get('/bons/:dvId',                getBon)
router.get('/',                          requireAuth, getDemandes)
router.get('/:id/historique-vehicules',  requireAuth, requireRole('Admin', 'MENAGER'), getHistoriqueVehicules)
router.get('/:id',                       requireAuth, getDemande)
router.post('/',                         requireAuth, postDemande)
router.patch('/:id',                     requireAuth, patchDemande)
router.delete('/:id',                    requireAuth, deleteDemande)
router.patch('/:id/vehicules',           requireAuth, replaceDemandeVehicules)
router.patch('/:id/vehicules/:dvId',     requireAuth, patchDemandeVehicule)

export default router
