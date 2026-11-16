import { AppDataSource } from '../config/database'
import { Notification } from '../entities/Notification'
import { User } from '../entities/User'
import { sendEmail } from '../lib/email'

const ROLE_LABELS: Record<string, string> = {
  chef_departement:      'Chef Département',
  directeur_technique:   'Directeur Technique',
  chef_cellule:          'Chef Cellule CSÉ',
  directeur_general:     'Directeur Général',
  directrice_financiere: 'Directrice Financière',
  directeur_commercial:  'Directeur Commercial',
  Admin:                 'Chef Cellule CSÉ',
  MENAGER:               'Chef Cellule CSÉ',
}

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
  demandeId?: string | null,
  departement?: string
): Promise<void> {
  const notif = notifRepo().create({ user_id: userId, message, type, demande_id: demandeId ?? null })
  await notifRepo().save(notif)

  const user = await userRepo().findOne({
    where: { id: userId },
    select: { notification_email: true, nom: true, prenom: true, circuit_role: true, role: true },
  })
  if (user?.notification_email) {
    const fullName = [user.nom, user.prenom].filter(Boolean).join(' ')
    const roleKey = user.circuit_role ?? user.role ?? ''
    const name = fullName || ROLE_LABELS[roleKey] || roleKey || 'Utilisateur'
    void sendEmail(user.notification_email, name, demandeId ?? '', departement ?? '', message)
  }
}

export async function notifyByRole(
  role: string,
  message: string,
  type: string,
  demandeId?: string | null,
  departement?: string
): Promise<void> {
  const users = await userRepo().find({ where: { role }, select: { id: true } })
  await Promise.all(users.map((u) => createNotification(u.id, message, type, demandeId, departement)))
}

export async function notifyByRoles(
  roles: string[],
  message: string,
  type: string,
  demandeId?: string | null,
  departement?: string
): Promise<void> {
  if (roles.length === 0) return
  const { In } = await import('typeorm')
  const users = await userRepo().find({ where: { role: In(roles) }, select: { id: true } })
  await Promise.all(users.map((u) => createNotification(u.id, message, type, demandeId, departement)))
}

export async function notifyByRoleAndDept(
  role: string,
  departement: string,
  message: string,
  type: string,
  demandeId?: string | null
): Promise<void> {
  const users = await userRepo().find({ where: { role, departement }, select: { id: true } })
  await Promise.all(users.map((u) => createNotification(u.id, message, type, demandeId, departement)))
}

export async function notifyByCircuitRole(
  circuitRole: string,
  message: string,
  type: string,
  demandeId?: string | null,
  departement?: string
): Promise<void> {
  const users = await userRepo().find({ where: { circuit_role: circuitRole }, select: { id: true } })
  await Promise.all(users.map((u) => createNotification(u.id, message, type, demandeId, departement)))
}

/**
 * Notifie les utilisateurs d'un rôle rattachés à un centre donné.
 * Retourne le nombre d'utilisateurs notifiés.
 */
export async function notifyByRoleAndCentre(
  role: string,
  centre: string,
  message: string,
  type: string,
  demandeId?: string | null,
  departement?: string
): Promise<number> {
  const users = await userRepo().find({ where: { role, centre }, select: { id: true } })
  await Promise.all(users.map((u) => createNotification(u.id, message, type, demandeId, departement)))
  return users.length
}

/**
 * Prévient la station du centre de la demande + le Chef Département Achat
 * (responsable_station_viewer, tous centres). Si aucune station n'existe pour
 * ce centre : avertissement serveur + notification à la Cellule (Admin, MENAGER).
 */
export async function notifyStationDuCentre(
  centre: string,
  message: string,
  type: string,
  demandeId?: string | null,
  departement?: string
): Promise<void> {
  const [nbStations] = await Promise.all([
    notifyByRoleAndCentre('responsable_station', centre, message, type, demandeId, departement),
    notifyByRole('responsable_station_viewer', message, type, demandeId, departement),
  ])
  if (nbStations === 0) {
    console.warn(`[notif station] Aucune station (responsable_station) pour le centre ${centre} — demande ${demandeId ?? '?'}`)
    await notifyByRoles(
      ['Admin', 'MENAGER'],
      `Aucune station configurée pour le centre ${centre} — ${message}`,
      type,
      demandeId,
      departement
    )
  }
}
