import path from 'path'
import fs from 'fs'
import { AppDataSource } from '../config/database'
import { Photo } from '../entities/Photo'
import { DemandeVehicule } from '../entities/DemandeVehicule'
import { normalizeStoredFilename } from '../lib/storageAssets'
import { STORAGE_PATH } from '../config/storage'

function repo() {
  return AppDataSource.getRepository(Photo)
}

export class StorageService {
  /** Centre de la demande à laquelle appartient un véhicule de demande. `undefined` si introuvable. */
  async centreDuDemandeVehicule(dvId: string): Promise<string | undefined> {
    const dv = await AppDataSource.getRepository(DemandeVehicule).findOne({
      where: { id: dvId },
      relations: { demande: true },
      select: { id: true, demande: { id: true, centre: true } },
    })
    return dv ? dv.demande?.centre : undefined
  }

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
