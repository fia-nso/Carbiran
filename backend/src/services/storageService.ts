import path from 'path'
import fs from 'fs'
import { AppDataSource } from '../config/database'
import { Photo } from '../entities/Photo'

const STORAGE_PATH = process.env.STORAGE_PATH || './uploads'

function repo() {
  return AppDataSource.getRepository(Photo)
}

export class StorageService {
  async createPhoto(demandeVehiculeId: string, url: string, type: string) {
    const photo = repo().create({ demande_vehicule_id: demandeVehiculeId, url, type })
    return repo().save(photo)
  }

  async deletePhotosByDvAndType(dvId: string, type: string): Promise<void> {
    const photos = await repo().find({ where: { demande_vehicule_id: dvId, type } })
    for (const photo of photos) {
      const parts = photo.url.split('/uploads/photos/')
      const filename = parts[parts.length - 1]
      if (filename) {
        const fullPath = path.resolve(STORAGE_PATH, 'photos', filename)
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath)
      }
      await repo().delete(photo.id)
    }
  }
}
