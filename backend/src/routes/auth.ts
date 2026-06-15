import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/database';
import { requireAuth, requireRole } from '../middleware/auth';
import type { JwtPayload } from '../types/index';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: 'Email et mot de passe requis' });
    return;
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, email, password_hash, nom, prenom, role, departement, circuit_role, notification_email
       FROM users WHERE email = $1`,
      [email.toLowerCase().trim()]
    );

    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      res.status(401).json({ error: 'Identifiants incorrects' });
      return;
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      departement: user.departement,
      circuit_role: user.circuit_role,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '7d' });

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
    });
  } catch (err) {
    console.error('[POST /auth/login]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, email, nom, prenom, role, departement, circuit_role, notification_email
       FROM users WHERE id = $1`,
      [req.user!.sub]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Utilisateur introuvable' });
      return;
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('[GET /auth/me]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/logout
router.post('/logout', requireAuth, (_req, res) => {
  // JWT est stateless — le client supprime le token localement
  res.json({ message: 'Déconnecté' });
});

// PATCH /api/auth/password — changement de mot de passe
router.patch('/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body as {
    currentPassword?: string;
    newPassword?: string;
  };

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'Mot de passe actuel et nouveau requis' });
    return;
  }
  if (newPassword.length < 6) {
    res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 6 caractères' });
    return;
  }

  try {
    const { rows } = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.user!.sub]
    );

    if (rows.length === 0 || !(await bcrypt.compare(currentPassword, rows[0].password_hash))) {
      res.status(401).json({ error: 'Mot de passe actuel incorrect' });
      return;
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user!.sub]);
    res.json({ message: 'Mot de passe mis à jour' });
  } catch (err) {
    console.error('[PATCH /auth/password]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── Gestion des utilisateurs (Admin uniquement) ───────────────────────────────

// GET /api/auth/users
router.get('/users', requireAuth, requireRole('Admin'), async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, email, nom, prenom, role, departement, circuit_role, notification_email, created_at
       FROM users ORDER BY nom NULLS LAST, prenom NULLS LAST`
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /auth/users]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/users
router.post('/users', requireAuth, requireRole('Admin'), async (req, res) => {
  const { email, password, nom, prenom, role, departement, circuit_role, notification_email } =
    req.body as {
      email?: string;
      password?: string;
      nom?: string;
      prenom?: string;
      role?: string;
      departement?: string;
      circuit_role?: string;
      notification_email?: string;
    };

  if (!email || !password || !role) {
    res.status(400).json({ error: 'Email, mot de passe et rôle requis' });
    return;
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, nom, prenom, role, departement, circuit_role, notification_email)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, email, nom, prenom, role, departement, circuit_role, notification_email`,
      [
        email.toLowerCase().trim(), hash,
        nom ?? null, prenom ?? null, role,
        departement ?? null, circuit_role ?? null, notification_email ?? null,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ error: 'Cet email est déjà utilisé' });
      return;
    }
    console.error('[POST /auth/users]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /api/auth/users/:id
router.patch('/users/:id', requireAuth, requireRole('Admin'), async (req, res) => {
  const { nom, prenom, role, departement, circuit_role, notification_email, password } =
    req.body as {
      nom?: string;
      prenom?: string;
      role?: string;
      departement?: string | null;
      circuit_role?: string | null;
      notification_email?: string | null;
      password?: string;
    };

  try {
    const sets: string[] = [];
    const params: unknown[] = [];

    const push = (val: unknown, col: string) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };

    if (nom !== undefined) push(nom, 'nom');
    if (prenom !== undefined) push(prenom, 'prenom');
    if (role !== undefined) push(role, 'role');
    if ('departement' in req.body) push(departement ?? null, 'departement');
    if ('circuit_role' in req.body) push(circuit_role ?? null, 'circuit_role');
    if ('notification_email' in req.body) push(notification_email ?? null, 'notification_email');
    if (password) push(await bcrypt.hash(password, 10), 'password_hash');

    if (sets.length === 0) {
      res.status(400).json({ error: 'Aucune modification fournie' });
      return;
    }

    params.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE users SET ${sets.join(', ')}
       WHERE id = $${params.length}
       RETURNING id, email, nom, prenom, role, departement, circuit_role, notification_email`,
      params
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Utilisateur introuvable' });
      return;
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('[PATCH /auth/users/:id]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/auth/users/:id
router.delete('/users/:id', requireAuth, requireRole('Admin'), async (req, res) => {
  if (req.params.id === req.user!.sub) {
    res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' });
    return;
  }

  try {
    const { rowCount } = await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    if (!rowCount) {
      res.status(404).json({ error: 'Utilisateur introuvable' });
      return;
    }
    res.status(204).send();
  } catch (err) {
    console.error('[DELETE /auth/users/:id]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
