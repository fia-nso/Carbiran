import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth'
import {
  login,
  getMe,
  logout,
  changePassword,
  getUsers,
  createUserHandler,
  updateUserHandler,
  deleteUserHandler,
} from '../controllers/authController'

const router = Router()

router.post('/login',          login)
router.get('/me',              requireAuth, getMe)
router.post('/logout',         requireAuth, logout)
router.patch('/password',      requireAuth, changePassword)

router.get('/users',           requireAuth, requireRole('Admin'), getUsers)
router.post('/users',          requireAuth, requireRole('Admin'), createUserHandler)
router.patch('/users/:id',     requireAuth, requireRole('Admin'), updateUserHandler)
router.delete('/users/:id',    requireAuth, requireRole('Admin'), deleteUserHandler)

export default router
