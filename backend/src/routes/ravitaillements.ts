import { Router } from 'express';
import pool from '../config/database';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();
const WRITE_ROLES = ['Admin', 'MENAGER'];

// GET /api/ravitaillements
router.get('/', requireAuth, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         r.id, r.date, r.vehicule_id, r.montant_ravitaille, r.commentaire,
         r.kilometrage, r.n_liter, r.created_at, r.updated_at,
         json_build_object(
           'id',                      v.id,
           'vehicule',                v.vehicule,
           'matricule',               v.matricule,
           'zone',                    v.zone,
           'utilisationAffectation',  v.utilisation_affectation,
           'chauffeurResponsable',    v.chauffeur_responsable,
           'centre',                  v.centre
         ) AS vehicule
       FROM ravitaillements_vehicules r
       JOIN vehicules v ON v.id = r.vehicule_id
       ORDER BY r.date DESC, r.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /ravitaillements]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/ravitaillements/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.*, json_build_object('vehicule', v.vehicule, 'matricule', v.matricule, 'zone', v.zone) AS vehicule
       FROM ravitaillements_vehicules r
       JOIN vehicules v ON v.id = r.vehicule_id
       WHERE r.id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) {
      res.status(404).json({ error: 'Ravitaillement introuvable' });
      return;
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('[GET /ravitaillements/:id]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/ravitaillements
router.post('/', requireAuth, requireRole(...WRITE_ROLES), async (req, res) => {
  const { date, vehicule_id, montant_ravitaille, commentaire, kilometrage, n_liter } =
    req.body as {
      date?: string;
      vehicule_id?: number;
      montant_ravitaille?: number;
      commentaire?: string;
      kilometrage?: number;
      n_liter?: number;
    };

  if (!date || vehicule_id == null || montant_ravitaille == null) {
    res.status(400).json({ error: 'Champs obligatoires: date, vehicule_id, montant_ravitaille' });
    return;
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO ravitaillements_vehicules
         (date, vehicule_id, montant_ravitaille, commentaire, kilometrage, n_liter)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [date, vehicule_id, montant_ravitaille, commentaire ?? '', kilometrage ?? 0, n_liter ?? 0]
    );
    res.status(201).json(rows[0]);
  } catch (err: any) {
    if (err.code === '23503') {
      res.status(404).json({ error: 'Véhicule introuvable' });
      return;
    }
    console.error('[POST /ravitaillements]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /api/ravitaillements/:id
router.patch('/:id', requireAuth, requireRole(...WRITE_ROLES), async (req, res) => {
  const { date, vehicule_id, montant_ravitaille, commentaire, kilometrage, n_liter } =
    req.body as {
      date?: string;
      vehicule_id?: number;
      montant_ravitaille?: number;
      commentaire?: string;
      kilometrage?: number;
      n_liter?: number;
    };

  const sets: string[] = [];
  const params: unknown[] = [];
  const push = (val: unknown, col: string) => { params.push(val); sets.push(`${col} = $${params.length}`); };

  if (date !== undefined) push(date, 'date');
  if (vehicule_id !== undefined) push(vehicule_id, 'vehicule_id');
  if (montant_ravitaille !== undefined) push(montant_ravitaille, 'montant_ravitaille');
  if (commentaire !== undefined) push(commentaire, 'commentaire');
  if (kilometrage !== undefined) push(kilometrage, 'kilometrage');
  if (n_liter !== undefined) push(n_liter, 'n_liter');

  if (sets.length === 0) {
    res.status(400).json({ error: 'Aucune modification fournie' });
    return;
  }

  try {
    params.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE ravitaillements_vehicules SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (rows.length === 0) {
      res.status(404).json({ error: 'Ravitaillement introuvable' });
      return;
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('[PATCH /ravitaillements/:id]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/ravitaillements/:id
router.delete('/:id', requireAuth, requireRole(...WRITE_ROLES), async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM ravitaillements_vehicules WHERE id = $1',
      [req.params.id]
    );
    if (!rowCount) {
      res.status(404).json({ error: 'Ravitaillement introuvable' });
      return;
    }
    res.status(204).send();
  } catch (err) {
    console.error('[DELETE /ravitaillements/:id]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
