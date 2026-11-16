import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { AppDataSource } from '../config/database'
import { User } from '../entities/User'
import type { JwtPayload } from '../types/index'
import { CentreService } from './centreService'
import { roleExigeCentre } from '../lib/userCentre'

const centreService = new CentreService()

const USER_PUBLIC_SELECT = {
  id: true, email: true, nom: true, prenom: true, role: true, departement: true,
  circuit_role: true, centre: true, notification_email: true,
} as const

function httpError(status: number, message: string): Error {
  return Object.assign(new Error(message), { status })
}

/**
 * Valide le centre d'un utilisateur pour un rôle donné.
 * - obligatoire pour chef_de_cours et responsable_station ;
 * - s'il est renseigné, doit exister dans `centres` et être actif.
 * Retourne le code normalisé (majuscules) ou null.
 */
async function validerCentreUtilisateur(
  role: string,
  centre: unknown,
  centreActuel: string | null = null
): Promise<string | null> {
  // Un centre inchangé (même désactivé depuis) reste accepté : la désactivation ne bloque pas ses utilisateurs.
  const inchange = centreActuel !== null && typeof centre === 'string' && centre.trim().toUpperCase() === centreActuel
  const code = await centreService.verifierCode(centre, { actifRequis: !inchange })
  if (!code && roleExigeCentre(role)) {
    throw httpError(400, `Centre obligatoire pour le rôle ${role}`)
  }
  return code
}

function repo() {
  return AppDataSource.getRepository(User)
}

export class AuthService {
  async login(email: string, password: string) {
    const user = await repo().findOne({ where: { email: email.toLowerCase().trim() } })
    if (!user) {
      throw Object.assign(new Error('Identifiants incorrects'), { status: 401 })
    }
    if (!user.password_hash) {
      throw new Error('Mot de passe non configuré')
    }
    if (!(await bcrypt.compare(password, user.password_hash))) {
      throw Object.assign(new Error('Identifiants incorrects'), { status: 401 })
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role as JwtPayload['role'],
      departement: user.departement,
      circuit_role: user.circuit_role,
      centre: user.centre,
    }

    const token = jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '7d' })

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        nom: user.nom,
        prenom: user.prenom,
        role: user.role,
        departement: user.departement,
        circuit_role: user.circuit_role,
        centre: user.centre,
        notification_email: user.notification_email,
      },
    }
  }

  async getMe(userId: string) {
    return repo().findOne({
      where: { id: userId },
      select: USER_PUBLIC_SELECT,
    })
  }

  async getAll() {
    return repo().find({
      select: { ...USER_PUBLIC_SELECT, created_at: true },
      order: { nom: 'ASC', prenom: 'ASC' },
    })
  }

  async create(data: {
    email: string
    password: string
    role: string
    nom?: string | null
    prenom?: string | null
    departement?: string | null
    circuit_role?: string | null
    centre?: string | null
    notification_email?: string | null
  }) {
    const centre = await validerCentreUtilisateur(data.role, data.centre)
    const hash = await bcrypt.hash(data.password, 10)
    const user = repo().create({
      email: data.email.toLowerCase().trim(),
      password_hash: hash,
      role: data.role,
      nom: data.nom ?? null,
      prenom: data.prenom ?? null,
      departement: data.departement ?? null,
      circuit_role: data.circuit_role ?? null,
      centre,
      notification_email: data.notification_email ?? null,
    })
    return repo().save(user)
  }

  async update(id: string, fields: Partial<Omit<User, 'id' | 'created_at' | 'updated_at'>>) {
    // Si le rôle ou le centre change, on revalide le couple final (rôle, centre).
    if ('role' in fields || 'centre' in fields) {
      const actuel = await repo().findOne({ where: { id }, select: { id: true, role: true, centre: true } })
      if (!actuel) return null
      const role = fields.role ?? actuel.role
      const centre = 'centre' in fields ? fields.centre : actuel.centre
      fields = { ...fields, centre: await validerCentreUtilisateur(role, centre, actuel.centre) }
    }
    await repo().update(id, fields)
    return repo().findOne({
      where: { id },
      select: USER_PUBLIC_SELECT,
    })
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await repo().findOne({ where: { id: userId }, select: { id: true, password_hash: true } })
    if (!user) {
      throw Object.assign(new Error('Mot de passe actuel incorrect'), { status: 401 })
    }
    if (!user.password_hash) {
      throw new Error('Mot de passe non configuré')
    }
    if (!(await bcrypt.compare(currentPassword, user.password_hash))) {
      throw Object.assign(new Error('Mot de passe actuel incorrect'), { status: 401 })
    }
    const hash = await bcrypt.hash(newPassword, 10)
    await repo().update(userId, { password_hash: hash })
  }

  async delete(id: string): Promise<boolean> {
    const result = await repo().delete(id)
    return (result.affected ?? 0) > 0
  }
}
