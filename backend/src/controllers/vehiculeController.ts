import { Request, Response } from 'express'
import {
  findAllVehicules,
  findVehiculeById,
  createVehicule,
  updateVehicule,
  deleteVehicule,
} from '../models/Vehicule'

export const getVehicules = async (_req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await findAllVehicules()
    res.json(rows)
  } catch (err) {
    console.error('[GET /vehicules]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

export const getVehicule = async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'] as string
  try {
    const { rows } = await findVehiculeById(id)
    if (rows.length === 0) {
      res.status(404).json({ error: 'Véhicule introuvable' })
      return
    }
    res.json(rows[0])
  } catch (err) {
    console.error('[GET /vehicules/:id]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

export const createVehiculeHandler = async (req: Request, res: Response): Promise<void> => {
  const { vehicule, matricule, utilisation_affectation, chauffeur_responsable, zone, centre } =
    req.body as {
      vehicule?: string
      matricule?: string
      utilisation_affectation?: string
      chauffeur_responsable?: string
      zone?: string
      centre?: string
    }

  if (!vehicule || !matricule || !utilisation_affectation || !zone) {
    res.status(400).json({
      error: 'Champs obligatoires: vehicule, matricule, utilisation_affectation, zone',
    })
    return
  }

  try {
    const { rows } = await createVehicule(
      vehicule.trim(), matricule.trim(), utilisation_affectation.trim(),
      chauffeur_responsable ?? null, zone.trim(), centre ?? null
    )
    res.status(201).json(rows[0])
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ error: 'Ce matricule existe déjà' })
      return
    }
    console.error('[POST /vehicules]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

export const updateVehiculeHandler = async (req: Request, res: Response): Promise<void> => {
  const { vehicule, matricule, utilisation_affectation, chauffeur_responsable, zone, centre } =
    req.body as {
      vehicule?: string
      matricule?: string
      utilisation_affectation?: string
      chauffeur_responsable?: string | null
      zone?: string
      centre?: string | null
    }

  const fields: Record<string, unknown> = {}
  if (vehicule !== undefined) fields['vehicule'] = vehicule.trim()
  if (matricule !== undefined) fields['matricule'] = matricule.trim()
  if (utilisation_affectation !== undefined) fields['utilisation_affectation'] = utilisation_affectation.trim()
  if ('chauffeur_responsable' in req.body) fields['chauffeur_responsable'] = chauffeur_responsable ?? null
  if (zone !== undefined) fields['zone'] = zone.trim()
  if ('centre' in req.body) fields['centre'] = centre ?? null

  if (Object.keys(fields).length === 0) {
    res.status(400).json({ error: 'Aucune modification fournie' })
    return
  }

  const id = req.params['id'] as string
  try {
    const { rows } = await updateVehicule(id, fields)
    if (rows.length === 0) {
      res.status(404).json({ error: 'Véhicule introuvable' })
      return
    }
    res.json(rows[0])
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ error: 'Ce matricule existe déjà' })
      return
    }
    console.error('[PATCH /vehicules/:id]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

export const deleteVehiculeHandler = async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'] as string
  try {
    const { rowCount } = await deleteVehicule(id)
    if (!rowCount) {
      res.status(404).json({ error: 'Véhicule introuvable' })
      return
    }
    res.status(204).send()
  } catch (err: any) {
    if (err.code === '23503') {
      res.status(409).json({ error: 'Impossible de supprimer: véhicule référencé dans des demandes' })
      return
    }
    console.error('[DELETE /vehicules/:id]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}
