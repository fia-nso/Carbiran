import { Router } from 'express';
import pool from '../config/database';
import { requireAuth } from '../middleware/auth';
import {
  createNotification,
  notifyByRole,
  notifyByRoles,
  notifyByRoleAndDept,
} from '../lib/notifications';
import type { AppRole } from '../types/index';

const router = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Construit la clause WHERE selon le rôle de l'utilisateur (miroir des RLS Supabase). */
function buildAccessClause(
  role: AppRole,
  userId: string,
  departement: string | null
): { clause: string; params: unknown[] } {
  switch (role) {
    case 'Admin':
    case 'MENAGER':
      return { clause: '1=1', params: [] };

    case 'chef_departement':
      if (!departement) return { clause: '1=0', params: [] };
      return { clause: 'd.departement = $1', params: [departement] };

    case 'responsable_station':
    case 'responsable_station_viewer':
      return {
        clause: "d.statut IN ('validee_dept','validee_station','validee_cellule')",
        params: [],
      };

    case 'signataire':
      return { clause: "d.statut = 'validee_cellule'", params: [] };

    default:
      // chef_de_cours, viewer — uniquement ses propres demandes
      return { clause: 'd.created_by = $1', params: [userId] };
  }
}

/** Vérifie si la transition de statut est autorisée pour ce rôle. */
function canChangeStatut(
  role: AppRole,
  userId: string,
  userDept: string | null,
  current: { statut: string; departement: string; created_by: string },
  targetStatut: string
): boolean {
  if (role === 'Admin' || role === 'MENAGER') return true;

  if (role === 'chef_departement') {
    return (
      current.departement === userDept &&
      (
        (current.statut === 'en_attente' && targetStatut === 'validee_dept') ||
        targetStatut === 'annulee'
      )
    );
  }

  if (role === 'responsable_station') {
    return (
      (current.statut === 'validee_dept'    && targetStatut === 'validee_station') ||
      (current.statut === 'validee_station' && targetStatut === 'validee_cellule')
    );
  }

  // signataire / directeur_commercial → valider demande DC
  if (role === 'signataire') {
    return current.statut === 'en_attente' && targetStatut === 'validee_dept';
  }

  // chef_de_cours peut annuler sa propre demande en_attente
  if (current.created_by === userId && current.statut === 'en_attente' && targetStatut === 'annulee') {
    return true;
  }

  return false;
}

// ─── GET /api/bons/:dvId — public, vérification QR code ─────────────────────

router.get('/bons/:dvId', async (req, res) => {
  try {
    const { rows: [dv] } = await pool.query(
      `SELECT
         dv.id, dv.demande_id, dv.montant, dv.n_liter, dv.statut,
         v.matricule, v.vehicule AS type_vehicule, v.chauffeur_responsable,
         d.departement, d.created_at AS demande_date,
         (
           SELECT json_agg(json_build_object('id', dv2.id, 'zone', v2.zone) ORDER BY v2.zone)
           FROM demande_vehicules dv2
           JOIN vehicules v2 ON v2.id = dv2.vehicule_id
           WHERE dv2.demande_id = dv.demande_id AND dv2.statut = 'valide'
         ) AS bons_sorted
       FROM demande_vehicules dv
       JOIN vehicules v ON v.id = dv.vehicule_id
       JOIN demandes_ravitaillement d ON d.id = dv.demande_id
       WHERE dv.id = $1`,
      [req.params.dvId]
    );

    if (!dv) { res.status(404).json({ error: 'Bon introuvable' }); return; }

    const sorted = (dv.bons_sorted ?? []) as { id: string; zone: string }[];
    const idx    = sorted.findIndex((b) => b.id === req.params.dvId);

    // Signatures circuit bons avec URLs fraîches
    const { rows: sigRows } = await pool.query(
      `SELECT ss.role, ss.signe_le, su.signature_url
       FROM signatures_situation ss
       JOIN signatures_utilisateurs su ON su.user_id = ss.user_id
       WHERE ss.demande_id = $1 AND ss.circuit = 'bons'
       ORDER BY ss.ordre`,
      [dv.demande_id]
    );

    res.json({
      id:           dv.id,
      demande_id:   dv.demande_id,
      montant:      dv.montant ?? 0,
      n_liter:      dv.n_liter ?? 0,
      statut:       dv.statut,
      matricule:    dv.matricule ?? '—',
      typeVehicule: dv.type_vehicule ?? '—',
      chauffeur:    dv.chauffeur_responsable ?? '—',
      departement:  dv.departement ?? '—',
      date:         dv.demande_date
        ? new Date(dv.demande_date).toLocaleDateString('fr-FR')
        : '—',
      bonNum:     idx >= 0 ? idx + 1 : 1,
      signatures: sigRows,
    });
  } catch (err) {
    console.error('[GET /demandes/bons/:dvId]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── GET /api/demandes ────────────────────────────────────────────────────────

router.get('/', requireAuth, async (req, res) => {
  const { role, sub, departement } = req.user!;
  const { clause, params } = buildAccessClause(role, sub, departement);

  try {
    const { rows } = await pool.query(
      `SELECT
         d.id, d.departement, d.statut, d.situation_soumise,
         d.created_by, d.created_at, d.updated_at,
         u.email                        AS creator_email,
         CONCAT(u.nom, ' ', u.prenom)  AS creator_full_name,
         COALESCE(
           json_agg(
             json_build_object(
               'id',          dv.id,
               'demande_id',  dv.demande_id,
               'vehicule_id', dv.vehicule_id,
               'montant',     dv.montant,
               'n_liter',     dv.n_liter,
               'kilometrage', dv.kilometrage,
               'statut',      dv.statut
             ) ORDER BY dv.created_at
           ) FILTER (WHERE dv.id IS NOT NULL),
           '[]'
         ) AS demande_vehicules
       FROM demandes_ravitaillement d
       LEFT JOIN users u ON u.id = d.created_by
       LEFT JOIN demande_vehicules dv ON dv.demande_id = d.id
       WHERE ${clause}
       GROUP BY d.id, u.email, u.nom, u.prenom
       ORDER BY d.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /demandes]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── GET /api/demandes/:id ────────────────────────────────────────────────────

router.get('/:id', requireAuth, async (req, res) => {
  const { role, sub, departement } = req.user!;
  const { clause, params } = buildAccessClause(role, sub, departement);
  const idIdx = params.length + 1;

  try {
    const { rows } = await pool.query(
      `SELECT d.id, d.departement, d.statut, d.situation_soumise,
              d.created_by, d.created_at, d.updated_at,
              u.email AS creator_email, CONCAT(u.nom, ' ', u.prenom) AS creator_full_name
       FROM demandes_ravitaillement d
       LEFT JOIN users u ON u.id = d.created_by
       WHERE (${clause}) AND d.id = $${idIdx}`,
      [...params, req.params.id]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Demande introuvable ou accès refusé' });
      return;
    }

    // Charger les véhicules + photos
    const { rows: dvRows } = await pool.query(
      `SELECT
         dv.id, dv.demande_id, dv.vehicule_id, dv.montant, dv.n_liter,
         dv.kilometrage, dv.statut, dv.created_at,
         json_build_object(
           'id',                     v.id,
           'vehicule',               v.vehicule,
           'matricule',              v.matricule,
           'zone',                   v.zone,
           'utilisationAffectation', v.utilisation_affectation,
           'chauffeurResponsable',   v.chauffeur_responsable,
           'centre',                 v.centre
         ) AS vehicule,
         COALESCE(
           json_agg(
             json_build_object(
               'id',                  p.id,
               'demande_vehicule_id', p.demande_vehicule_id,
               'url',                 p.url,
               'type',                p.type,
               'uploaded_at',         p.uploaded_at
             ) ORDER BY p.uploaded_at
           ) FILTER (WHERE p.id IS NOT NULL),
           '[]'
         ) AS photos
       FROM demande_vehicules dv
       JOIN vehicules v ON v.id = dv.vehicule_id
       LEFT JOIN photos_justification p ON p.demande_vehicule_id = dv.id
       WHERE dv.demande_id = $1
       GROUP BY dv.id, v.id
       ORDER BY dv.created_at`,
      [req.params.id]
    );

    const demande = rows[0];
    res.json({
      ...demande,
      creator: { email: demande.creator_email, full_name: demande.creator_full_name },
      demande_vehicules: dvRows,
    });
  } catch (err) {
    console.error('[GET /demandes/:id]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── POST /api/demandes ───────────────────────────────────────────────────────

router.post('/', requireAuth, async (req, res) => {
  const { departement, vehicule_ids } = req.body as {
    departement?: string;
    vehicule_ids?: number[];
  };

  if (!departement || !Array.isArray(vehicule_ids) || vehicule_ids.length === 0) {
    res.status(400).json({ error: 'departement et vehicule_ids (non vide) requis' });
    return;
  }

  const { role, sub, departement: userDept } = req.user!;
  const isChefDept = role === 'chef_departement';
  const isDC = role === 'chef_de_cours' && departement === 'DC';
  const statutInitial = isChefDept ? 'validee_dept' : 'en_attente';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [demande] } = await client.query(
      `INSERT INTO demandes_ravitaillement (departement, statut, created_by)
       VALUES ($1, $2, $3) RETURNING id`,
      [departement, statutInitial, sub]
    );

    // Insérer les véhicules en une seule requête
    const dvVals = vehicule_ids.map((_, i) => `($1, $${i + 2}, 'en_attente')`).join(', ');
    await client.query(
      `INSERT INTO demande_vehicules (demande_id, vehicule_id, statut) VALUES ${dvVals}`,
      [demande.id, ...vehicule_ids]
    );

    await client.query('COMMIT');

    void triggerCreationNotifications(role, departement, vehicule_ids.length, demande.id, sub, userDept);

    res.status(201).json({ id: demande.id });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /demandes]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    client.release();
  }
});

// ─── PATCH /api/demandes/:id ──────────────────────────────────────────────────

router.patch('/:id', requireAuth, async (req, res) => {
  const { statut, situation_soumise } = req.body as {
    statut?: string;
    situation_soumise?: boolean;
  };

  if (statut === undefined && situation_soumise === undefined) {
    res.status(400).json({ error: 'statut ou situation_soumise requis' });
    return;
  }

  const { role, sub, departement: userDept } = req.user!;

  try {
    const { rows: [current] } = await pool.query(
      'SELECT statut, departement, created_by FROM demandes_ravitaillement WHERE id = $1',
      [req.params.id]
    );

    if (!current) {
      res.status(404).json({ error: 'Demande introuvable' });
      return;
    }

    // Vérifier permission si changement de statut
    if (statut !== undefined && !canChangeStatut(role, sub, userDept, current, statut)) {
      res.status(403).json({ error: 'Transition de statut non autorisée' });
      return;
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    const push = (val: unknown, col: string) => { params.push(val); sets.push(`${col} = $${params.length}`); };

    if (statut !== undefined) push(statut, 'statut');
    if (situation_soumise !== undefined) push(situation_soumise, 'situation_soumise');

    params.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE demandes_ravitaillement SET ${sets.join(', ')}
       WHERE id = $${params.length}
       RETURNING *`,
      params
    );

    if (statut) {
      void triggerStatusNotifications(statut, req.params.id as string, current.departement, current.created_by);
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('[PATCH /demandes/:id]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── DELETE /api/demandes/:id — annuler (met le statut à 'annulee') ───────────

router.delete('/:id', requireAuth, async (req, res) => {
  const { role, sub } = req.user!;

  try {
    const { rows: [current] } = await pool.query(
      'SELECT statut, departement, created_by FROM demandes_ravitaillement WHERE id = $1',
      [req.params.id]
    );

    if (!current) {
      res.status(404).json({ error: 'Demande introuvable' });
      return;
    }

    const canCancel =
      role === 'Admin' ||
      role === 'MENAGER' ||
      (role === 'chef_departement' && ['en_attente', 'validee_dept'].includes(current.statut)) ||
      (current.created_by === sub && current.statut === 'en_attente');

    if (!canCancel) {
      res.status(403).json({ error: 'Annulation non autorisée' });
      return;
    }

    await pool.query(
      "UPDATE demandes_ravitaillement SET statut = 'annulee' WHERE id = $1",
      [req.params.id]
    );

    void createNotification(
      current.created_by,
      `Votre demande ${current.departement} a été annulée.`,
      'annulation',
      req.params.id as string
    );

    res.status(204).send();
  } catch (err) {
    console.error('[DELETE /demandes/:id]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── PATCH /api/demandes/:id/vehicules — remplacer tous les véhicules ─────────

router.patch('/:id/vehicules', requireAuth, async (req, res) => {
  const { vehicule_ids } = req.body as { vehicule_ids?: number[] };

  if (!Array.isArray(vehicule_ids)) {
    res.status(400).json({ error: 'vehicule_ids (tableau) requis' });
    return;
  }

  const { role, sub } = req.user!;

  const { rows: [demande] } = await pool.query(
    'SELECT statut, created_by FROM demandes_ravitaillement WHERE id = $1',
    [req.params.id]
  );

  if (!demande) {
    res.status(404).json({ error: 'Demande introuvable' });
    return;
  }

  const canEdit =
    role === 'Admin' ||
    role === 'MENAGER' ||
    (demande.created_by === sub && demande.statut === 'en_attente');

  if (!canEdit) {
    res.status(403).json({ error: 'Modification non autorisée' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Supprimer les photos liées aux anciens véhicules
    await client.query(
      `DELETE FROM photos_justification
       WHERE demande_vehicule_id IN (
         SELECT id FROM demande_vehicules WHERE demande_id = $1
       )`,
      [req.params.id]
    );

    await client.query('DELETE FROM demande_vehicules WHERE demande_id = $1', [req.params.id]);

    if (vehicule_ids.length > 0) {
      const vals = vehicule_ids.map((_, i) => `($1, $${i + 2}, 'en_attente')`).join(', ');
      await client.query(
        `INSERT INTO demande_vehicules (demande_id, vehicule_id, statut) VALUES ${vals}`,
        [req.params.id, ...vehicule_ids]
      );
    }

    await client.query('COMMIT');
    res.json({ message: 'Véhicules mis à jour' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[PATCH /demandes/:id/vehicules]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    client.release();
  }
});

// ─── PATCH /api/demandes/:id/vehicules/:dvId — saisir ravitaillement ──────────

router.patch('/:id/vehicules/:dvId', requireAuth, async (req, res) => {
  const { role } = req.user!;

  if (!['Admin', 'MENAGER', 'responsable_station'].includes(role)) {
    res.status(403).json({ error: 'Accès refusé' });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const allowedFields: Record<string, string> = {
    montant: 'montant',
    n_liter: 'n_liter',
    kilometrage: 'kilometrage',
    statut: 'statut',
  };

  const sets: string[] = [];
  const params: unknown[] = [];

  for (const [key, col] of Object.entries(allowedFields)) {
    if (key in body) {
      params.push(body[key]);
      sets.push(`${col} = $${params.length}`);
    }
  }

  if (sets.length === 0) {
    res.status(400).json({ error: 'Aucune modification fournie' });
    return;
  }

  params.push(req.params.dvId, req.params.id);
  const dvIdx      = params.length - 1;
  const demandeIdx = params.length;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `UPDATE demande_vehicules SET ${sets.join(', ')}
       WHERE id = $${dvIdx} AND demande_id = $${demandeIdx}
       RETURNING *`,
      params
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Véhicule de demande introuvable' });
      return;
    }

    // Quand un véhicule passe à 'ravitaille', vérifier si tous sont ravitaillés
    if (body['statut'] === 'ravitaille') {
      const { rows: allDvs } = await client.query(
        'SELECT statut FROM demande_vehicules WHERE demande_id = $1',
        [req.params.id]
      );

      if (allDvs.every((dv: any) => dv.statut === 'ravitaille')) {
        const { rows: [updated] } = await client.query(
          `UPDATE demandes_ravitaillement SET statut = 'validee_station'
           WHERE id = $1 AND statut IN ('validee_dept','en_attente')
           RETURNING departement`,
          [req.params.id]
        );
        if (updated) {
          void Promise.all([
            notifyByRole('Admin',   'Tous les véhicules ravitaillés — demande prête pour validation', 'soumission_station', req.params.id as string),
            notifyByRole('MENAGER', 'Tous les véhicules ravitaillés — demande prête pour validation', 'soumission_station', req.params.id as string),
          ]);
        }
      }
    }

    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[PATCH /demandes/:id/vehicules/:dvId]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    client.release();
  }
});

// ─── Helpers notification ─────────────────────────────────────────────────────

async function triggerCreationNotifications(
  role: AppRole,
  departement: string,
  nbVehicules: number,
  demandeId: string,
  createdBy: string,
  userDept: string | null
): Promise<void> {
  const isChefDept = role === 'chef_departement';
  const isDC = role === 'chef_de_cours' && departement === 'DC';

  if (isChefDept) {
    await notifyByRoles(
      ['responsable_station', 'responsable_station_viewer'],
      `Nouvelle demande approuvée pour ${departement} — ravitaillement à effectuer`,
      'validation_dept',
      demandeId
    );
  } else if (isDC) {
    await notifyByRole(
      'signataire',
      'Nouvelle demande DC en attente de votre approbation',
      'nouvelle_demande',
      demandeId
    );
  } else {
    await notifyByRoleAndDept(
      'chef_departement',
      departement,
      `Nouvelle demande de ravitaillement — ${departement} (${nbVehicules} véhicule(s))`,
      'nouvelle_demande',
      demandeId
    );
  }
}

async function triggerStatusNotifications(
  newStatut: string,
  demandeId: string,
  departement: string,
  createdBy: string
): Promise<void> {
  switch (newStatut) {
    case 'validee_dept':
      await notifyByRoles(
        ['responsable_station', 'responsable_station_viewer'],
        `Demande approuvée pour ${departement} — ravitaillement à effectuer`,
        'validation_dept',
        demandeId
      );
      await createNotification(createdBy, 'Votre demande a été approuvée.', 'validation_dept', demandeId);
      break;

    case 'validee_station':
      await notifyByRole('Admin',   `Demande ${departement} prête pour validation cellule`, 'soumission_station', demandeId);
      await notifyByRole('MENAGER', `Demande ${departement} prête pour validation cellule`, 'soumission_station', demandeId);
      break;

    case 'validee_cellule':
      await notifyByRoleAndDept(
        'chef_departement', departement,
        `La demande ${departement} a été validée par la cellule.`,
        'validation_cellule', demandeId
      );
      await createNotification(createdBy, `Votre demande ${departement} a été validée.`, 'validation_cellule', demandeId);
      break;

    case 'annulee':
      await createNotification(createdBy, `Votre demande ${departement} a été annulée.`, 'annulation', demandeId);
      break;
  }
}

export default router;
