import { Request, Response } from 'express'
import {
  findSignaturesByDemandeId,
  findLatestSignatureUrls,
  findSignatureUtilisateur,
  findUserSignatureUrl,
  createSignature,
  upsertSignatureUtilisateur,
} from '../models/Signature'
import { notifyByRoles } from '../lib/notifications'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

const CIRCUITS: Record<string, Record<string, string[]>> = {
  situation: {
    default: ['chef_departement', 'directeur_technique', 'chef_cellule', 'directeur_general', 'directrice_financiere'],
    DC:      ['directeur_commercial', 'chef_cellule', 'directeur_general', 'directrice_financiere'],
  },
  bons: {
    default: ['chef_departement', 'chef_cellule', 'directeur_general'],
    DC:      ['directeur_commercial', 'chef_cellule', 'directeur_general'],
  },
}

export const getSignatures = async (req: Request, res: Response): Promise<void> => {
  const demandeId = req.params['demandeId'] as string
  try {
    const { rows } = await findSignaturesByDemandeId(demandeId)

    if (rows.length > 0) {
      const userIds = [...new Set(rows.map((r: any) => r.user_id as string))]
      const { rows: latest } = await findLatestSignatureUrls(userIds)
      const latestMap: Record<string, string> = {}
      for (const l of latest) latestMap[l.user_id] = l.signature_url
      for (const r of rows) {
        if (latestMap[r.user_id]) r.signature_url = latestMap[r.user_id]
      }
    }

    res.json(rows)
  } catch (err) {
    console.error('[GET /signatures/:demandeId]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

export const getSignatureUtilisateur = async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await findSignatureUtilisateur(req.user!.sub)
    res.json(rows[0] ?? null)
  } catch (err) {
    console.error('[GET /signatures/utilisateur/me]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

export const postSignature = async (req: Request, res: Response): Promise<void> => {
  const { demande_id, role, ordre, circuit = 'situation', departement = '' } = req.body as {
    demande_id?: string
    role?: string
    ordre?: number
    circuit?: string
    departement?: string
  }

  if (!demande_id || !role || ordre == null) {
    res.status(400).json({ error: 'Champs requis: demande_id, role, ordre' })
    return
  }

  try {
    const { rows: sigRows } = await findUserSignatureUrl(req.user!.sub)

    if (!sigRows[0]?.signature_url) {
      res.status(400).json({ error: "Vous devez d'abord enregistrer votre signature." })
      return
    }

    const { rows } = await createSignature(
      demande_id, role, req.user!.sub, sigRows[0].signature_url, ordre, circuit
    )

    void notifyNextSigner(demande_id, ordre, circuit, departement)

    res.status(201).json(rows[0])
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ error: 'Vous avez déjà signé ce document pour ce circuit' })
      return
    }
    console.error('[POST /signatures]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

export const uploadSignatureHandler = async (req: Request, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: 'Fichier de signature requis' })
    return
  }

  const { circuit_role } = req.body as { circuit_role?: string }
  const url = `${BASE_URL}/uploads/signatures/${req.file.filename}`

  try {
    const { rows } = await upsertSignatureUtilisateur(
      req.user!.sub,
      circuit_role ?? req.user!.role,
      url
    )
    res.status(201).json(rows[0])
  } catch (err) {
    console.error('[POST /signatures/upload]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

async function notifyNextSigner(
  demandeId: string,
  currentOrdre: number,
  circuit: string,
  departement: string
): Promise<void> {
  const circuitKey = departement === 'DC' ? 'DC' : 'default'
  const steps = CIRCUITS[circuit]?.[circuitKey] ?? []
  const nextRole = steps[currentOrdre]

  if (!nextRole) return

  const label = circuit === 'bons' ? 'bons de carburant' : 'situation des dépenses'
  const msg = `Votre signature est requise pour les ${label} (étape ${currentOrdre + 1} : ${nextRole})`

  const appRoles = nextRole === 'chef_cellule' ? ['Admin', 'MENAGER'] : ['signataire']
  await notifyByRoles(appRoles, msg, 'signature_requise', demandeId)
}
