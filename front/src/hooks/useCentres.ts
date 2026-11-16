import { useCallback, useEffect, useMemo, useState } from "react";
import { apiCreateCentre, apiGetCentres, apiUpdateCentre } from "@/lib/api";
import type { Centre } from "@/types";

/**
 * Liste des centres (table `centres`).
 * `actifsSeulement` : ne charge que les centres actifs (listes déroulantes de saisie).
 */
export function useCentres(actifsSeulement = false) {
  const [centres, setCentres] = useState<Centre[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = (await apiGetCentres(actifsSeulement)) as Centre[];
      setCentres(data ?? []);
    } catch (e) {
      console.error("Erreur chargement centres:", e);
      setError("Impossible de charger les centres.");
    } finally {
      setLoading(false);
    }
  }, [actifsSeulement]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const byCode = useMemo(() => {
    const map: Record<string, Centre> = {};
    for (const c of centres) map[c.code] = c;
    return map;
  }, [centres]);

  /** « Zone B — KIFFA » (repli : le code seul). */
  const libelle = useCallback(
    (code: string | null | undefined) => {
      if (!code) return "—";
      const c = byCode[code.trim().toUpperCase()];
      return c ? `${c.zone} — ${c.code}` : code;
    },
    [byCode]
  );

  async function createCentre(data: { code: string; nom: string; zone: string; actif?: boolean }) {
    const created = (await apiCreateCentre(data)) as Centre;
    await reload();
    return created;
  }

  async function updateCentre(code: string, data: { nom?: string; zone?: string; actif?: boolean }) {
    const updated = (await apiUpdateCentre(code, data)) as Centre;
    await reload();
    return updated;
  }

  return { centres, byCode, libelle, loading, error, reload, createCentre, updateCentre };
}

/** Normalise un code centre pour comparaison (trim + majuscules). */
export const normCentre = (code: string | null | undefined) => (code ?? "").trim().toUpperCase();
