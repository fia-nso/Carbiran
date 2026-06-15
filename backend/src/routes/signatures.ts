import { Router } from 'express';
import pool from '../config/database';
import { requireAuth } from '../middleware/auth';
import { uploadSignature } from '../middleware/upload';
import { notifyByRoles } from '../lib/notifications';

const router = Router();
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// Circuits de signature (miroir de useSignatures.ts)
const CIRCUITS: Record<string, Record<string, string[]>> = {
  situation: {
    default: ['chef_departement', 'directeur_technique', 'chef_cellule', 'directeur_general', 'directrice_financiere'],
    DC:      ['directeur_commercial', 'chef_cellule', 'directeur_general', 'directrice_financiere'],
  },
  bons: {
    default: ['chef_departement', 'chef_cellule', 'directeur_general'],
    DC:      ['directeur_commercial', 'chef_cellule', 'directeur_general'],
  },
};

// GET /api/signatures/:demandeId
router.get('/:demandeId', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, demande_id, role, user_id, signature_url, signe_le, ordre, circuit
       FROM signatures_situation
       WHERE demande_id = $1
       ORDER BY circuit, ordre`,
      [req.params.demandeId]
    );

    // Rafraîchir les URLs depuis signatures_utilisateurs (si l'image a été remplacée)
    if (rows.length > 0) {
      const userIds = [...new Set(rows.map((r: any) => r.user_id))];
      const ph = userIds.map((_, i) => `$${i + 1}`).join(', ');
      const { rows: latest } = await pool.query(
        `SELECT user_id, signature_url FROM signatures_utilisateurs WHERE user_id IN (${ph})`,
        userIds
      );
      const latestMap: Record<string, string> = {};
      for (const l of latest) latestMap[l.user_id] = l.signature_url;
      for (const r of rows) {
        if (latestMap[r.user_id]) r.signature_url = latestMap[r.user_id];
      }
    }

    res.json(rows);
  } catch (err) {
    console.error('[GET /signatures/:demandeId]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/signatures/utilisateur/me
router.get('/utilisateur/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, user_id, role, signature_url, created_at FROM signatures_utilisateurs WHERE user_id = $1',
      [req.user!.sub]
    );
    res.json(rows[0] ?? null);
  } catch (err) {
    console.error('[GET /signatures/utilisateur/me]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/signatures — apposer une signature sur une demande
router.post('/', requireAuth, async (req, res) => {
  const { demande_id, role, ordre, circuit = 'situation', departement = '' } = req.body as {
    demande_id?: string;
    role?: string;
    ordre?: number;
    circuit?: string;
    departement?: string;
  };

  if (!demande_id || !role || ordre == null) {
    res.status(400).json({ error: 'Champs requis: demande_id, role, ordre' });
    return;
  }

  try {
    const { rows: sigRows } = await pool.query(
      'SELECT signature_url FROM signatures_utilisateurs WHERE user_id = $1',
      [req.user!.sub]
    );

    if (!sigRows[0]?.signature_url) {
      res.status(400).json({ error: 'Vous devez d\'abord enregistrer votre signature.' });
      return;
    }

    const { rows } = await pool.query(
      `INSERT INTO signatures_situation (demande_id, role, user_id, signature_url, ordre, circuit)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [demande_id, role, req.user!.sub, sigRows[0].signature_url, ordre, circuit]
    );

    // Notifier le prochain signataire de façon asynchrone
    void notifyNextSigner(demande_id, ordre, circuit, departement);

    res.status(201).json(rows[0]);
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ error: 'Vous avez déjà signé ce document pour ce circuit' });
      return;
    }
    console.error('[POST /signatures]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/signatures/upload — upload de la signature de l'utilisateur connecté
router.post('/upload', requireAuth, uploadSignature.single('signature'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'Fichier de signature requis' });
    return;
  }

  const { circuit_role } = req.body as { circuit_role?: string };
  const url = `${BASE_URL}/uploads/signatures/${req.file.filename}`;

  try {
    const { rows } = await pool.query(
      `INSERT INTO signatures_utilisateurs (user_id, role, signature_url)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET role = $2, signature_url = $3, created_at = now()
       RETURNING *`,
      [req.user!.sub, circuit_role ?? req.user!.role, url]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[POST /signatures/upload]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function notifyNextSigner(
  demandeId: string,
  currentOrdre: number,
  circuit: string,
  departement: string
): Promise<void> {
  const circuitKey = departement === 'DC' ? 'DC' : 'default';
  const steps = CIRCUITS[circuit]?.[circuitKey] ?? [];
  const nextRole = steps[currentOrdre]; // currentOrdre est 1-based, index = currentOrdre

  if (!nextRole) return;

  const label = circuit === 'bons' ? 'bons de carburant' : 'situation des dépenses';
  const msg = `Votre signature est requise pour les ${label} (étape ${currentOrdre + 1} : ${nextRole})`;

  const appRoles = nextRole === 'chef_cellule' ? ['Admin', 'MENAGER'] : ['signataire'];
  await notifyByRoles(appRoles, msg, 'signature_requise', demandeId);
}

export default router;
