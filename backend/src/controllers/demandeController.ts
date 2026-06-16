import { Request, Response } from 'express'
import pool from '../config/database'
import {
  findDemandes,
  findDemandeHeader,
  findDemandeVehicules,
  findDemandeRaw,
  createDemande,
  insertDemandeVehicules,
  updateDemande,
  setDemandeAnnulee,
  findBon,
  findSignaturesBon,
  deleteDemandePhotos,
  deleteDemandeVehicules,
  findDemandeVehiculeStatuts,
  updateDemandeVehicule,
  promoteDemandeToStation,
} from '../models/Demande'
import {
  createNotification,
  notifyByRole,
  notifyByRoles,
  notifyByRoleAndDept,
} from '../lib/notifications'
import type { AppRole } from '../types/index'

function buildAccessClause(
  role: AppRole,
  userId: string,
  departement: string | null
): { clause: string; params: unknown[] } {
  switch (role) {
    case 'Admin':
    case 'MENAGER':
      return { clause: '1=1', params: [] }

    case 'chef_departement':
      if (!departement) return { clause: '1=0', params: [] }
      return { clause: 'd.departement = $1', params: [departement] }

    case 'responsable_station':
    case 'responsable_station_viewer':
      return {
        clause: "d.statut IN ('validee_dept','validee_station','validee_cellule')",
        params: [],
      }

    case 'signataire':
      return { clause: "d.statut = 'validee_cellule'", params: [] }

    default:
      return { clause: 'd.created_by = $1', params: [userId] }
  }
}

function canChangeStatut(
  role: AppRole,
  userId: string,
  userDept: string | null,
  current: { statut: string; departement: string; created_by: string },
  targetStatut: string
): boolean {
  if (role === 'Admin' || role === 'MENAGER') return true

  if (role === 'chef_departement') {
    return (
      current.departement === userDept &&
      (
        (current.statut === 'en_attente' && targetStatut === 'validee_dept') ||
        targetStatut === 'annulee'
      )
    )
  }

  if (role === 'responsable_station') {
    return (
      (current.statut === 'validee_dept'    && targetStatut === 'validee_station') ||
      (current.statut === 'validee_station' && targetStatut === 'validee_cellule')
    )
  }

  if (role === 'signataire') {
    return current.statut === 'en_attente' && targetStatut === 'validee_dept'
  }

  if (current.created_by === userId && current.statut === 'en_attente' && targetStatut === 'annulee') {
    return true
  }

  return false
}

export const getBon = async (req: Request, res: Response): Promise<void> => {
  const dvId = req.params['dvId'] as string
  try {
    const { rows: [dv] } = await findBon(dvId)

    if (!dv) {
      res.status(404).json({ error: 'Bon introuvable' })
      return
    }

    const sorted = (dv.bons_sorted ?? []) as { id: string; zone: string }[]
    const idx    = sorted.findIndex((b) => b.id === dvId)

    const { rows: sigRows } = await findSignaturesBon(dv.demande_id as string)

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
    })
  } catch (err) {
    console.error('[GET /demandes/bons/:dvId]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

export const getDemandes = async (req: Request, res: Response): Promise<void> => {
  const { role, sub, departement } = req.user!
  const { clause, params } = buildAccessClause(role, sub, departement)

  try {
    const { rows } = await findDemandes(clause, params)
    res.json(rows)
  } catch (err) {
    console.error('[GET /demandes]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

export const getDemande = async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'] as string
  const { role, sub, departement } = req.user!
  const { clause, params } = buildAccessClause(role, sub, departement)

  try {
    const { rows } = await findDemandeHeader(clause, params, id)

    if (rows.length === 0) {
      res.status(404).json({ error: 'Demande introuvable ou accès refusé' })
      return
    }

    const { rows: dvRows } = await findDemandeVehicules(id)

    const demande = rows[0]
    res.json({
      ...demande,
      creator: { email: demande.creator_email, full_name: demande.creator_full_name },
      demande_vehicules: dvRows,
    })
  } catch (err) {
    console.error('[GET /demandes/:id]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

export const postDemande = async (req: Request, res: Response): Promise<void> => {
  const { departement, vehicule_ids } = req.body as {
    departement?: string
    vehicule_ids?: number[]
  }

  if (!departement || !Array.isArray(vehicule_ids) || vehicule_ids.length === 0) {
    res.status(400).json({ error: 'departement et vehicule_ids (non vide) requis' })
    return
  }

  const { role, sub, departement: userDept } = req.user!
  const isChefDept = role === 'chef_departement'
  const statutInitial = isChefDept ? 'validee_dept' : 'en_attente'

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: [demande] } = await createDemande(client, departement, statutInitial, sub)
    await insertDemandeVehicules(client, demande.id as string, vehicule_ids)

    await client.query('COMMIT')

    void triggerCreationNotifications(role, departement, vehicule_ids.length, demande.id as string, userDept)

    res.status(201).json({ id: demande.id })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[POST /demandes]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  } finally {
    client.release()
  }
}

export const patchDemande = async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'] as string
  const { statut, situation_soumise } = req.body as {
    statut?: string
    situation_soumise?: boolean
  }

  if (statut === undefined && situation_soumise === undefined) {
    res.status(400).json({ error: 'statut ou situation_soumise requis' })
    return
  }

  const { role, sub, departement: userDept } = req.user!

  try {
    const { rows: [current] } = await findDemandeRaw(id)

    if (!current) {
      res.status(404).json({ error: 'Demande introuvable' })
      return
    }

    if (statut !== undefined && !canChangeStatut(role, sub, userDept, current, statut)) {
      res.status(403).json({ error: 'Transition de statut non autorisée' })
      return
    }

    const fields: Record<string, unknown> = {}
    if (statut !== undefined) fields['statut'] = statut
    if (situation_soumise !== undefined) fields['situation_soumise'] = situation_soumise

    const { rows } = await updateDemande(id, fields)

    if (statut) {
      void triggerStatusNotifications(statut, id, current.departement as string, current.created_by as string)
    }

    res.json(rows[0])
  } catch (err) {
    console.error('[PATCH /demandes/:id]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

export const deleteDemande = async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'] as string
  const { role, sub } = req.user!

  try {
    const { rows: [current] } = await findDemandeRaw(id)

    if (!current) {
      res.status(404).json({ error: 'Demande introuvable' })
      return
    }

    const canCancel =
      role === 'Admin' ||
      role === 'MENAGER' ||
      (role === 'chef_departement' && ['en_attente', 'validee_dept'].includes(current.statut as string)) ||
      (current.created_by === sub && current.statut === 'en_attente')

    if (!canCancel) {
      res.status(403).json({ error: 'Annulation non autorisée' })
      return
    }

    await setDemandeAnnulee(id)

    void createNotification(
      current.created_by as string,
      `Votre demande ${current.departement} a été annulée.`,
      'annulation',
      id
    )

    res.status(204).send()
  } catch (err) {
    console.error('[DELETE /demandes/:id]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

export const replaceDemandeVehicules = async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'] as string
  const { vehicule_ids } = req.body as { vehicule_ids?: number[] }

  if (!Array.isArray(vehicule_ids)) {
    res.status(400).json({ error: 'vehicule_ids (tableau) requis' })
    return
  }

  const { role, sub } = req.user!

  const { rows: [demande] } = await pool.query(
    'SELECT statut, created_by FROM demandes_ravitaillement WHERE id = $1',
    [id]
  )

  if (!demande) {
    res.status(404).json({ error: 'Demande introuvable' })
    return
  }

  const canEdit =
    role === 'Admin' ||
    role === 'MENAGER' ||
    (demande.created_by === sub && demande.statut === 'en_attente')

  if (!canEdit) {
    res.status(403).json({ error: 'Modification non autorisée' })
    return
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    await deleteDemandePhotos(client, id)
    await deleteDemandeVehicules(client, id)

    if (vehicule_ids.length > 0) {
      await insertDemandeVehicules(client, id, vehicule_ids)
    }

    await client.query('COMMIT')
    res.json({ message: 'Véhicules mis à jour' })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[PATCH /demandes/:id/vehicules]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  } finally {
    client.release()
  }
}

export const patchDemandeVehicule = async (req: Request, res: Response): Promise<void> => {
  const demandeId = req.params['id'] as string
  const dvId      = req.params['dvId'] as string
  const { role } = req.user!

  if (!['Admin', 'MENAGER', 'responsable_station'].includes(role)) {
    res.status(403).json({ error: 'Accès refusé' })
    return
  }

  const body = req.body as Record<string, unknown>
  const allowed = ['montant', 'n_liter', 'kilometrage', 'statut']

  const fields: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) fields[key] = body[key]
  }

  if (Object.keys(fields).length === 0) {
    res.status(400).json({ error: 'Aucune modification fournie' })
    return
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows } = await updateDemandeVehicule(client, dvId, demandeId, fields)

    if (rows.length === 0) {
      await client.query('ROLLBACK')
      res.status(404).json({ error: 'Véhicule de demande introuvable' })
      return
    }

    if (body['statut'] === 'ravitaille') {
      const { rows: allDvs } = await findDemandeVehiculeStatuts(client, demandeId)

      if (allDvs.every((dv: any) => dv.statut === 'ravitaille')) {
        const { rows: [updated] } = await promoteDemandeToStation(client, demandeId)
        if (updated) {
          void Promise.all([
            notifyByRole('Admin',   'Tous les véhicules ravitaillés — demande prête pour validation', 'soumission_station', demandeId),
            notifyByRole('MENAGER', 'Tous les véhicules ravitaillés — demande prête pour validation', 'soumission_station', demandeId),
          ])
        }
      }
    }

    await client.query('COMMIT')
    res.json(rows[0])
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[PATCH /demandes/:id/vehicules/:dvId]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  } finally {
    client.release()
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
