import { AppDataSource } from '../config/database'
import { Photo } from '../entities/Photo'

function repo() {
  return AppDataSource.getRepository(Photo)
}

export class StorageService {
  async createPhoto(demandeVehiculeId: string, url: string, type: string) {
    const photo = repo().create({ demande_vehicule_id: demandeVehiculeId, url, type })
    return repo().save(photo)
  }
}
