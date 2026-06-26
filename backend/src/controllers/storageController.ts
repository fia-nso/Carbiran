import { Request, Response } from 'express'
import path from 'path'
import fs from 'fs'
import { StorageService } from '../services/storageService'
import { serializePhoto } from '../lib/storageAssets'
import { STORAGE_PATH } from '../config/storage'

const storageService = new StorageService()
const VALID_TYPES = ['vehicule_avant', 'vehicule_apres', 'pompe']

export const uploadPhotoHandler = async (req: Request, res: Response): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: 'Fichier requis' }); return }

  const { demande_vehicule_id, type } = req.body as { demande_vehicule_id?: string; type?: string }

  if (!demande_vehicule_id || !type || !VALID_TYPES.includes(type)) {
    res.status(400).json({ error: 'demande_vehicule_id et type (vehicule_avant | vehicule_apres | pompe) requis' }); return
  }

  try {
    const photo = await storageService.createPhoto(demande_vehicule_id, req.file.filename, type)
    res.status(201).json(serializePhoto(req, photo))
  } catch (err: any) {
    if (err.code === 'ER_NO_REFERENCED_ROW_2') {
      res.status(404).json({ error: 'demande_vehicule_id introuvable' }); return
    }
    console.error('[POST /storage/upload]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

export const deletePhotosByDvHandler = async (req: Request, res: Response): Promise<void> => {
  const { dvId, type } = req.query as { dvId?: string; type?: string }
  if (!dvId || !type) { res.status(400).json({ error: 'dvId et type requis' }); return }
  if (!VALID_TYPES.includes(type)) { res.status(400).json({ error: 'type invalide' }); return }
  try {
    await storageService.deletePhotosByDvAndType(dvId, type)
    res.status(204).send()
  } catch (err) {
    console.error('[DELETE /storage/photo]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

export const deleteStorageHandler = (_req: Request, res: Response): void => {
  const rawPath = _req.query['path'] as string | undefined

  if (!rawPath) { res.status(400).json({ error: 'Paramètre query "path" requis' }); return }

  const normalized = path.normalize(rawPath).replace(/^(\.\.(\/|\\|$))+/, '')
  const fullPath = path.resolve(STORAGE_PATH, normalized)

  if (!fullPath.startsWith(path.resolve(STORAGE_PATH))) {
    res.status(400).json({ error: 'Chemin invalide' }); return
  }

  try {
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath)
    res.status(204).send()
  } catch (err) {
    console.error('[DELETE /storage/:path]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}
