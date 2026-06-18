import { Request, Response } from 'express'
import { DemandeService } from '../services/demandeService'
import {
  createNotification,
  notifyByRole,
  notifyByRoles,
  notifyByRoleAndDept,
} from '../services/notificationService'
import type { AppRole } from '../types/index'

const demandeService = new DemandeService()

export const getBon = async (req: Request, res: Response): Promise<void> => {
  const dvId = req.params['dvId'] as string
  try {
    const bon = await demandeService.getBon(dvId)
    if (!bon) { res.status(404).json({ error: 'Bon introuvable' }); return }
    res.json(bon)
  } catch (err) {
    console.error('[GET /demandes/bons/:dvId]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

export const getDemandes = async (req: Request, res: Response): Promise<void> => {
  const { role, sub, departement } = req.user!
  try {
    res.json(await demandeService.findAll(role, sub, departement))
  } catch (err) {
    console.error('[GET /demandes]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

export const getDemande = async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'] as string
  const { role, sub, departement } = req.user!
  try {
    const demande = await demandeService.findById(id, role, sub, departement)
    if (!demande) { res.status(404).json({ error: 'Demande introuvable ou accès refusé' }); return }
    res.json(demande)
  } catch (err) {
    console.error('[GET /demandes/:id]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

export const postDemande = async (req: Request, res: Response): Promise<void> => {
  const { departement, vehicule_ids } = req.body as { departement?: string; vehicule_ids?: number[] }

  if (!departement || !Array.isArray(vehicule_ids) || vehicule_ids.length === 0) {
    res.status(400).json({ error: 'departement et vehicule_ids (non vide) requis' }); return
  }

  const { role, sub, departement: userDept } = req.user!
  const isChefDept = role === 'chef_departement'
  const statutInitial = isChefDept ? 'validee_dept' : 'en_attente'

  try {
    const demande = await demandeService.create(departement, vehicule_ids, sub, statutInitial)
    void triggerCreationNotifications(role, departement, vehicule_ids.length, demande.id, userDept)
    res.status(201).json({ id: demande.id })
  } catch (err) {
    console.error('[POST /demandes]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

export const patchDemande = async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'] as string
  const { statut, situation_soumise } = req.body as { statut?: string; situation_soumise?: boolean }

  if (statut === undefined && situation_soumise === undefined) {
    res.status(400).json({ error: 'statut ou situation_soumise requis' }); return
  }

  const { role, sub, departement: userDept } = req.user!

  try {
    const current = await demandeService.findRaw(id)
    if (!current) { res.status(404).json({ error: 'Demande introuvable' }); return }

    const updated = await demandeService.patch(id, { statut, situation_soumise }, role, sub, userDept)

    if (statut) {
      void triggerStatusNotifications(statut, id, current.departement, current.created_by)
    }

    res.json(updated)
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message || 'Erreur serveur' })
  }
}

export const deleteDemande = async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'] as string
  const { role, sub } = req.user!

  try {
    const result = await demandeService.setAnnulee(id, role, sub)
    if (!result) { res.status(404).json({ error: 'Demande introuvable' }); return }

    void createNotification(
      result.currentCreatedBy,
      `Votre demande ${result.currentDepartement} a été annulée.`,
      'annulation',
      id
    )
    res.status(204).send()
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message || 'Erreur serveur' })
  }
}

export const replaceDemandeVehicules = async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'] as string
  const { vehicule_ids } = req.body as { vehicule_ids?: number[] }

  if (!Array.isArray(vehicule_ids)) {
    res.status(400).json({ error: 'vehicule_ids (tableau) requis' }); return
  }

  const { role, sub } = req.user!

  try {
    await demandeService.replaceVehicules(id, vehicule_ids, role, sub)
    res.json({ message: 'Véhicules mis à jour' })
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message || 'Erreur serveur' })
  }
}

export const patchDemandeVehicule = async (req: Request, res: Response): Promise<void> => {
  const demandeId = req.params['id'] as string
  const dvId = req.params['dvId'] as string
  const { role } = req.user!

  const body = req.body as Record<string, unknown>
  const allowed = ['montant', 'n_liter', 'kilometrage', 'statut']
  const fields: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) fields[key] = body[key]
  }

  if (Object.keys(fields).length === 0) {
    res.status(400).json({ error: 'Aucune modification fournie' }); return
  }

  try {
    const result = await demandeService.patchDemandeVehicule(demandeId, dvId, fields as any, role)

    if (result.promoted && result.promotedDepartement) {
      void Promise.all([
        notifyByRole('Admin',   'Tous les véhicules ravitaillés — demande prête pour validation', 'soumission_station', demandeId),
        notifyByRole('MENAGER', 'Tous les véhicules ravitaillés — demande prête pour validation', 'soumission_station', demandeId),
      ])
    }

    res.json(result.dv)
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message || 'Erreur serveur' })
  }
}

async function triggerCreationNotifications(
  role: AppRole,
  departement: string,
  nbVehicules: number,
  demandeId: string,
  _userDept: string | null
): Promise<void> {
  const isChefDept = role === 'chef_departement'
  const isDC = role === 'chef_de_cours' && departement === 'DC'

  if (isChefDept) {
    await notifyByRoles(
      ['responsable_station', 'responsable_station_viewer'],
      `Nouvelle demande approuvée pour ${departement} — ravitaillement à effectuer`,
      'validation_dept',
      demandeId
    )
  } else if (isDC) {
    await notifyByRole(
      'signataire',
      'Nouvelle demande DC en attente de votre approbation',
      'nouvelle_demande',
      demandeId
    )
  } else {
    await notifyByRoleAndDept(
      'chef_departement',
      departement,
      `Nouvelle demande de ravitaillement — ${departement} (${nbVehicules} véhicule(s))`,
      'nouvelle_demande',
      demandeId
    )
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
      )
      await createNotification(createdBy, 'Votre demande a été approuvée.', 'validation_dept', demandeId)
      break
    case 'validee_station':
      await notifyByRole('Admin',   `Demande ${departement} prête pour validation cellule`, 'soumission_station', demandeId)
      await notifyByRole('MENAGER', `Demande ${departement} prête pour validation cellule`, 'soumission_station', demandeId)
      break
    case 'validee_cellule':
      await notifyByRoleAndDept(
        'chef_departement', departement,
        `La demande ${departement} a été validée par la cellule.`,
        'validation_cellule', demandeId
      )
      await createNotification(createdBy, `Votre demande ${departement} a été validée.`, 'validation_cellule', demandeId)
      break
    case 'annulee':
      await createNotification(createdBy, `Votre demande ${departement} a été annulée.`, 'annulation', demandeId)
      break
  }
}
