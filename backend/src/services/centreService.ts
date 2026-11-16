import { AppDataSource } from '../config/database'
import { Centre } from '../entities/Centre'

export const ZONES_CENTRE = ['Zone A', 'Zone B'] as const
export type ZoneCentre = (typeof ZONES_CENTRE)[number]

/** Code centre : majuscules, chiffres, '_' ou '-', sans espaces. */
const CODE_REGEX = /^[A-Z0-9_-]+$/

function repo() {
  return AppDataSource.getRepository(Centre)
}

function httpError(status: number, message: string): Error {
  return Object.assign(new Error(message), { status })
}

/** Normalise un code saisi : trim + majuscules. '' / null / undefined -> null. */
export function normaliserCodeCentre(code: unknown): string | null {
  if (code === null || code === undefined) return null
  if (typeof code !== 'string') throw httpError(400, 'Code centre invalide')
  const c = code.trim().toUpperCase()
  return c === '' ? null : c
}

function validerZone(zone: unknown): ZoneCentre {
  if (typeof zone !== 'string' || !ZONES_CENTRE.includes(zone.trim() as ZoneCentre)) {
    throw httpError(400, `Zone invalide (valeurs autorisées : ${ZONES_CENTRE.join(', ')})`)
  }
  return zone.trim() as ZoneCentre
}

function validerNom(nom: unknown): string {
  if (typeof nom !== 'string' || nom.trim() === '') throw httpError(400, 'Nom du centre requis')
  return nom.trim()
}

export class CentreService {
  async findAll(options: { actifsSeulement?: boolean } = {}) {
    return repo().find({
      where: options.actifsSeulement ? { actif: true } : {},
      order: { zone: 'ASC', nom: 'ASC' },
    })
  }

  async findByCode(code: string) {
    const c = normaliserCodeCentre(code)
    if (!c) return null
    return repo().findOne({ where: { code: c } })
  }

  /**
   * Vérifie qu'un code centre existe (et est actif si demandé).
   * Retourne le code normalisé, ou null si la valeur est vide.
   * Lève une erreur 400 si le centre est inconnu / inactif.
   */
  async verifierCode(code: unknown, options: { actifRequis?: boolean } = {}): Promise<string | null> {
    const c = normaliserCodeCentre(code)
    if (!c) return null
    const centre = await repo().findOne({ where: { code: c } })
    if (!centre) throw httpError(400, `Centre inconnu : ${c}`)
    if (options.actifRequis && !centre.actif) throw httpError(400, `Centre inactif : ${c}`)
    return c
  }

  async create(data: { code: unknown; nom: unknown; zone: unknown; actif?: unknown }) {
    const code = normaliserCodeCentre(data.code)
    if (!code) throw httpError(400, 'Code centre requis')
    if (!CODE_REGEX.test(code)) {
      throw httpError(400, 'Code centre invalide : majuscules, chiffres, "_" ou "-" uniquement, sans espaces')
    }
    if (data.actif !== undefined && typeof data.actif !== 'boolean') {
      throw httpError(400, 'actif doit être un booléen')
    }
    if (await repo().findOne({ where: { code } })) {
      throw httpError(409, `Le centre ${code} existe déjà`)
    }
    const centre = repo().create({
      code,
      nom: validerNom(data.nom),
      zone: validerZone(data.zone),
      actif: (data.actif as boolean | undefined) ?? true,
    })
    return repo().save(centre)
  }

  /** Modifie nom / zone / actif. Le code n'est JAMAIS modifiable. */
  async update(code: string, data: Record<string, unknown>) {
    if ('code' in data) throw httpError(400, 'Le code d\'un centre ne peut pas être modifié')

    const fields: Partial<Centre> = {}
    if ('nom' in data) fields.nom = validerNom(data['nom'])
    if ('zone' in data) fields.zone = validerZone(data['zone'])
    if ('actif' in data) {
      if (typeof data['actif'] !== 'boolean') throw httpError(400, 'actif doit être un booléen')
      fields.actif = data['actif']
    }
    if (Object.keys(fields).length === 0) throw httpError(400, 'Aucune modification fournie')

    const c = normaliserCodeCentre(code)
    const centre = c ? await repo().findOne({ where: { code: c } }) : null
    if (!centre) throw httpError(404, 'Centre introuvable')

    Object.assign(centre, fields)
    return repo().save(centre)
  }
}

/** Libellé lisible d'un centre pour les messages : « Zone B — KIFFA » (repli : le code seul). */
export async function libelleCentre(code: string | null | undefined): Promise<string> {
  const c = normaliserCodeCentre(code ?? null)
  if (!c) return '—'
  try {
    const centre = await repo().findOne({ where: { code: c }, select: { code: true, zone: true } })
    return centre ? `${centre.zone} — ${centre.code}` : c
  } catch {
    return c
  }
}
