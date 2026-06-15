import { Router } from 'express';
import pool from '../config/database';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();
const WRITE_ROLES = ['Admin', 'MENAGER'];

// GET /api/vehicules
router.get('/', requireAuth, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, vehicule, matricule, utilisation_affectation, chauffeur_responsable,
              zone, centre, created_at, updated_at
       FROM vehicules ORDER BY zone, vehicule`
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /vehicules]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/vehicules/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, vehicule, matricule, utilisation_affectation, chauffeur_responsable,
              zone, centre, created_at, updated_at
       FROM vehicules WHERE id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) {
      res.status(404).json({ error: 'Véhicule introuvable' });
      return;
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('[GET /vehicules/:id]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/vehicules
router.post('/', requireAuth, requireRole(...WRITE_ROLES), async (req, res) => {
  const { vehicule, matricule, utilisation_affectation, chauffeur_responsable, zone, centre } =
    req.body as {
      vehicule?: string;
      matricule?: string;
      utilisation_affectation?: string;
      chauffeur_responsable?: string;
      zone?: string;
      centre?: string;
    };

  if (!vehicule || !matricule || !utilisation_affectation || !zone) {
    res.status(400).json({
      error: 'Champs obligatoires: vehicule, matricule, utilisation_affectation, zone',
    });
    return;
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO vehicules (vehicule, matricule, utilisation_affectation, chauffeur_responsable, zone, centre)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        vehicule.trim(), matricule.trim(), utilisation_affectation.trim(),
        chauffeur_responsable ?? null, zone.trim(), centre ?? null,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ error: 'Ce matricule existe déjà' });
      return;
    }
    console.error('[POST /vehicules]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /api/vehicules/:id
router.patch('/:id', requireAuth, requireRole(...WRITE_ROLES), async (req, res) => {
  const { vehicule, matricule, utilisation_affectation, chauffeur_responsable, zone, centre } =
    req.body as {
      vehicule?: string;
      matricule?: string;
      utilisation_affectation?: string;
      chauffeur_responsable?: string | null;
      zone?: string;
      centre?: string | null;
    };

  try {
    const sets: string[] = [];
    const params: unknown[] = [];

    const push = (val: unknown, col: string) => { params.push(val); sets.push(`${col} = $${params.length}`); };

    if (vehicule !== undefined) push(vehicule.trim(), 'vehicule');
    if (matricule !== undefined) push(matricule.trim(), 'matricule');
    if (utilisation_affectation !== undefined) push(utilisation_affectation.trim(), 'utilisation_affectation');
    if ('chauffeur_responsable' in req.body) push(chauffeur_responsable ?? null, 'chauffeur_responsable');
    if (zone !== undefined) push(zone.trim(), 'zone');
    if ('centre' in req.body) push(centre ?? null, 'centre');

    if (sets.length === 0) {
      res.status(400).json({ error: 'Aucune modification fournie' });
      return;
    }

    params.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE vehicules SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Véhicule introuvable' });
      return;
    }
    res.json(rows[0]);
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ error: 'Ce matricule existe déjà' });
      return;
    }
    console.error('[PATCH /vehicules/:id]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/vehicules/:id
router.delete('/:id', requireAuth, requireRole(...WRITE_ROLES), async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM vehicules WHERE id = $1', [req.params.id]);
    if (!rowCount) {
      res.status(404).json({ error: 'Véhicule introuvable' });
      return;
    }
    res.status(204).send();
  } catch (err: any) {
    if (err.code === '23503') {
      res.status(409).json({ error: 'Impossible de supprimer: véhicule référencé dans des demandes' });
      return;
    }
    console.error('[DELETE /vehicules/:id]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
