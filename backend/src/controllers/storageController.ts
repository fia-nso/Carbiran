import { Request, Response } from 'express'
import path from 'path'
import fs from 'fs'
import { createPhoto } from '../models/Photo'

const STORAGE_PATH = process.env.STORAGE_PATH || './uploads'
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const VALID_TYPES = ['vehicule_avant', 'vehicule_apres', 'pompe']

export const uploadPhotoHandler = async (req: Request, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: 'Fichier requis' })
    return
  }

  const { demande_vehicule_id, type } = req.body as {
    demande_vehicule_id?: string
    type?: string
  }

  if (!demande_vehicule_id || !type || !VALID_TYPES.includes(type)) {
    res.status(400).json({
      error: 'demande_vehicule_id et type (vehicule_avant | vehicule_apres | pompe) requis',
    })
    return
  }

  const url = `${BASE_URL}/uploads/photos/${req.file.filename}`

  try {
    const { rows } = await createPhoto(demande_vehicule_id, url, type)
    res.status(201).json(rows[0])
  } catch (err: any) {
    if (err.code === '23503') {
      res.status(404).json({ error: 'demande_vehicule_id introuvable' })
      return
    }
    console.error('[POST /storage/upload]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

export const deleteStorageHandler = (_req: Request, res: Response): void => {
  const rawPath = _req.query.path as string | undefined

  if (!rawPath) {
    res.status(400).json({ error: 'Paramètre query "path" requis' })
    return
  }

  const normalized = path.normalize(rawPath).replace(/^(\.\.(\/|\\|$))+/, '')
  const fullPath = path.resolve(STORAGE_PATH, normalized)

  if (!fullPath.startsWith(path.resolve(STORAGE_PATH))) {
    res.status(400).json({ error: 'Chemin invalide' })
    return
  }

  try {
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath)
    }
    res.status(204).send()
  } catch (err) {
    console.error('[DELETE /storage/:path]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}
