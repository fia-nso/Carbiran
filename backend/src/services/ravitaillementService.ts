import { AppDataSource } from '../config/database'
import { Ravitaillement } from '../entities/Ravitaillement'

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
  }) {
    const r = repo().create({
      date: data.date,
      vehicule_id: data.vehicule_id,
      montant_ravitaille: String(data.montant_ravitaille),
      commentaire: data.commentaire ?? '',
      kilometrage: String(data.kilometrage ?? 0),
      n_liter: String(data.n_liter ?? 0),
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
