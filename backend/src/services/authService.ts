import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { AppDataSource } from '../config/database'
import { User } from '../entities/User'
import type { JwtPayload } from '../types/index'

function repo() {
  return AppDataSource.getRepository(User)
}

export class AuthService {
  async login(email: string, password: string) {
    console.log('email reçu:', email)
    const user = await repo().findOne({ where: { email: email.toLowerCase().trim() } })
    console.log('user trouvé:', user ? 'oui' : 'non')
    if (user) {
      console.log('password_hash:', user.password_hash)
      if (!user.password_hash) {
        throw new Error('Mot de passe non configuré')
      }
      const valid = await bcrypt.compare(password, user.password_hash)
      console.log('mot de passe valide:', valid)
    }
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
        notification_email: user.notification_email,
      },
    }
  }

  async getMe(userId: string) {
    return repo().findOne({
      where: { id: userId },
      select: { id: true, email: true, nom: true, prenom: true, role: true, departement: true, circuit_role: true, notification_email: true },
    })
  }

  async getAll() {
    return repo().find({
      select: { id: true, email: true, nom: true, prenom: true, role: true, departement: true, circuit_role: true, notification_email: true, created_at: true },
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
    notification_email?: string | null
  }) {
    const hash = await bcrypt.hash(data.password, 10)
    const user = repo().create({
      email: data.email.toLowerCase().trim(),
      password_hash: hash,
      role: data.role,
      nom: data.nom ?? null,
      prenom: data.prenom ?? null,
      departement: data.departement ?? null,
      circuit_role: data.circuit_role ?? null,
      notification_email: data.notification_email ?? null,
    })
    return repo().save(user)
  }

  async update(id: string, fields: Partial<Omit<User, 'id' | 'created_at' | 'updated_at'>>) {
    await repo().update(id, fields)
    return repo().findOne({
      where: { id },
      select: { id: true, email: true, nom: true, prenom: true, role: true, departement: true, circuit_role: true, notification_email: true },
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
