import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth'
import { uploadPhoto } from '../middleware/upload'
import {
  uploadPhotoHandler,
  deleteStorageHandler,
} from '../controllers/storageController'

const router = Router()

router.post(
  '/upload',
  requireAuth,
  requireRole('Admin', 'MENAGER', 'responsable_station'),
  uploadPhoto.single('photo'),
  uploadPhotoHandler
)

router.delete(
  '/',
  requireAuth,
  requireRole('Admin', 'MENAGER'),
  deleteStorageHandler
)

export default router
