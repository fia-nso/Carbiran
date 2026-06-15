import { Router } from 'express';
import pool from '../config/database';
import { requireAuth } from '../middleware/auth';

const router = Router();

// GET /api/notifications
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, user_id, message, type, lu, demande_id, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [req.user!.sub]
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /notifications]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /api/notifications/all/lu — marquer toutes comme lues (avant /:id/lu pour éviter conflit)
router.patch('/all/lu', requireAuth, async (req, res) => {
  try {
    await pool.query('UPDATE notifications SET lu = true WHERE user_id = $1', [req.user!.sub]);
    res.json({ message: 'Toutes les notifications marquées comme lues' });
  } catch (err) {
    console.error('[PATCH /notifications/all/lu]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /api/notifications/:id/lu
router.patch('/:id/lu', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE notifications SET lu = true
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [req.params.id, req.user!.sub]
    );
    if (rows.length === 0) {
      res.status(404).json({ error: 'Notification introuvable' });
      return;
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('[PATCH /notifications/:id/lu]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
