import { Request, Response } from 'express'
import { DemandeService } from '../services/demandeService'
import {
  createNotification,
  notifyByRole,
  notifyByRoleAndDept,
  notifyStationDuCentre,
} from '../services/notificationService'
import { CentreService, libelleCentre } from '../services/centreService'
import { getUserCentre } from '../lib/userCentre'
import { AppDataSource } from '../config/database'
import { User } from '../entities/User'
import type { AppRole } from '../types/index'
import { serializeBonWithAssets, serializeDemandeWithAssets } from '../lib/storageAssets'

const demandeService = new DemandeService()
const centreService = new CentreService()

export const getBon = async (req: Request, res: Response): Promise<void> => {
  const dvId = req.params['dvId'] as string
  try {
    const bon = await demandeService.getBon(dvId)
    if (!bon) { res.status(404).json({ error: 'Bon introuvable' }); return }
    res.json(serializeBonWithAssets(req, bon))
  } catch (err) {
    console.error('[GET /demandes/bons/:dvId]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

export const getDemandes = async (req: Request, res: Response): Promise<void> => {
  const { role, sub, departement, circuit_role } = req.user!
  try {
    res.json(await demandeService.findAll(role, sub, departement, circuit_role))
  } catch (err) {
    console.error('[GET /demandes]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

export const getDemande = async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'] as string
  const { role, sub, departement, circuit_role } = req.user!
  try {
    const demande = await demandeService.findById(id, role, sub, departement, circuit_role)
    if (!demande) { res.status(404).json({ error: 'Demande introuvable ou accès refusé' }); return }
    res.json(serializeDemandeWithAssets(req, demande))
  } catch (err) {
    console.error('[GET /demandes/:id]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

export const getHistoriqueVehicules = async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'] as string
  const { role } = req.user!
  try {
    const data = await demandeService.getHistoriqueVehicules(id, role)
    if (data === null) { res.status(404).json({ error: 'Demande introuvable' }); return }
    res.json(data)
  } catch (err: any) {
    if (err.status) { res.status(err.status).json({ error: err.message }); return }
    console.error('[GET /demandes/:id/historique-vehicules]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

export const postDemande = async (req: Request, res: Response): Promise<void> => {
  const { departement, vehicule_ids, centre: centreDemande } =
    req.body as { departement?: string; vehicule_ids?: number[]; centre?: string }

  if (!departement || !Array.isArray(vehicule_ids) || vehicule_ids.length === 0) {
    res.status(400).json({ error: 'departement et vehicule_ids (non vide) requis' }); return
  }

  const { role, sub, departement: userDept } = req.user!

  // Seuls le chef de centre (chef_de_cours) et le chef de département créent des demandes.
  if (role !== 'chef_de_cours' && role !== 'chef_departement') {
    res.status(403).json({ error: 'Seuls le chef de centre et le chef de département peuvent créer une demande' }); return
  }
  const isChefDept = role === 'chef_departement'
  const statutInitial = isChefDept ? 'validee_dept' : 'en_attente'

  try {
    let centre: string
    if (isChefDept) {
      // Chef de département : son département, et un centre choisi qui doit exister et être actif.
      if (!userDept) { res.status(403).json({ error: 'Aucun département associé à votre compte' }); return }
      if (departement !== userDept) {
        res.status(403).json({ error: `Vous ne pouvez créer que des demandes pour votre département (${userDept})` }); return
      }
      const code = await centreService.verifierCode(centreDemande, { actifRequis: true })
      if (!code) { res.status(400).json({ error: 'centre requis' }); return }
      centre = code
    } else {
      // Chef de centre : TOUJOURS son centre, lu en base (le centre envoyé par le navigateur est ignoré).
      const code = await getUserCentre(sub)
      if (!code) { res.status(403).json({ error: 'Aucun centre de rattachement associé à votre compte' }); return }
      if (userDept && departement !== userDept) {
        res.status(403).json({ error: `Vous ne pouvez créer que des demandes pour votre département (${userDept})` }); return
      }
      // Sans département : le DC est réservé au chef de cours DC.
      if (!userDept && departement.trim().toUpperCase() === 'DC') {
        res.status(403).json({ error: 'Les demandes DC sont réservées au chef de cours DC' }); return
      }
      centre = code
    }

    const demande = await demandeService.create(departement, centre, vehicule_ids, sub, statutInitial)
    void triggerCreationNotifications(role, departement, centre, vehicule_ids.length, demande.id)
      .catch((err) => console.error('[notif création demande]', err))
    res.status(201).json({ id: demande.id })
  } catch (err: any) {
    if (err.status) { res.status(err.status).json({ error: err.message }); return }
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
      void triggerStatusNotifications(statut, id, current.departement, current.centre, current.created_by)
        .catch((err) => console.error('[notif changement statut]', err))
    }

    if (situation_soumise) {
      const lib = await libelleCentre(current.centre)
      const msg = `La situation et les bons sont prêts pour signature — département ${current.departement} (${lib})`
      if (current.departement === 'DC') {
        const dcUser = await AppDataSource.getRepository(User).findOne({
          where: { circuit_role: 'directeur_commercial' },
          select: { id: true },
        })
        if (dcUser) void createNotification(dcUser.id, msg, 'signature', id)
          .catch((err) => console.error('[notif soumission situation DC]', err))
      } else {
        void notifyByRoleAndDept('chef_departement', current.departement, msg, 'signature', id)
          .catch((err) => console.error('[notif soumission situation]', err))
      }
    }

    res.json(updated)
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message || 'Erreur serveur' })
  }
}

export const deleteDemande = async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'] as string
  const { role, sub, departement: userDept } = req.user!

  try {
    const result = await demandeService.setAnnulee(id, role, sub, userDept)
    if (!result) { res.status(404).json({ error: 'Demande introuvable' }); return }

    void createNotification(
      result.currentCreatedBy,
      `Votre demande ${result.currentDepartement} (${result.currentCentre}) a été annulée.`,
      'annulation',
      id
    ).catch((err) => console.error('[notif annulation]', err))
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

  const { role, sub, email, departement, circuit_role } = req.user!

  try {
    const result = await demandeService.replaceVehicules(id, vehicule_ids, {
      role,
      userId: sub,
      email,
      departement,
      circuitRole: circuit_role,
    })
    res.json({ message: 'Véhicules mis à jour', ...result })
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message || 'Erreur serveur' })
  }
}

export const patchDemandeVehicule = async (req: Request, res: Response): Promise<void> => {
  const demandeId = req.params['id'] as string
  const dvId = req.params['dvId'] as string
  const { role, sub } = req.user!

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
    const result = await demandeService.patchDemandeVehicule(demandeId, dvId, fields as any, role, sub)

    if (result.promoted && result.promotedDepartement) {
      void libelleCentre(result.promotedCentre)
        .then((lib) => {
          const msg = `Tous les véhicules ravitaillés — demande ${result.promotedDepartement} (${lib}) prête pour validation`
          return Promise.all([
            notifyByRole('Admin',   msg, 'soumission_station', demandeId),
            notifyByRole('MENAGER', msg, 'soumission_station', demandeId),
          ])
        })
        .catch((err) => console.error('[notif véhicules ravitaillés]', err))
    }

    res.json(result.dv)
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message || 'Erreur serveur' })
  }
}

async function triggerCreationNotifications(
  role: AppRole,
  departement: string,
  centre: string,
  nbVehicules: number,
  demandeId: string
): Promise<void> {
  const isChefDept = role === 'chef_departement'
  const isDC = role === 'chef_de_cours' && departement === 'DC'
  const lib = await libelleCentre(centre)

  if (isChefDept) {
    // Station du centre de la demande + Chef Département Achat (tous centres).
    await notifyStationDuCentre(
      centre,
      `Nouvelle demande approuvée pour ${departement} (${lib}) — ravitaillement à effectuer`,
      'validation_dept',
      demandeId,
      departement
    )
  } else if (isDC) {
    const dcUser = await AppDataSource.getRepository(User).findOne({
      where: { circuit_role: 'directeur_commercial' },
      select: { id: true },
    })
    if (dcUser) await createNotification(dcUser.id, `Nouvelle demande DC (${lib}) en attente de votre approbation`, 'nouvelle_demande', demandeId)
  } else {
    await notifyByRoleAndDept(
      'chef_departement',
      departement,
      `Nouvelle demande de ravitaillement — ${departement} — ${lib} (${nbVehicules} véhicule(s))`,
      'nouvelle_demande',
      demandeId
    )
  }
}

async function triggerStatusNotifications(
  newStatut: string,
  demandeId: string,
  departement: string,
  centre: string,
  createdBy: string
): Promise<void> {
  const lib = await libelleCentre(centre)
  switch (newStatut) {
    case 'validee_dept':
      // Station du centre de la demande + Chef Département Achat (tous centres).
      await notifyStationDuCentre(
        centre,
        `Demande approuvée pour ${departement} (${lib}) — ravitaillement à effectuer`,
        'validation_dept',
        demandeId,
        departement
      )
      await createNotification(createdBy, `Votre demande ${departement} (${lib}) a été approuvée.`, 'validation_dept', demandeId)
      break
    case 'validee_station':
      await notifyByRole('Admin',   `Demande ${departement} (${lib}) prête pour validation cellule`, 'soumission_station', demandeId)
      await notifyByRole('MENAGER', `Demande ${departement} (${lib}) prête pour validation cellule`, 'soumission_station', demandeId)
      break
    case 'validee_cellule':
      if (departement === 'DC') {
        const dcUser = await AppDataSource.getRepository(User).findOne({
          where: { circuit_role: 'directeur_commercial' },
          select: { id: true },
        })
        if (dcUser) await createNotification(dcUser.id, `La demande DC (${lib}) a été validée par la cellule.`, 'validation_cellule', demandeId)
      } else {
        await notifyByRoleAndDept(
          'chef_departement', departement,
          `La demande ${departement} (${lib}) a été validée par la cellule.`,
          'validation_cellule', demandeId
        )
      }
      await createNotification(createdBy, `Votre demande ${departement} (${lib}) a été validée.`, 'validation_cellule', demandeId)
      break
    case 'annulee':
      await createNotification(createdBy, `Votre demande ${departement} (${lib}) a été annulée.`, 'annulation', demandeId)
      break
  }
}
