import { Router } from 'express';
import pool from '../config/database';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

// GET /api/logs — Admin / MENAGER uniquement
router.get('/', requireAuth, requireRole('Admin', 'MENAGER'), async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, created_at, user_id, user_email, module, action,
              target_table, target_id, description, before_data, after_data, metadata
       FROM activity_logs
       ORDER BY created_at DESC, id DESC
       LIMIT 500`
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /logs]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/logs — tout utilisateur authentifié
router.post('/', requireAuth, async (req, res) => {
  const {
    module, action, target_table, target_id,
    description, before_data, after_data, metadata,
  } = req.body as Record<string, unknown>;

  try {
    const { rows } = await pool.query(
      `INSERT INTO activity_logs
         (user_id, user_email, module, action, target_table, target_id,
          description, before_data, after_data, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id`,
      [
        req.user!.sub,
        req.user!.email,
        module  ?? null,
        action  ?? null,
        target_table ?? null,
        target_id != null ? String(target_id) : null,
        description  ?? null,
        before_data  ?? null,
        after_data   ?? null,
        metadata     ?? null,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[POST /logs]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
