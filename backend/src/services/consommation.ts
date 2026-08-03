/**
 * Calcul de consommation par véhicule — logique pure, sans accès base.
 *
 * Extrait de demandeService.getHistoriqueVehicules pour être testable
 * isolément. Le comportement est identique : aucun jugement automatique
 * (normal/anormal), uniquement les chiffres et un statut de calcul.
 */

export type StatutCalcul = 'ok' | 'pas_historique' | 'km_manquant' | 'km_incoherent'

export interface ConsommationInput {
  /** Compteur du ravitaillement courant. null = non renseigné. */
  kmActuel: number | null
  /** Compteur du ravitaillement précédent. null = aucun précédent exploitable. */
  kmPrecedent: number | null
  /** Litres du ravitaillement courant. null = non renseigné. */
  litres: number | null
}

export interface ConsommationResult {
  distance: number | null
  /** En L/100km, arrondi à 0,1 près. null si non calculable. */
  consommation: number | null
  statut_calcul: StatutCalcul
}

export function evaluerConsommation({
  kmActuel,
  kmPrecedent,
  litres,
}: ConsommationInput): ConsommationResult {
  // Véhicule sans compteur exploitable sur ce ravitaillement.
  if (kmActuel === null) {
    return { distance: null, consommation: null, statut_calcul: 'km_manquant' }
  }

  // Aucun ravitaillement précédent : rien à comparer.
  if (kmPrecedent === null) {
    return { distance: null, consommation: null, statut_calcul: 'pas_historique' }
  }

  // Compteur remis à zéro, remplacé, ou saisie erronée.
  if (kmActuel <= kmPrecedent) {
    return {
      distance: kmActuel - kmPrecedent,
      consommation: null,
      statut_calcul: 'km_incoherent',
    }
  }

  const distance = kmActuel - kmPrecedent
  // distance > 0 garanti ici → pas de division par zéro.
  const consommation =
    litres != null ? Math.round((litres / distance) * 100 * 10) / 10 : null

  return { distance, consommation, statut_calcul: 'ok' }
}
