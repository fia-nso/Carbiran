/** Départements de demande. Le département d'un véhicule = son champ `zone`. */
export const DEPARTEMENTS = ["Zone A", "Zone B", "RX&SYS", "FO", "CPDE", "DC", "Autre"] as const;
export type Departement = (typeof DEPARTEMENTS)[number];

export const DEPT_LABELS: Partial<Record<Departement, string>> = {
  DC: "Direction Commerciale (DC)",
  Autre: "Autre département",
};

const KNOWN_ZONES: readonly string[] = ["zone a", "zone b", "rx&sys", "fo", "cpde", "dc"];
const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** Même règle que le backend : « Autre » = toute zone hors de la liste connue. */
export function vehiculeDansDepartement(zoneVehicule: string | null | undefined, departement: string): boolean {
  if (norm(departement) === "autre") return !KNOWN_ZONES.includes(norm(zoneVehicule));
  return norm(zoneVehicule) === norm(departement);
}
