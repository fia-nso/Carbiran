import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import { uploadSignature } from '../middleware/upload'
import {
  getSignatures,
  getSignatureUtilisateur,
  postSignature,
  uploadSignatureHandler,
} from '../controllers/signatureController'

const router = Router()

router.get('/utilisateur/me', requireAuth, getSignatureUtilisateur)
router.get('/:demandeId',     requireAuth, getSignatures)
router.post('/',              requireAuth, postSignature)
router.post('/upload',        requireAuth, uploadSignature.single('signature'), uploadSignatureHandler)

export default router
