import { In, SelectQueryBuilder } from 'typeorm'
import { AppDataSource } from '../config/database'
import { Demande } from '../entities/Demande'
import { DemandeVehicule } from '../entities/DemandeVehicule'
import { Signature } from '../entities/Signature'
import { SignatureUtilisateur } from '../entities/SignatureUtilisateur'
import type { AppRole } from '../types/index'

function demandeRepo() {
  return AppDataSource.getRepository(Demande)
}

function dvRepo() {
  return AppDataSource.getRepository(DemandeVehicule)
}

function applyAccessFilter(
  qb: SelectQueryBuilder<Demande>,
  role: AppRole,
  userId: string,
  departement: string | null,
  circuitRole: string | null = null
): void {
  switch (role) {
    case 'Admin':
    case 'MENAGER':
      break
    case 'chef_departement':
      if (!departement) {
        qb.andWhere('1 = 0')
      } else {
        qb.andWhere('d.departement = :dept', { dept: departement })
      }
      break
    case 'responsable_station':
    case 'responsable_station_viewer':
      qb.andWhere("d.statut IN ('validee_dept', 'validee_station', 'validee_cellule')")
      break
    case 'signataire':
      if (circuitRole === 'directeur_commercial') {
        qb.andWhere('d.departement = :dept', { dept: 'DC' })
      } else {
        // Le signataire (DT/DG/DF) voit la demande dès que la situation a été
        // soumise pour signature — indépendamment du statut de validation, afin
        // de supporter la soumission partielle (statut validee_dept/station).
        qb.andWhere('d.situation_soumise = true')
      }
      break
    default:
      qb.andWhere('d.created_by = :userId', { userId })
  }
}

function canChangeStatut(
  role: AppRole,
  userId: string,
  userDept: string | null,
  current: { statut: string; departement: string; created_by: string },
  targetStatut: string
): boolean {
  if (role === 'Admin' || role === 'MENAGER') return true

  if (role === 'chef_departement') {
    return (
      current.departement === userDept &&
      ((current.statut === 'en_attente' && targetStatut === 'validee_dept') ||
        targetStatut === 'annulee')
    )
  }

  if (role === 'responsable_station') {
    return (
      (current.statut === 'validee_dept' && targetStatut === 'validee_station') ||
      (current.statut === 'validee_station' && targetStatut === 'validee_cellule')
    )
  }

  if (role === 'signataire') {
    return current.statut === 'en_attente' && targetStatut === 'validee_dept'
  }

  if (current.created_by === userId && current.statut === 'en_attente' && targetStatut === 'annulee') {
    return true
  }

  return false
}

export class DemandeService {
  async findAll(role: AppRole, userId: string, departement: string | null, circuitRole: string | null = null) {
    const qb = demandeRepo()
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.creator', 'u')
      .leftJoinAndSelect('d.demande_vehicules', 'dv')
      .orderBy('d.created_at', 'DESC')

    applyAccessFilter(qb, role, userId, departement, circuitRole)
    const rows = await qb.getMany()

    // Charge les signatures de toutes les demandes retournées en une seule requête
    // groupée (évite un appel séparé par demande côté frontend). On ne remonte que
    // les champs utiles au calcul du statut de signature — pas les URLs des images.
    const demandeIds = rows.map((d) => d.id)
    const sigsByDemande: Record<
      string,
      Array<{ role: string; user_id: string | null; circuit: string; ordre: number; signe_le: Date | null }>
    > = {}

    if (demandeIds.length > 0) {
      const sigs = await AppDataSource.getRepository(Signature).find({
        where: { demande_id: In(demandeIds) },
        select: { demande_id: true, role: true, user_id: true, circuit: true, ordre: true, signe_le: true },
      })
      for (const s of sigs) {
        if (!s.demande_id) continue
        ;(sigsByDemande[s.demande_id] ??= []).push({
          role: s.role,
          user_id: s.user_id,
          circuit: s.circuit,
          ordre: s.ordre,
          signe_le: s.signe_le,
        })
      }
    }

    return rows.map((d) => ({
      id: d.id,
      departement: d.departement,
      statut: d.statut,
      situation_soumise: d.situation_soumise,
      created_by: d.created_by,
      created_at: d.created_at,
      updated_at: d.updated_at,
      creator_email: d.creator?.email ?? null,
      creator_full_name: [d.creator?.nom, d.creator?.prenom].filter(Boolean).join(' ') || null,
      demande_vehicules: d.demande_vehicules ?? [],
      signatures: sigsByDemande[d.id] ?? [],
    }))
  }

  async findById(id: string, role: AppRole, userId: string, departement: string | null, circuitRole: string | null = null) {
    const qb = demandeRepo()
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.creator', 'u')
      .where('d.id = :id', { id })

    applyAccessFilter(qb, role, userId, departement, circuitRole)

    const demande = await qb.getOne()
    if (!demande) return null

    const dvs = await dvRepo()
      .createQueryBuilder('dv')
      .leftJoinAndSelect('dv.vehicule', 'v')
      .leftJoinAndSelect('dv.photos', 'p')
      .where('dv.demande_id = :id', { id })
      .orderBy('dv.created_at', 'ASC')
      .getMany() as DemandeVehicule[]

    return {
      id: demande.id,
      departement: demande.departement,
      statut: demande.statut,
      situation_soumise: demande.situation_soumise,
      created_by: demande.created_by,
      created_at: demande.created_at,
      updated_at: demande.updated_at,
      creator: {
        email: demande.creator?.email ?? null,
        full_name: [demande.creator?.nom, demande.creator?.prenom].filter(Boolean).join(' ') || null,
      },
      demande_vehicules: dvs,
    }
  }

  async findRaw(id: string) {
    return demandeRepo().findOne({
      where: { id },
      select: { id: true, statut: true, departement: true, created_by: true },
    })
  }

  async create(departement: string, vehicule_ids: number[], userId: string, statut: string) {
    return AppDataSource.manager.transaction(async (em) => {
      const demande = em.create(Demande, { departement, statut, created_by: userId })
      const saved = await em.save(Demande, demande)

      const dvs = vehicule_ids.map((vid) =>
        em.create(DemandeVehicule, {
          demande_id: saved.id,
          vehicule_id: vid,
          statut: 'en_attente',
        })
      )
      await em.save(DemandeVehicule, dvs)

      return saved
    })
  }

  async patch(
    id: string,
    updates: { statut?: string; situation_soumise?: boolean },
    role: AppRole,
    userId: string,
    userDept: string | null
  ) {
    const current = await this.findRaw(id)
    if (!current) throw Object.assign(new Error('Demande introuvable'), { status: 404 })

    if (
      updates.statut !== undefined &&
      !canChangeStatut(role, userId, userDept, current, updates.statut)
    ) {
      throw Object.assign(new Error('Transition de statut non autorisée'), { status: 403 })
    }

    await demandeRepo().update(id, updates)
    return demandeRepo().findOne({ where: { id } })
  }

  async setAnnulee(
    id: string,
    role: AppRole,
    userId: string
  ): Promise<{ demande: Demande; currentDepartement: string; currentCreatedBy: string } | null> {
    const current = await this.findRaw(id)
    if (!current) return null

    const canCancel =
      role === 'Admin' ||
      role === 'MENAGER' ||
      (role === 'chef_departement' &&
        ['en_attente', 'validee_dept'].includes(current.statut)) ||
      (current.created_by === userId && current.statut === 'en_attente')

    if (!canCancel) {
      throw Object.assign(new Error('Annulation non autorisée'), { status: 403 })
    }

    await demandeRepo().update(id, { statut: 'annulee' })
    const updated = await demandeRepo().findOne({ where: { id } })
    return {
      demande: updated!,
      currentDepartement: current.departement,
      currentCreatedBy: current.created_by,
    }
  }

  async replaceVehicules(
    id: string,
    vehicule_ids: number[],
    role: AppRole,
    userId: string
  ): Promise<void> {
    const demande = await this.findRaw(id)
    if (!demande) throw Object.assign(new Error('Demande introuvable'), { status: 404 })

    const canEdit =
      role === 'Admin' ||
      role === 'MENAGER' ||
      (demande.created_by === userId && demande.statut === 'en_attente')

    if (!canEdit) throw Object.assign(new Error('Modification non autorisée'), { status: 403 })

    await AppDataSource.manager.transaction(async (em) => {
      const existingDvs = await em.find(DemandeVehicule, { where: { demande_id: id } })
      if (existingDvs.length > 0) {
        await em.remove(DemandeVehicule, existingDvs)
      }

      if (vehicule_ids.length > 0) {
        const dvs = vehicule_ids.map((vid) =>
          em.create(DemandeVehicule, {
            demande_id: id,
            vehicule_id: vid,
            statut: 'en_attente',
          })
        )
        await em.save(DemandeVehicule, dvs)
      }
    })
  }

  async patchDemandeVehicule(
    demandeId: string,
    dvId: string,
    fields: { montant?: number; n_liter?: number; kilometrage?: number; statut?: string },
    role: AppRole
  ): Promise<{ dv: DemandeVehicule; promoted: boolean; promotedDepartement?: string }> {
    if (!['Admin', 'MENAGER', 'responsable_station'].includes(role)) {
      throw Object.assign(new Error('Accès refusé'), { status: 403 })
    }

    return AppDataSource.manager.transaction(async (em) => {
      const dv = await em.findOne(DemandeVehicule, { where: { id: dvId, demande_id: demandeId } })
      if (!dv) throw Object.assign(new Error('Véhicule de demande introuvable'), { status: 404 })

      Object.assign(dv, fields)
      const saved = await em.save(DemandeVehicule, dv)

      if (fields.statut === 'ravitaille') {
        const allDvs = await em.find(DemandeVehicule, { where: { demande_id: demandeId } })
        if (allDvs.every((d) => d.statut === 'ravitaille')) {
          const demande = await em.findOne(Demande, { where: { id: demandeId } })
          if (demande && ['validee_dept', 'en_attente'].includes(demande.statut)) {
            demande.statut = 'validee_station'
            await em.save(Demande, demande)
            return { dv: saved, promoted: true, promotedDepartement: demande.departement }
          }
        }
      }

      return { dv: saved, promoted: false }
    })
  }

  async getBon(dvId: string) {
    const dv = await dvRepo().findOne({
      where: { id: dvId },
      relations: { vehicule: true, demande: true },
    })
    if (!dv) return null

    const allValidated = await dvRepo()
      .createQueryBuilder('dv')
      .leftJoinAndSelect('dv.vehicule', 'v')
      .where('dv.demande_id = :did', { did: dv.demande_id })
      .andWhere("dv.statut = 'valide'")
      .orderBy('v.zone', 'ASC')
      .getMany()

    const idx = allValidated.findIndex((b) => b.id === dvId)

    const sigRepo = AppDataSource.getRepository(Signature)
    const suRepo = AppDataSource.getRepository(SignatureUtilisateur)

    const sigs = await sigRepo.find({
      where: { demande_id: dv.demande_id, circuit: 'bons' },
      order: { ordre: 'ASC' },
    })

    const userIds = sigs
      .map((s) => s.user_id)
      .filter((uid): uid is string => uid !== null)

    const suMap: Record<string, string> = {}
    if (userIds.length > 0) {
      const { In } = await import('typeorm')
      const sus = await suRepo.find({ where: { user_id: In(userIds) } })
      for (const su of sus) suMap[su.user_id] = su.signature_url
    }

    const signatures = sigs.map((s) => ({
      role: s.role,
      signe_le: s.signe_le,
      signature_url: s.user_id ? (suMap[s.user_id] ?? s.signature_url) : s.signature_url,
    }))

    const vehicule = dv.vehicule
    const demande = dv.demande

    return {
      id: dv.id,
      demande_id: dv.demande_id,
      montant: dv.montant ?? 0,
      n_liter: dv.n_liter ?? 0,
      statut: dv.statut,
      matricule: vehicule?.matricule ?? '—',
      typeVehicule: vehicule?.vehicule ?? '—',
      chauffeur: vehicule?.chauffeur_responsable ?? '—',
      departement: demande?.departement ?? '—',
      date: demande?.created_at
        ? new Date(demande.created_at).toLocaleDateString('fr-FR')
        : '—',
      bonNum: idx >= 0 ? idx + 1 : 1,
      signatures,
    }
  }
}
