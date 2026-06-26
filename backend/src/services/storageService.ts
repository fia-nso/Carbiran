import path from 'path'
import fs from 'fs'
import { AppDataSource } from '../config/database'
import { Photo } from '../entities/Photo'
import { normalizeStoredFilename } from '../lib/storageAssets'

const STORAGE_PATH = process.env.STORAGE_PATH || './uploads'

function repo() {
  return AppDataSource.getRepository(Photo)
}

export class StorageService {
  async createPhoto(demandeVehiculeId: string, filename: string, type: string) {
    const photo = repo().create({ demande_vehicule_id: demandeVehiculeId, url: filename, type })
    return repo().save(photo)
  }

  async deletePhotosByDvAndType(dvId: string, type: string): Promise<void> {
    const photos = await repo().find({ where: { demande_vehicule_id: dvId, type } })
    for (const photo of photos) {
      const filename = normalizeStoredFilename(photo.url)
      if (filename) {
        const fullPath = path.resolve(STORAGE_PATH, 'photos', filename)
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath)
      }
      await repo().delete(photo.id)
    }
  }
}
