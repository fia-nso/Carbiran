import { useEffect, useState } from "react";
import {
  apiGetVehicules,
  apiCreateVehicule,
  apiUpdateVehicule,
  apiDeleteVehicule,
} from "@/lib/api";
import { writeActivityLogSafe } from "@/lib/activityLogs";
import type { Vehicule } from "@/types";

interface VehiculeRow {
  id: number;
  vehicule: string;
  matricule: string;
  utilisation_affectation: string;
  chauffeur_responsable?: string | null;
  zone: string;
  centre?: string | null;
}

interface VehiculePayload {
  vehicule: string;
  matricule: string;
  utilisationAffectation: string;
  chauffeurResponsable?: string | null;
  zone: string;
  centre?: string | null;
}

function mapVehiculeRow(row: VehiculeRow): Vehicule {
  return {
    id: row.id,
    vehicule: row.vehicule,
    matricule: row.matricule,
    utilisationAffectation: row.utilisation_affectation,
    chauffeurResponsable: row.chauffeur_responsable,
    zone: row.zone,
    centre: row.centre,
  };
}

function toApiPayload(payload: VehiculePayload) {
  return {
    vehicule: payload.vehicule,
    matricule: payload.matricule,
    utilisation_affectation: payload.utilisationAffectation,
    chauffeur_responsable: payload.chauffeurResponsable || null,
    zone: payload.zone,
    centre: payload.centre || null,
  };
}

export function useVehicules() {
  const [vehicules, setVehicules] = useState<Vehicule[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>("");
  const [centreFilter, setCentreFilter] = useState<string>("");

  useEffect(() => {
    void loadVehicules().catch(() => undefined);
  }, []);

  async function loadVehicules() {
    setLoading(true);
    try {
      const data = await apiGetVehicules();
      setVehicules(((data as VehiculeRow[]) ?? []).map(mapVehiculeRow));
    } catch (error) {
      console.error("Erreur chargement vehicules:", error);
      throw error;
    } finally {
      setLoading(false);
    }
  }

  async function addVehicule(payload: VehiculePayload) {
    const data = await apiCreateVehicule(toApiPayload(payload));
    const created = mapVehiculeRow(data as VehiculeRow);

    await writeActivityLogSafe({
      module: "vehicules",
      action: "CREATE",
      targetTable: "vehicules",
      targetId: created.id,
      description: `Creation du vehicule ${created.vehicule}.`,
      afterData: created,
    });

    await loadVehicules();
  }

  async function updateVehicule(payload: Vehicule) {
    const previousVehicule = vehicules.find((item) => item.id === payload.id) || null;
    const data = await apiUpdateVehicule(String(payload.id), toApiPayload(payload));
    const updated = mapVehiculeRow(data as VehiculeRow);

    await writeActivityLogSafe({
      module: "vehicules",
      action: "UPDATE",
      targetTable: "vehicules",
      targetId: payload.id,
      description: `Modification du vehicule ${payload.vehicule}.`,
      beforeData: previousVehicule,
      afterData: updated,
    });

    await loadVehicules();
  }

  async function deleteVehicule(id: number) {
    const previousVehicule = vehicules.find((item) => item.id === id) || null;
    await apiDeleteVehicule(String(id));

    await writeActivityLogSafe({
      module: "vehicules",
      action: "DELETE",
      targetTable: "vehicules",
      targetId: id,
      description: `Suppression du vehicule ${previousVehicule?.vehicule || id}.`,
      beforeData: previousVehicule,
    });

    await loadVehicules();
  }

  const normalizedSearch = search.trim().toLowerCase();

  const centresDisponibles = Array.from(
    new Set(vehicules.map((v) => v.centre).filter((c): c is string => Boolean(c)))
  ).sort();

  const vehiculesFiltres = vehicules.filter((item) => {
    const matchSearch = !normalizedSearch || [
      item.vehicule,
      item.matricule,
      item.utilisationAffectation,
      item.chauffeurResponsable || "",
      item.zone,
      item.centre || "",
    ].some((value) => value.toLowerCase().includes(normalizedSearch));

    const matchCentre = !centreFilter || item.centre === centreFilter;

    return matchSearch && matchCentre;
  });

  return {
    vehicules: vehiculesFiltres,
    loading,
    search,
    setSearch,
    centreFilter,
    setCentreFilter,
    centresDisponibles,
    addVehicule,
    updateVehicule,
    deleteVehicule,
    reload: loadVehicules,
    allVehicules: vehicules,
  };
}
