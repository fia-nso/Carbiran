import { In, SelectQueryBuilder } from 'typeorm'
import { AppDataSource } from '../config/database'
import { Demande } from '../entities/Demande'
import { DemandeVehicule } from '../entities/DemandeVehicule'
import { Signature } from '../entities/Signature'
import { SignatureUtilisateur } from '../entities/SignatureUtilisateur'
import { Vehicule } from '../entities/Vehicule'
import { LogService } from './logService'
import type { AppRole } from '../types/index'
import { evaluerConsommation } from './consommation'
import { getUserCentre } from '../lib/userCentre'
import { normaliserCodeCentre } from './centreService'

function demandeRepo() {
  return AppDataSource.getRepository(Demande)
}

function dvRepo() {
  return AppDataSource.getRepository(DemandeVehicule)
}

function httpError(status: number, message: string): Error {
  return Object.assign(new Error(message), { status })
}

/** Départements « connus » : tout véhicule hors de cette liste relève du département « Autre ». */
const DEPARTEMENTS_CONNUS = ['zone a', 'zone b', 'rx&sys', 'fo', 'cpde', 'dc']
const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

/** Le département d'un véhicule = son champ `zone` (même règle que le front). */
export function vehiculeDansDepartement(zoneVehicule: string | null | undefined, departement: string): boolean {
  if (norm(departement) === 'autre') return !DEPARTEMENTS_CONNUS.includes(norm(zoneVehicule))
  return norm(zoneVehicule) === norm(departement)
}

/**
 * Vérifie que tous les véhicules existent et appartiennent au département ET au centre donnés.
 * Lève 400 sinon (avec les matricules fautifs).
 */
async function verifierVehiculesDemande(
  vehiculeIds: number[],
  departement: string,
  centre: string,
  repo = AppDataSource.getRepository(Vehicule)
): Promise<void> {
  if (vehiculeIds.length === 0) return
  const vehicules = await repo.find({ where: { id: In(vehiculeIds) } })
  const trouves = new Set(vehicules.map((v) => v.id))
  const manquants = vehiculeIds.filter((vid) => !trouves.has(vid))
  if (manquants.length > 0) throw httpError(400, `Véhicule(s) introuvable(s) : ${manquants.join(', ')}`)

  const horsDept = vehicules.filter((v) => !vehiculeDansDepartement(v.zone, departement))
  if (horsDept.length > 0) {
    throw httpError(400, `Véhicule(s) hors du département ${departement} : ${horsDept.map((v) => v.matricule).join(', ')}`)
  }
  const horsCentre = vehicules.filter((v) => normaliserCodeCentre(v.centre) !== centre)
  if (horsCentre.length > 0) {
    throw httpError(400, `Véhicule(s) hors du centre ${centre} : ${horsCentre.map((v) => v.matricule).join(', ')}`)
  }
}

/** Centre lu en base, uniquement pour les rôles dont la visibilité en dépend. */
async function centrePourFiltre(role: AppRole, userId: string): Promise<string | null> {
  return role === 'chef_de_cours' || role === 'responsable_station' ? getUserCentre(userId) : null
}

function applyAccessFilter(
  qb: SelectQueryBuilder<Demande>,
  role: AppRole,
  userId: string,
  departement: string | null,
  circuitRole: string | null = null,
  userCentre: string | null = null
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
    case 'chef_de_cours':
      // Chef de centre : demandes de SON centre (+ son département s'il en a un, cas DC),
      // et toujours ses propres demandes.
      if (!userCentre) {
        qb.andWhere('d.created_by = :userId', { userId })
      } else if (departement) {
        qb.andWhere('(d.created_by = :userId OR (d.centre = :userCentre AND d.departement = :dept))', {
          userId, userCentre, dept: departement,
        })
      } else {
        // Sans département : toutes les demandes de son centre, DC comprises.
        qb.andWhere('(d.created_by = :userId OR d.centre = :userCentre)', { userId, userCentre })
      }
      break
    case 'responsable_station':
      // Station : demandes de son centre uniquement. Sans centre → rien.
      qb.andWhere("d.statut IN ('validee_dept', 'validee_station', 'validee_cellule')")
      if (!userCentre) qb.andWhere('1 = 0')
      else qb.andWhere('d.centre = :userCentre', { userCentre })
      break
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
  current: { statut: string; departement: string; centre: string; created_by: string },
  targetStatut: string,
  userCentre: string | null = null
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
    // La station n'agit que sur les demandes de son centre.
    if (!userCentre || current.centre !== userCentre) return false
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

    applyAccessFilter(qb, role, userId, departement, circuitRole, await centrePourFiltre(role, userId))
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
      centre: d.centre,
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

    applyAccessFilter(qb, role, userId, departement, circuitRole, await centrePourFiltre(role, userId))

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
      centre: demande.centre,
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
      select: { id: true, statut: true, departement: true, centre: true, created_by: true },
    })
  }

  /**
   * Crée une demande. `centre` doit déjà être déterminé et validé par l'appelant
   * (centre du chef de centre lu en base, ou centre actif choisi par le chef de département).
   * Tous les véhicules doivent être du département ET du centre de la demande.
   */
  async create(departement: string, centre: string, vehiculeIdsInput: number[], userId: string, statut: string) {
    const vehiculeIds = [...new Set(vehiculeIdsInput.map(Number))]
    if (vehiculeIds.length === 0 || vehiculeIds.some((v) => !Number.isInteger(v) || v <= 0)) {
      throw httpError(400, 'vehicule_ids invalides')
    }

    return AppDataSource.manager.transaction(async (em) => {
      await verifierVehiculesDemande(vehiculeIds, departement, centre, em.getRepository(Vehicule))

      const demande = em.create(Demande, { departement, centre, statut, created_by: userId })
      const saved = await em.save(Demande, demande)

      const dvs = vehiculeIds.map((vid) =>
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

    // Seule la Cellule soumet (ou retire) la situation pour signature.
    if (updates.situation_soumise !== undefined && role !== 'Admin' && role !== 'MENAGER') {
      throw Object.assign(new Error('Seule la Cellule peut soumettre la situation'), { status: 403 })
    }

    if (
      updates.statut !== undefined &&
      !canChangeStatut(role, userId, userDept, current, updates.statut, await centrePourFiltre(role, userId))
    ) {
      throw Object.assign(new Error('Transition de statut non autorisée'), { status: 403 })
    }

    await demandeRepo().update(id, updates)
    return demandeRepo().findOne({ where: { id } })
  }

  async setAnnulee(
    id: string,
    role: AppRole,
    userId: string,
    userDept: string | null
  ): Promise<{ demande: Demande; currentDepartement: string; currentCentre: string; currentCreatedBy: string } | null> {
    const current = await this.findRaw(id)
    if (!current) return null

    const canCancel =
      role === 'Admin' ||
      role === 'MENAGER' ||
      (role === 'chef_departement' &&
        !!userDept &&
        current.departement === userDept &&
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
      currentCentre: current.centre,
      currentCreatedBy: current.created_by,
    }
  }

  async replaceVehicules(
    id: string,
    vehiculeIdsInput: number[],
    user: { role: AppRole; userId: string; email: string; departement: string | null; circuitRole: string | null }
  ): Promise<{ removed: number; added: number }> {
    const { role, userId, departement: userDept, circuitRole } = user

    const vehiculeIds = [...new Set(vehiculeIdsInput.map(Number))]
    if (vehiculeIds.some((v) => !Number.isInteger(v) || v <= 0)) {
      throw Object.assign(new Error('vehicule_ids invalides'), { status: 400 })
    }
    if (vehiculeIds.length === 0) {
      throw Object.assign(new Error('La demande doit conserver au moins un véhicule.'), { status: 400 })
    }

    const demande = await this.findRaw(id)
    if (!demande) throw Object.assign(new Error('Demande introuvable'), { status: 404 })

    const isCellule = role === 'Admin' || role === 'MENAGER'
    const isChefDept = role === 'chef_departement'
    const isDirecteurCommercial = role === 'signataire' && circuitRole === 'directeur_commercial'

    let canEdit = false
    if (isCellule) {
      canEdit = true
    } else if (isChefDept) {
      // Chef de département : uniquement son département, avant approbation.
      canEdit = !!userDept && demande.departement === userDept && demande.statut === 'en_attente'
    } else if (isDirecteurCommercial) {
      canEdit = demande.departement === 'DC' && ['en_attente', 'validee_dept'].includes(demande.statut)
    } else {
      canEdit = demande.created_by === userId && demande.statut === 'en_attente'
    }
    if (!canEdit) throw Object.assign(new Error('Modification non autorisée'), { status: 403 })

    const result = await AppDataSource.manager.transaction(async (em) => {
      const existingDvs = await em.find(DemandeVehicule, {
        where: { demande_id: id },
        relations: { vehicule: true },
      })

      // Hors cellule : plus de modification dès qu'un véhicule est ravitaillé ou validé.
      if (!isCellule && existingDvs.some((dv) => dv.statut === 'ravitaille' || dv.statut === 'valide')) {
        throw Object.assign(
          new Error('Modification impossible : des véhicules sont déjà ravitaillés ou validés.'),
          { status: 409 }
        )
      }

      const keep = new Set(vehiculeIds)
      const existingIds = new Set(existingDvs.map((dv) => dv.vehicule_id))
      const toRemove = existingDvs.filter((dv) => !keep.has(dv.vehicule_id))
      const toAdd = vehiculeIds.filter((vid) => !existingIds.has(vid))

      // Véhicules ajoutés (cellule, chef de département, DC, créateur) :
      // même département et même centre que la demande. Pour le chef de
      // département, le département de la demande est déjà le sien (canEdit).
      await verifierVehiculesDemande(toAdd, demande.departement, demande.centre, em.getRepository(Vehicule))

      if (toRemove.length > 0) {
        await em.remove(DemandeVehicule, toRemove)
      }

      let addedDvs: DemandeVehicule[] = []
      if (toAdd.length > 0) {
        const dvs = toAdd.map((vid) =>
          em.create(DemandeVehicule, { demande_id: id, vehicule_id: vid, statut: 'en_attente' })
        )
        addedDvs = await em.save(DemandeVehicule, dvs)
      }

      const afterVehicules = await em.find(Vehicule, { where: { id: In(vehiculeIds) } })
      return { existingDvs, toRemove, toAdd, addedDvs, afterVehicules }
    })

    // Journal : une entrée par véhicule retiré / ajouté (hors transaction, ne bloque pas la modification).
    if (result.toRemove.length > 0 || result.addedDvs.length > 0) {
      const describe = (v: Vehicule | null | undefined, vid: number) =>
        v ? { id: v.id, matricule: v.matricule, vehicule: v.vehicule } : { id: vid }
      const avant = result.existingDvs.map((dv) => describe(dv.vehicule, dv.vehicule_id))
      const apres = vehiculeIds.map((vid) => describe(result.afterVehicules.find((v) => v.id === vid), vid))
      const logService = new LogService()

      for (const dv of result.addedDvs) {
        const v = describe(result.afterVehicules.find((x) => x.id === dv.vehicule_id), dv.vehicule_id)
        const label = 'matricule' in v ? `${v.matricule}` : `#${dv.vehicule_id}`
        await logService
          .create({
            user_id: userId,
            user_email: user.email,
            module: 'demandes',
            action: 'ADD_VEHICULE',
            target_table: 'demande_vehicules',
            target_id: dv.id,
            description: `Ajout du véhicule ${label} à la demande ${demande.departement} (${demande.id}) par ${role}.`,
            before_data: { demande_id: demande.id, statut: demande.statut, vehicules: avant },
            after_data: { demande_id: demande.id, statut: demande.statut, vehicules: apres },
            metadata: { departement: demande.departement, centre: demande.centre, role, circuit_role: circuitRole, vehicule_ajoute: v, demande_vehicule: { id: dv.id, statut: dv.statut } },
          })
          .catch((err) => console.error('[log ADD_VEHICULE]', err))
      }

      for (const dv of result.toRemove) {
        const v = describe(dv.vehicule, dv.vehicule_id)
        const label = 'matricule' in v ? `${v.matricule}` : `#${dv.vehicule_id}`
        await logService
          .create({
            user_id: userId,
            user_email: user.email,
            module: 'demandes',
            action: 'REMOVE_VEHICULE',
            target_table: 'demande_vehicules',
            target_id: dv.id,
            description: `Retrait du véhicule ${label} de la demande ${demande.departement} (${demande.id}) par ${role}.`,
            before_data: { demande_id: demande.id, statut: demande.statut, vehicules: avant },
            after_data: { demande_id: demande.id, statut: demande.statut, vehicules: apres },
            metadata: { departement: demande.departement, role, circuit_role: circuitRole, vehicule_retire: v, demande_vehicule: { id: dv.id, statut: dv.statut } },
          })
          .catch((err) => console.error('[log REMOVE_VEHICULE]', err))
      }
    }

    return { removed: result.toRemove.length, added: result.toAdd.length }
  }

  async patchDemandeVehicule(
    demandeId: string,
    dvId: string,
    fields: { montant?: number; n_liter?: number; kilometrage?: number; statut?: string },
    role: AppRole,
    userId: string
  ): Promise<{ dv: DemandeVehicule; promoted: boolean; promotedDepartement?: string; promotedCentre?: string }> {
    if (!['Admin', 'MENAGER', 'responsable_station'].includes(role)) {
      throw Object.assign(new Error('Accès refusé'), { status: 403 })
    }

    if (role === 'responsable_station') {
      // La station ne saisit que sur les demandes de son centre.
      const [userCentre, demande] = await Promise.all([
        getUserCentre(userId),
        demandeRepo().findOne({ where: { id: demandeId }, select: { id: true, centre: true } }),
      ])
      if (!demande) throw httpError(404, 'Demande introuvable')
      if (!userCentre || demande.centre !== userCentre) {
        throw httpError(403, "Accès refusé — demande d'un autre centre")
      }
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
            return { dv: saved, promoted: true, promotedDepartement: demande.departement, promotedCentre: demande.centre }
          }
        }
      }

      return { dv: saved, promoted: false }
    })
  }

  /**
   * Rapport de consommation par véhicule d'une demande.
   *
   * Pour chaque véhicule de la demande courante, on cherche son ravitaillement
   * PRÉCÉDENT dans le circuit demande (table demande_vehicules uniquement — pas
   * le journal direct ravitaillements_vehicules) : même véhicule, statut 'valide',
   * kilométrage renseigné, dans une AUTRE demande créée avant, le plus récent.
   *
   * On ne rend AUCUN jugement (normal/anormal) : uniquement les chiffres bruts et
   * un statut de calcul pour que la Cellule décide elle-même. Lecture seule.
   * Réservé à Admin et MENAGER (la Cellule) — le contrôle d'accès est fait ici.
   */
  async getHistoriqueVehicules(demandeId: string, role: AppRole) {
    if (role !== 'Admin' && role !== 'MENAGER') {
      throw Object.assign(new Error('Accès refusé'), { status: 403 })
    }

    const demande = await demandeRepo().findOne({
      where: { id: demandeId },
      select: { id: true, created_at: true },
    })
    if (!demande) return null

    const currentDvs = await dvRepo()
      .createQueryBuilder('dv')
      .leftJoinAndSelect('dv.vehicule', 'v')
      .where('dv.demande_id = :id', { id: demandeId })
      .orderBy('dv.created_at', 'ASC')
      .getMany()

    const vehicules = []
    for (const dv of currentDvs) {
      const kmActuel = dv.kilometrage != null ? parseFloat(dv.kilometrage) : null
      const litres = dv.n_liter != null ? parseFloat(dv.n_liter) : null

      const base = {
        vehicule_id: dv.vehicule_id,
        matricule: dv.vehicule?.matricule ?? null,
        date_precedent: null as Date | null,
        km_precedent: null as number | null,
        km_actuel: kmActuel,
        distance: null as number | null,
        litres,
        consommation: null as number | null,
        statut_calcul: 'ok' as 'ok' | 'pas_historique' | 'km_manquant' | 'km_incoherent',
      }

      // Véhicule sans compteur exploitable : inutile d'interroger l'historique.
      if (kmActuel === null) {
        vehicules.push({ ...base, ...evaluerConsommation({ kmActuel, kmPrecedent: null, litres }) })
        continue
      }

      // Ravitaillement précédent (circuit demande), le plus récent avant celui-ci.
      const prev = await dvRepo()
        .createQueryBuilder('dv')
        .where('dv.vehicule_id = :vid', { vid: dv.vehicule_id })
        .andWhere("dv.statut = 'valide'")
        .andWhere('dv.kilometrage IS NOT NULL')
        .andWhere('dv.demande_id != :did', { did: demandeId })
        .andWhere('dv.created_at < :cutoff', { cutoff: demande.created_at })
        .orderBy('dv.created_at', 'DESC')
        .getOne()

      const kmPrecedent = prev && prev.kilometrage !== null ? parseFloat(prev.kilometrage) : null
      if (prev && kmPrecedent !== null) {
        base.date_precedent = prev.created_at
        base.km_precedent = kmPrecedent
      }

      vehicules.push({ ...base, ...evaluerConsommation({ kmActuel, kmPrecedent, litres }) })
    }

    return { demande_id: demandeId, vehicules }
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
