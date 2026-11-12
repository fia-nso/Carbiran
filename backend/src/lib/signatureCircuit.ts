export type CircuitName = 'situation' | 'bons'

const CIRCUIT_NAMES: CircuitName[] = ['situation', 'bons']

const CIRCUITS: Record<CircuitName, { default: string[]; DC: string[] }> = {
  situation: {
    default: ['chef_departement', 'directeur_technique', 'chef_cellule', 'directeur_general', 'directrice_financiere'],
    DC:      ['directeur_commercial', 'chef_cellule', 'directeur_general', 'directrice_financiere'],
  },
  bons: {
    default: ['chef_departement', 'chef_cellule', 'directeur_general'],
    DC:      ['directeur_commercial', 'chef_cellule', 'directeur_general'],
  },
}

type SignatureLite = { role: string; circuit: string }

export interface EtatSignature {
  /** Circuits contenant le rôle et qu'il n'a pas encore signés. */
  manquants: CircuitName[]
  /** Rôles qui doivent signer avant lui dans ses circuits manquants. */
  attenteDe: string[]
}

export function getCircuitSteps(circuit: CircuitName, departement: string): string[] {
  return CIRCUITS[circuit][departement === 'DC' ? 'DC' : 'default']
}

export function getOrdre(circuit: CircuitName, departement: string, role: string): number {
  return getCircuitSteps(circuit, departement).indexOf(role) + 1
}

export function resolveCircuitRole(userRole: string, circuitRole: string | null): string | null {
  if (userRole === 'chef_departement') return 'chef_departement'
  if (userRole === 'Admin' || userRole === 'MENAGER') return 'chef_cellule'
  if (userRole === 'signataire') return circuitRole
  return null
}

export function isRoleInCircuits(departement: string, role: string): boolean {
  return CIRCUIT_NAMES.some((circuit) => getCircuitSteps(circuit, departement).includes(role))
}

export function getEtatSignature(
  signatures: SignatureLite[],
  departement: string,
  role: string
): EtatSignature {
  const manquants: CircuitName[] = []
  const attenteDe = new Set<string>()

  for (const circuit of CIRCUIT_NAMES) {
    const steps = getCircuitSteps(circuit, departement)
    if (!steps.includes(role)) continue

    const signed = new Set(signatures.filter((s) => s.circuit === circuit).map((s) => s.role))
    if (signed.has(role)) continue

    manquants.push(circuit)
    const prochain = steps.find((step) => !signed.has(step))
    if (prochain && prochain !== role) attenteDe.add(prochain)
  }

  return { manquants, attenteDe: [...attenteDe] }
}

export function peutSigner(etat: EtatSignature): boolean {
  return etat.manquants.length > 0 && etat.attenteDe.length === 0
}

export function getRolesPouvantSigner(signatures: SignatureLite[], departement: string): Set<string> {
  const roles = CIRCUIT_NAMES.flatMap((circuit) => getCircuitSteps(circuit, departement))
  return new Set(roles.filter((role) => peutSigner(getEtatSignature(signatures, departement, role))))
}
