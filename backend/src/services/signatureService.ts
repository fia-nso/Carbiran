import { In } from 'typeorm'
import { AppDataSource } from '../config/database'
import { Signature } from '../entities/Signature'
import { SignatureUtilisateur } from '../entities/SignatureUtilisateur'

function sigRepo() {
  return AppDataSource.getRepository(Signature)
}

function suRepo() {
  return AppDataSource.getRepository(SignatureUtilisateur)
}

export class SignatureService {
  async findByDemandeId(demandeId: string) {
    const sigs = await sigRepo().find({
      where: { demande_id: demandeId },
      order: { circuit: 'ASC', ordre: 'ASC' },
    })

    if (sigs.length === 0) return sigs

    const userIds = [...new Set(sigs.map((s) => s.user_id).filter((id): id is string => id !== null))]
    if (userIds.length > 0) {
      const sus = await suRepo().find({ where: { user_id: In(userIds) }, select: { user_id: true, signature_url: true } })
      const latestMap: Record<string, string> = {}
      for (const su of sus) latestMap[su.user_id] = su.signature_url
      for (const s of sigs) {
        if (s.user_id && latestMap[s.user_id]) s.signature_url = latestMap[s.user_id]
      }
    }

    return sigs
  }

  async findUtilisateurByUserId(userId: string) {
    return suRepo().findOne({ where: { user_id: userId } })
  }

  async findUserSignatureUrl(userId: string): Promise<string | null> {
    const su = await suRepo().findOne({ where: { user_id: userId }, select: { signature_url: true } })
    return su?.signature_url ?? null
  }

  async createSignature(data: {
    demande_id: string
    role: string
    user_id: string
    signature_url: string
    ordre: number
    circuit: string
  }) {
    const sig = sigRepo().create(data)
    return sigRepo().save(sig)
  }

  async upsertSignatureUtilisateur(userId: string, role: string, url: string) {
    const existing = await suRepo().findOne({ where: { user_id: userId } })
    if (existing) {
      existing.role = role
      existing.signature_url = url
      return suRepo().save(existing)
    }
    const su = suRepo().create({ user_id: userId, role, signature_url: url })
    return suRepo().save(su)
  }
}
