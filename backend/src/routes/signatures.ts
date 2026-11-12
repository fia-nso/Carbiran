import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import { uploadSignature } from '../middleware/upload'
import {
  getSignatures,
  getSignatureUtilisateur,
  postSignerDocuments,
  uploadSignatureHandler,
} from '../controllers/signatureController'

const router = Router()

router.get('/utilisateur/me', requireAuth, getSignatureUtilisateur)
router.get('/:demandeId',     requireAuth, getSignatures)
router.post('/signer',        requireAuth, postSignerDocuments)
router.post('/upload',        requireAuth, uploadSignature.single('signature'), uploadSignatureHandler)

export default router
