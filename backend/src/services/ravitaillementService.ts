import { AppDataSource } from '../config/database'
import { Ravitaillement } from '../entities/Ravitaillement'
import { Vehicule } from '../entities/Vehicule'
import { CentreService } from './centreService'

const centreService = new CentreService()

function repo() {
  return AppDataSource.getRepository(Ravitaillement)
}

export class RavitaillementService {
  async findAll() {
    return repo().find({
      relations: { vehicule: true },
      order: { date: 'DESC', created_at: 'DESC' },
    })
  }

  async findById(id: number | string) {
    return repo().findOne({
      where: { id: Number(id) },
      relations: { vehicule: true },
    })
  }

  async create(data: {
    date: string
    vehicule_id: number
    montant_ravitaille: number
    commentaire?: string
    kilometrage?: number
    n_liter?: number
    /** Centre du ravitaillement ; à défaut, centre actuel du véhicule. */
    centre?: string | null
  }) {
    // Centre fourni : doit exister dans `centres` (un centre inactif est accepté, comme pour les véhicules).
    let centre = await centreService.verifierCode(data.centre)
    if (!centre) {
      const vehicule = await AppDataSource.getRepository(Vehicule).findOne({
        where: { id: Number(data.vehicule_id) },
        select: { id: true, centre: true },
      })
      if (!vehicule) throw Object.assign(new Error('Véhicule introuvable'), { status: 404 })
      centre = vehicule.centre ? vehicule.centre.trim().toUpperCase() : null
    }

    const r = repo().create({
      date: data.date,
      vehicule_id: data.vehicule_id,
      montant_ravitaille: String(data.montant_ravitaille),
      commentaire: data.commentaire ?? '',
      kilometrage: String(data.kilometrage ?? 0),
      n_liter: String(data.n_liter ?? 0),
      centre,
    })
    return repo().save(r)
  }

  async update(id: number | string, fields: Partial<Ravitaillement>) {
    await repo().update(Number(id), fields)
    return repo().findOne({ where: { id: Number(id) }, relations: { vehicule: true } })
  }

  async delete(id: number | string): Promise<boolean> {
    const result = await repo().delete(Number(id))
    return (result.affected ?? 0) > 0
  }
}
