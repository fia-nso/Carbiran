import { In } from 'typeorm'
import { AppDataSource } from '../config/database'
import { Signature } from '../entities/Signature'
import { SignatureUtilisateur } from '../entities/SignatureUtilisateur'
import { Demande } from '../entities/Demande'
import { DemandeVehicule } from '../entities/DemandeVehicule'
import {
  CircuitName,
  getEtatSignature,
  getOrdre,
  getRolesPouvantSigner,
  isRoleInCircuits,
  peutSigner,
  resolveCircuitRole,
} from '../lib/signatureCircuit'
import type { JwtPayload } from '../types/index'

export interface RoleANotifier {
  role: string
  manquants: CircuitName[]
}

function httpError(status: number, message: string) {
  return Object.assign(new Error(message), { status })
}

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

  /**
   * Enregistre, en une seule transaction, toutes les signatures qui manquent à
   * l'acteur. Le verrou sur la demande sérialise les signataires concurrents.
   */
  async signerDocuments(demandeId: string, user: JwtPayload) {
    const role = resolveCircuitRole(user.role, user.circuit_role)
    if (!role) throw httpError(403, "Vous n'êtes pas signataire de ce circuit.")

    const signatureUrl = await this.findUserSignatureUrl(user.sub)
    if (!signatureUrl) throw httpError(400, "Vous devez d'abord enregistrer votre signature.")

    return AppDataSource.manager.transaction(async (em) => {
      const demande = await em.findOne(Demande, {
        where: { id: demandeId },
        lock: { mode: 'pessimistic_write' },
      })
      if (!demande) throw httpError(404, 'Demande introuvable')
      if (demande.statut === 'annulee') throw httpError(409, 'Cette demande est annulée.')
      if (!demande.situation_soumise) throw httpError(409, "La situation n'a pas encore été soumise.")

      const { departement } = demande
      if (!isRoleInCircuits(departement, role)) {
        throw httpError(403, "Vous n'êtes pas signataire de ce circuit.")
      }
      if (role === 'chef_departement' && user.departement !== departement) {
        throw httpError(403, "Cette demande n'appartient pas à votre département.")
      }

      const vehiculesValides = await em.count(DemandeVehicule, {
        where: { demande_id: demandeId, statut: 'valide' },
      })
      if (vehiculesValides === 0) throw httpError(409, 'Aucun véhicule validé sur cette demande.')

      const existantes = await em.find(Signature, { where: { demande_id: demandeId } })
      const etat = getEtatSignature(existantes, departement, role)

      if (etat.manquants.length === 0) {
        return { signatures: [] as Signature[], departement, aNotifier: [] as RoleANotifier[] }
      }
      if (!peutSigner(etat)) {
        throw httpError(409, `Ce n'est pas encore votre tour. En attente de : ${etat.attenteDe.join(', ')}.`)
      }

      const signatures = await em.save(
        etat.manquants.map((circuit) =>
          em.create(Signature, {
            demande_id: demandeId,
            role,
            user_id: user.sub,
            signature_url: signatureUrl,
            ordre: getOrdre(circuit, departement, role),
            circuit,
          })
        )
      )

      const avant = getRolesPouvantSigner(existantes, departement)
      const toutes = [...existantes, ...signatures]
      const aNotifier: RoleANotifier[] = [...getRolesPouvantSigner(toutes, departement)]
        .filter((r) => !avant.has(r))
        .map((r) => ({ role: r, manquants: getEtatSignature(toutes, departement, r).manquants }))

      return { signatures, departement, aNotifier }
    })
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
