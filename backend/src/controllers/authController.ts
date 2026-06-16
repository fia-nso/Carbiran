import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import {
  findUserByEmail,
  findUserById,
  findUserPasswordHash,
  findAllUsers,
  createUser,
  updateUser,
  updateUserPassword,
  deleteUser,
} from '../models/User'
import type { JwtPayload } from '../types/index'

export const login = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body as { email?: string; password?: string }

  if (!email || !password) {
    res.status(400).json({ error: 'Email et mot de passe requis' })
    return
  }

  try {
    const { rows } = await findUserByEmail(email.toLowerCase().trim())
    const user = rows[0]

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      res.status(401).json({ error: 'Identifiants incorrects' })
      return
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      departement: user.departement,
      circuit_role: user.circuit_role,
    }

    const token = jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '7d' })

    res.json({
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
    })
  } catch (err) {
    console.error('[POST /auth/login]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

export const getMe = async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await findUserById(req.user!.sub)

    if (rows.length === 0) {
      res.status(404).json({ error: 'Utilisateur introuvable' })
      return
    }
    res.json(rows[0])
  } catch (err) {
    console.error('[GET /auth/me]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

export const logout = (_req: Request, res: Response): void => {
  res.json({ message: 'Déconnecté' })
}

export const changePassword = async (req: Request, res: Response): Promise<void> => {
  const { currentPassword, newPassword } = req.body as {
    currentPassword?: string
    newPassword?: string
  }

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'Mot de passe actuel et nouveau requis' })
    return
  }
  if (newPassword.length < 6) {
    res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 6 caractères' })
    return
  }

  try {
    const { rows } = await findUserPasswordHash(req.user!.sub)

    if (rows.length === 0 || !(await bcrypt.compare(currentPassword, rows[0].password_hash))) {
      res.status(401).json({ error: 'Mot de passe actuel incorrect' })
      return
    }

    const hash = await bcrypt.hash(newPassword, 10)
    await updateUserPassword(req.user!.sub, hash)
    res.json({ message: 'Mot de passe mis à jour' })
  } catch (err) {
    console.error('[PATCH /auth/password]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

export const getUsers = async (_req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await findAllUsers()
    res.json(rows)
  } catch (err) {
    console.error('[GET /auth/users]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

export const createUserHandler = async (req: Request, res: Response): Promise<void> => {
  const { email, password, nom, prenom, role, departement, circuit_role, notification_email } =
    req.body as {
      email?: string
      password?: string
      nom?: string
      prenom?: string
      role?: string
      departement?: string
      circuit_role?: string
      notification_email?: string
    }

  if (!email || !password || !role) {
    res.status(400).json({ error: 'Email, mot de passe et rôle requis' })
    return
  }

  try {
    const hash = await bcrypt.hash(password, 10)
    const { rows } = await createUser(
      email.toLowerCase().trim(), hash,
      nom ?? null, prenom ?? null, role,
      departement ?? null, circuit_role ?? null, notification_email ?? null
    )
    res.status(201).json(rows[0])
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ error: 'Cet email est déjà utilisé' })
      return
    }
    console.error('[POST /auth/users]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

export const updateUserHandler = async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'] as string
  const { nom, prenom, role, departement, circuit_role, notification_email, password } =
    req.body as {
      nom?: string
      prenom?: string
      role?: string
      departement?: string | null
      circuit_role?: string | null
      notification_email?: string | null
      password?: string
    }

  try {
    const fields: Record<string, unknown> = {}

    if (nom !== undefined) fields['nom'] = nom
    if (prenom !== undefined) fields['prenom'] = prenom
    if (role !== undefined) fields['role'] = role
    if ('departement' in req.body) fields['departement'] = departement ?? null
    if ('circuit_role' in req.body) fields['circuit_role'] = circuit_role ?? null
    if ('notification_email' in req.body) fields['notification_email'] = notification_email ?? null
    if (password) fields['password_hash'] = await bcrypt.hash(password, 10)

    if (Object.keys(fields).length === 0) {
      res.status(400).json({ error: 'Aucune modification fournie' })
      return
    }

    const { rows } = await updateUser(id, fields)

    if (rows.length === 0) {
      res.status(404).json({ error: 'Utilisateur introuvable' })
      return
    }
    res.json(rows[0])
  } catch (err) {
    console.error('[PATCH /auth/users/:id]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

export const deleteUserHandler = async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'] as string
  if (id === req.user!.sub) {
    res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' })
    return
  }

  try {
    const { rowCount } = await deleteUser(id)
    if (!rowCount) {
      res.status(404).json({ error: 'Utilisateur introuvable' })
      return
    }
    res.status(204).send()
  } catch (err) {
    console.error('[DELETE /auth/users/:id]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}
