import { AppDataSource } from '../config/database'
import { Vehicule } from '../entities/Vehicule'

function repo() {
  return AppDataSource.getRepository(Vehicule)
}

export class VehiculeService {
  async findAll() {
    return repo().find({ order: { zone: 'ASC', vehicule: 'ASC' } })
  }

  async findById(id: number | string) {
    return repo().findOne({ where: { id: Number(id) } })
  }

  async create(data: {
    vehicule: string
    matricule: string
    utilisation_affectation: string
    chauffeur_responsable?: string | null
    zone: string
    centre?: string | null
  }) {
    const v = repo().create({
      vehicule: data.vehicule.trim(),
      matricule: data.matricule.trim(),
      utilisation_affectation: data.utilisation_affectation.trim(),
      chauffeur_responsable: data.chauffeur_responsable ?? null,
      zone: data.zone.trim(),
      centre: data.centre ?? null,
    })
    return repo().save(v)
  }

  async update(id: number | string, fields: Partial<Vehicule>) {
    await repo().update(Number(id), fields)
    return repo().findOne({ where: { id: Number(id) } })
  }

  async delete(id: number | string): Promise<boolean> {
    const result = await repo().delete(Number(id))
    return (result.affected ?? 0) > 0
  }
}
