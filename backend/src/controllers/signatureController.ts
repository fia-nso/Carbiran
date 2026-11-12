import { Request, Response } from 'express'
import { SignatureService } from '../services/signatureService'
import type { RoleANotifier } from '../services/signatureService'
import { notifyByRoles, notifyByCircuitRole } from '../services/notificationService'
import {
  deleteStoredAssetFile,
  resolveStoredSignatureFilename,
  serializeSignatureLike,
} from '../lib/storageAssets'

const signatureService = new SignatureService()

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

export const postSignerDocuments = async (req: Request, res: Response): Promise<void> => {
  const { demande_id } = req.body as { demande_id?: string }

  if (!demande_id) {
    res.status(400).json({ error: 'Champ requis: demande_id' }); return
  }

  try {
    const { signatures, departement, aNotifier } = await signatureService.signerDocuments(demande_id, req.user!)

    notifyNextSigners(demande_id, departement, aNotifier).catch((err) => {
      console.error('[POST /signatures/signer] notifications', err)
    })

    res.status(signatures.length > 0 ? 201 : 200).json({
      signatures: signatures.map((signature) => serializeSignatureLike(req, signature)),
    })
  } catch (err: any) {
    if (err.status) {
      res.status(err.status).json({ error: err.message }); return
    }
    if (err.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ error: 'Ce document a déjà été signé pour ce rôle.' }); return
    }
    console.error('[POST /signatures/signer]', err)
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

async function notifyNextSigners(
  demandeId: string,
  departement: string,
  aNotifier: RoleANotifier[]
): Promise<void> {
  await Promise.all(
    aNotifier.map(({ role, manquants }) => {
      const documents = manquants.length === 2
        ? 'la situation des dépenses et les bons de carburant'
        : manquants[0] === 'bons' ? 'les bons de carburant' : 'la situation des dépenses'
      const msg = `Votre signature est requise pour ${documents} — département ${departement}`

      return role === 'chef_cellule'
        ? notifyByRoles(['Admin', 'MENAGER'], msg, 'signature', demandeId, departement)
        : notifyByCircuitRole(role, msg, 'signature', demandeId, departement)
    })
  )
}
