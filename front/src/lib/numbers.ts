/**
 * Convertit une valeur numérique venant de l'API en nombre fini.
 *
 * Les colonnes DECIMAL de MySQL sont renvoyées en texte par le driver
 * ("36.00"), et peuvent être null/undefined (véhicule non validé, montant
 * non saisi). Toute valeur absente ou non numérique compte pour 0 : une
 * somme ne doit jamais produire NaN ni concaténer des chaînes.
 */
export function toNumber(value: unknown): number {
  if (value == null || value === "") return 0;
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** Somme sûre d'une liste de valeurs (texte, null, undefined → 0). */
export function sumBy<T>(items: readonly T[], pick: (item: T) => unknown): number {
  return items.reduce((sum, item) => sum + toNumber(pick(item)), 0);
}
