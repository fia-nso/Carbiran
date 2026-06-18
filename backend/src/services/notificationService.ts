import { AppDataSource } from '../config/database'
import { Notification } from '../entities/Notification'
import { User } from '../entities/User'

function notifRepo() {
  return AppDataSource.getRepository(Notification)
}

function userRepo() {
  return AppDataSource.getRepository(User)
}

export async function createNotification(
  userId: string,
  message: string,
  type: string,
  demandeId?: string | null
): Promise<void> {
  const notif = notifRepo().create({ user_id: userId, message, type, demande_id: demandeId ?? null })
  await notifRepo().save(notif)
}

export async function notifyByRole(
  role: string,
  message: string,
  type: string,
  demandeId?: string | null
): Promise<void> {
  const users = await userRepo().find({ where: { role }, select: { id: true } })
  await Promise.all(users.map((u) => createNotification(u.id, message, type, demandeId)))
}

export async function notifyByRoles(
  roles: string[],
  message: string,
  type: string,
  demandeId?: string | null
): Promise<void> {
  if (roles.length === 0) return
  const { In } = await import('typeorm')
  const users = await userRepo().find({ where: { role: In(roles) }, select: { id: true } })
  await Promise.all(users.map((u) => createNotification(u.id, message, type, demandeId)))
}

export async function notifyByRoleAndDept(
  role: string,
  departement: string,
  message: string,
  type: string,
  demandeId?: string | null
): Promise<void> {
  const users = await userRepo().find({ where: { role, departement }, select: { id: true } })
  await Promise.all(users.map((u) => createNotification(u.id, message, type, demandeId)))
}
