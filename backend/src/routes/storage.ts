import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth'
import { uploadPhoto } from '../middleware/upload'
import {
  uploadPhotoHandler,
  deletePhotosByDvHandler,
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
  '/photo',
  requireAuth,
  requireRole('Admin', 'MENAGER', 'responsable_station'),
  deletePhotosByDvHandler
)

router.delete(
  '/',
  requireAuth,
  requireRole('Admin', 'MENAGER'),
  deleteStorageHandler
)

export default router
