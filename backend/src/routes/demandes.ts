import { Router } from 'express'
import { requireAuth, requireRole, denyRole } from '../middleware/auth'
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
// DMG (Direction des Moyens Généraux) : aucun accès aux demandes.
const noDmg = denyRole('dmg')

router.get('/',                          requireAuth, noDmg, getDemandes)
router.get('/:id/historique-vehicules',  requireAuth, requireRole('Admin', 'MENAGER'), getHistoriqueVehicules)
router.get('/:id',                       requireAuth, noDmg, getDemande)
router.post('/',                         requireAuth, noDmg, postDemande)
router.patch('/:id',                     requireAuth, noDmg, patchDemande)
router.delete('/:id',                    requireAuth, noDmg, deleteDemande)
router.patch('/:id/vehicules',           requireAuth, noDmg, replaceDemandeVehicules)
router.patch('/:id/vehicules/:dvId',     requireAuth, noDmg, patchDemandeVehicule)

export default router
