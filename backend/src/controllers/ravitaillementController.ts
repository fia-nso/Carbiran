import { Request, Response } from 'express'
import { RavitaillementService } from '../services/ravitaillementService'

const ravitaillementService = new RavitaillementService()

export const getRavitaillements = async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json(await ravitaillementService.findAll())
  } catch (err) {
    console.error('[GET /ravitaillements]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

export const getRavitaillement = async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'] as string
  try {
    const r = await ravitaillementService.findById(id)
    if (!r) { res.status(404).json({ error: 'Ravitaillement introuvable' }); return }
    res.json(r)
  } catch (err) {
    console.error('[GET /ravitaillements/:id]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

export const createRavitaillementHandler = async (req: Request, res: Response): Promise<void> => {
  const { date, vehicule_id, montant_ravitaille, commentaire, kilometrage, n_liter } =
    req.body as {
      date?: string
      vehicule_id?: number
      montant_ravitaille?: number
      commentaire?: string
      kilometrage?: number
      n_liter?: number
    }

  if (!date || vehicule_id == null || montant_ravitaille == null) {
    res.status(400).json({ error: 'Champs obligatoires: date, vehicule_id, montant_ravitaille' }); return
  }

  try {
    const r = await ravitaillementService.create({ date, vehicule_id, montant_ravitaille, commentaire, kilometrage, n_liter })
    res.status(201).json(r)
  } catch (err: any) {
    if (err.code === 'ER_NO_REFERENCED_ROW_2') {
      res.status(404).json({ error: 'Véhicule introuvable' }); return
    }
    console.error('[POST /ravitaillements]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

export const updateRavitaillementHandler = async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'] as string
  const { date, vehicule_id, montant_ravitaille, commentaire, kilometrage, n_liter } =
    req.body as {
      date?: string
      vehicule_id?: number
      montant_ravitaille?: number
      commentaire?: string
      kilometrage?: number
      n_liter?: number
    }

  const fields: Record<string, unknown> = {}
  if (date !== undefined) fields['date'] = date
  if (vehicule_id !== undefined) fields['vehicule_id'] = vehicule_id
  if (montant_ravitaille !== undefined) fields['montant_ravitaille'] = String(montant_ravitaille)
  if (commentaire !== undefined) fields['commentaire'] = commentaire
  if (kilometrage !== undefined) fields['kilometrage'] = String(kilometrage)
  if (n_liter !== undefined) fields['n_liter'] = String(n_liter)

  if (Object.keys(fields).length === 0) {
    res.status(400).json({ error: 'Aucune modification fournie' }); return
  }

  try {
    const r = await ravitaillementService.update(id, fields as any)
    if (!r) { res.status(404).json({ error: 'Ravitaillement introuvable' }); return }
    res.json(r)
  } catch (err) {
    console.error('[PATCH /ravitaillements/:id]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

export const deleteRavitaillementHandler = async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'] as string
  try {
    const deleted = await ravitaillementService.delete(id)
    if (!deleted) { res.status(404).json({ error: 'Ravitaillement introuvable' }); return }
    res.status(204).send()
  } catch (err) {
    console.error('[DELETE /ravitaillements/:id]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}
