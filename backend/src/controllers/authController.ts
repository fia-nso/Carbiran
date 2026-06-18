import { Request, Response } from 'express'
import { AuthService } from '../services/authService'

const authService = new AuthService()

export const login = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body as { email?: string; password?: string }
  if (!email || !password) {
    res.status(400).json({ error: 'Email et mot de passe requis' })
    return
  }
  try {
    const result = await authService.login(email, password)
    res.json(result)
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message })
  }
}

export const getMe = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await authService.getMe(req.user!.sub)
    if (!user) { res.status(404).json({ error: 'Utilisateur introuvable' }); return }
    res.json(user)
  } catch (err) {
    console.error('[GET /auth/me]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

export const logout = (_req: Request, res: Response): void => {
  res.json({ message: 'Déconnecté' })
}

export const changePassword = async (req: Request, res: Response): Promise<void> => {
  const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string }
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'Mot de passe actuel et nouveau requis' }); return
  }
  if (newPassword.length < 6) {
    res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 6 caractères' }); return
  }
  try {
    await authService.changePassword(req.user!.sub, currentPassword, newPassword)
    res.json({ message: 'Mot de passe mis à jour' })
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message })
  }
}

export const getUsers = async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json(await authService.getAll())
  } catch (err) {
    console.error('[GET /auth/users]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

export const createUserHandler = async (req: Request, res: Response): Promise<void> => {
  const { email, password, nom, prenom, role, departement, circuit_role, notification_email } =
    req.body as Record<string, string | undefined>

  if (!email || !password || !role) {
    res.status(400).json({ error: 'Email, mot de passe et rôle requis' }); return
  }
  try {
    const user = await authService.create({ email, password, role, nom, prenom, departement, circuit_role, notification_email })
    res.status(201).json(user)
  } catch (err: any) {
    if (err.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ error: 'Cet email est déjà utilisé' }); return
    }
    console.error('[POST /auth/users]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

export const updateUserHandler = async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'] as string
  const { nom, prenom, role, departement, circuit_role, notification_email, password } =
    req.body as Record<string, string | null | undefined>

  try {
    const fields: Record<string, unknown> = {}
    if (nom !== undefined) fields['nom'] = nom
    if (prenom !== undefined) fields['prenom'] = prenom
    if (role !== undefined) fields['role'] = role
    if ('departement' in req.body) fields['departement'] = departement ?? null
    if ('circuit_role' in req.body) fields['circuit_role'] = circuit_role ?? null
    if ('notification_email' in req.body) fields['notification_email'] = notification_email ?? null
    if (password) {
      const bcrypt = await import('bcryptjs')
      fields['password_hash'] = await bcrypt.hash(password, 10)
    }

    if (Object.keys(fields).length === 0) {
      res.status(400).json({ error: 'Aucune modification fournie' }); return
    }

    const user = await authService.update(id, fields as any)
    if (!user) { res.status(404).json({ error: 'Utilisateur introuvable' }); return }
    res.json(user)
  } catch (err) {
    console.error('[PATCH /auth/users/:id]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

export const deleteUserHandler = async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'] as string
  if (id === req.user!.sub) {
    res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' }); return
  }
  try {
    const deleted = await authService.delete(id)
    if (!deleted) { res.status(404).json({ error: 'Utilisateur introuvable' }); return }
    res.status(204).send()
  } catch (err) {
    console.error('[DELETE /auth/users/:id]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}
