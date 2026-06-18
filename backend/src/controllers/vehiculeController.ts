import { Request, Response } from 'express'
import { VehiculeService } from '../services/vehiculeService'

const vehiculeService = new VehiculeService()

export const getVehicules = async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json(await vehiculeService.findAll())
  } catch (err) {
    console.error('[GET /vehicules]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

export const getVehicule = async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'] as string
  try {
    const v = await vehiculeService.findById(id)
    if (!v) { res.status(404).json({ error: 'Véhicule introuvable' }); return }
    res.json(v)
  } catch (err) {
    console.error('[GET /vehicules/:id]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

export const createVehiculeHandler = async (req: Request, res: Response): Promise<void> => {
  const { vehicule, matricule, utilisation_affectation, chauffeur_responsable, zone, centre } =
    req.body as Record<string, string | undefined>

  if (!vehicule || !matricule || !utilisation_affectation || !zone) {
    res.status(400).json({ error: 'Champs obligatoires: vehicule, matricule, utilisation_affectation, zone' }); return
  }

  try {
    const v = await vehiculeService.create({ vehicule, matricule, utilisation_affectation, chauffeur_responsable, zone, centre })
    res.status(201).json(v)
  } catch (err: any) {
    if (err.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ error: 'Ce matricule existe déjà' }); return
    }
    console.error('[POST /vehicules]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

export const updateVehiculeHandler = async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'] as string
  const { vehicule, matricule, utilisation_affectation, chauffeur_responsable, zone, centre } =
    req.body as Record<string, string | null | undefined>

  const fields: Record<string, unknown> = {}
  if (vehicule !== undefined) fields['vehicule'] = vehicule?.trim()
  if (matricule !== undefined) fields['matricule'] = matricule?.trim()
  if (utilisation_affectation !== undefined) fields['utilisation_affectation'] = utilisation_affectation?.trim()
  if ('chauffeur_responsable' in req.body) fields['chauffeur_responsable'] = chauffeur_responsable ?? null
  if (zone !== undefined) fields['zone'] = zone?.trim()
  if ('centre' in req.body) fields['centre'] = centre ?? null

  if (Object.keys(fields).length === 0) {
    res.status(400).json({ error: 'Aucune modification fournie' }); return
  }

  try {
    const v = await vehiculeService.update(id, fields as any)
    if (!v) { res.status(404).json({ error: 'Véhicule introuvable' }); return }
    res.json(v)
  } catch (err: any) {
    if (err.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ error: 'Ce matricule existe déjà' }); return
    }
    console.error('[PATCH /vehicules/:id]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

export const deleteVehiculeHandler = async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'] as string
  try {
    const deleted = await vehiculeService.delete(id)
    if (!deleted) { res.status(404).json({ error: 'Véhicule introuvable' }); return }
    res.status(204).send()
  } catch (err: any) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      res.status(409).json({ error: 'Impossible de supprimer: véhicule référencé dans des demandes' }); return
    }
    console.error('[DELETE /vehicules/:id]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}
