import { Request, Response } from 'express'
import { SignatureService } from '../services/signatureService'
import { notifyByRoles, createNotification } from '../services/notificationService'
import { AppDataSource } from '../config/database'
import { User } from '../entities/User'
import {
  deleteStoredAssetFile,
  resolveStoredSignatureFilename,
  serializeSignatureLike,
} from '../lib/storageAssets'

const signatureService = new SignatureService()

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
    const signatures = await signatureService.findByDemandeId(demandeId)
    res.json(signatures.map((signature) => serializeSignatureLike(req, signature)))
  } catch (err) {
    console.error('[GET /signatures/:demandeId]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

export const getSignatureUtilisateur = async (req: Request, res: Response): Promise<void> => {
  try {
    const signature = await signatureService.findUtilisateurByUserId(req.user!.sub)
    res.json(signature ? serializeSignatureLike(req, signature) : null)
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
    res.status(400).json({ error: 'Champs requis: demande_id, role, ordre' }); return
  }

  try {
    const signatureUrl = await signatureService.findUserSignatureUrl(req.user!.sub)
    if (!signatureUrl) {
      res.status(400).json({ error: "Vous devez d'abord enregistrer votre signature." }); return
    }

    const sig = await signatureService.createSignature({
      demande_id, role, user_id: req.user!.sub, signature_url: signatureUrl, ordre, circuit,
    })

    void notifyNextSigner(demande_id, ordre, circuit, departement)

    res.status(201).json(serializeSignatureLike(req, sig))
  } catch (err: any) {
    if (err.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ error: 'Vous avez déjà signé ce document pour ce circuit' }); return
    }
    console.error('[POST /signatures]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

export const uploadSignatureHandler = async (req: Request, res: Response): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: 'Fichier de signature requis' }); return }

  const { circuit_role } = req.body as { circuit_role?: string }
  const previousSignature = await signatureService.findUtilisateurByUserId(req.user!.sub)

  try {
    const su = await signatureService.upsertSignatureUtilisateur(
      req.user!.sub,
      circuit_role ?? req.user!.role,
      req.file.filename
    )

    const previousFilename = previousSignature
      ? resolveStoredSignatureFilename(previousSignature)
      : null
    if (previousFilename && previousFilename !== req.file.filename) {
      deleteStoredAssetFile('signatures', previousFilename)
    }

    res.status(201).json(serializeSignatureLike(req, su))
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
  const msg = `Votre signature est requise pour les ${label} — département ${departement} (étape ${currentOrdre + 1})`

  if (nextRole === 'chef_cellule') {
    await notifyByRoles(['Admin', 'MENAGER'], msg, 'signature', demandeId, departement)
  } else {
    const userRepo = AppDataSource.getRepository(User)
    const nextUser = await userRepo.findOne({
      where: { circuit_role: nextRole },
      select: { id: true },
    })
    if (nextUser) {
      await createNotification(nextUser.id, msg, 'signature', demandeId, departement)
    }
  }
}
