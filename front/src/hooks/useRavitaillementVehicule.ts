import { useEffect, useState } from "react";
import {
  apiGetRavitaillements,
  apiCreateRavitaillement,
  apiUpdateRavitaillement,
  apiDeleteRavitaillement,
} from "@/lib/api";
import { writeActivityLogSafe } from "@/lib/activityLogs";
import type { RavitaillementVehicule, Vehicule } from "@/types";

interface RavitaillementRow {
  id: number;
  date: string | null;
  vehicule_id: number;
  montant_ravitaille: number | string;
  commentaire: string | null;
  kilometrage: number | string;
  n_liter: number | string;
  created_at?: string;
  updated_at?: string;
  vehicule?: {
    id: number;
    vehicule: string;
    matricule: string;
    utilisationAffectation: string;
    chauffeurResponsable?: string | null;
    zone: string;
    centre?: string | null;
  } | null;
}

interface RavitaillementVehiculePayload {
  date: string | null;
  vehiculeId: number;
  montantRavitaille: number;
  commentaire: string;
  kilometrage: number;
  nLiter: number;
}

function mapRow(row: RavitaillementRow): RavitaillementVehicule {
  const v = row.vehicule ?? null;
  const vehicule: Vehicule | null = v
    ? {
        id: v.id,
        vehicule: v.vehicule,
        matricule: v.matricule,
        utilisationAffectation: v.utilisationAffectation,
        chauffeurResponsable: v.chauffeurResponsable,
        zone: v.zone,
        centre: v.centre,
      }
    : null;

  return {
    id: row.id,
    date: row.date,
    vehiculeId: row.vehicule_id,
    vehicule,
    montantRavitaille: Number(row.montant_ravitaille || 0),
    commentaire: row.commentaire || "",
    kilometrage: Number(row.kilometrage || 0),
    nLiter: Number(row.n_liter || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toApiPayload(payload: RavitaillementVehiculePayload) {
  return {
    date: payload.date,
    vehicule_id: payload.vehiculeId,
    montant_ravitaille: payload.montantRavitaille,
    commentaire: payload.commentaire,
    kilometrage: payload.kilometrage,
    n_liter: payload.nLiter,
  };
}

export function useRavitaillementsVehicule() {
  const [ravitaillements, setRavitaillements] = useState<RavitaillementVehicule[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    void loadRavitaillements().catch(() => undefined);
  }, []);

  async function loadRavitaillements() {
    setLoading(true);
    try {
      const data = await apiGetRavitaillements();
      setRavitaillements(((data as RavitaillementRow[]) ?? []).map(mapRow));
    } catch (error) {
      console.error("Erreur chargement ravitaillements vehicules:", error);
      throw error;
    } finally {
      setLoading(false);
    }
  }

  async function addRavitaillementVehicule(payload: RavitaillementVehiculePayload) {
    const data = await apiCreateRavitaillement(toApiPayload(payload));

    await writeActivityLogSafe({
      module: "ravitaillements",
      action: "CREATE",
      targetTable: "ravitaillements_vehicules",
      targetId: data.id,
      description: `Creation d'un ravitaillement du ${payload.date || "-"} pour le vehicule ${payload.vehiculeId}.`,
      afterData: payload,
    });

    await loadRavitaillements();
  }

  async function updateRavitaillementVehicule(payload: RavitaillementVehicule) {
    const previousRavitaillement = ravitaillements.find((item) => item.id === payload.id) || null;
    await apiUpdateRavitaillement(String(payload.id), toApiPayload({
      date:              payload.date,
      vehiculeId:        payload.vehiculeId,
      montantRavitaille: payload.montantRavitaille,
      commentaire:       payload.commentaire,
      kilometrage:       payload.kilometrage,
      nLiter:            payload.nLiter,
    }));

    await writeActivityLogSafe({
      module: "ravitaillements",
      action: "UPDATE",
      targetTable: "ravitaillements_vehicules",
      targetId: payload.id,
      description: `Modification du ravitaillement ${payload.id}.`,
      beforeData: previousRavitaillement,
      afterData: payload,
    });

    await loadRavitaillements();
  }

  async function deleteRavitaillementVehicule(id: number) {
    const previousRavitaillement = ravitaillements.find((item) => item.id === id) || null;
    await apiDeleteRavitaillement(String(id));

    await writeActivityLogSafe({
      module: "ravitaillements",
      action: "DELETE",
      targetTable: "ravitaillements_vehicules",
      targetId: id,
      description: `Suppression du ravitaillement ${id}.`,
      beforeData: previousRavitaillement,
    });

    await loadRavitaillements();
  }

  return {
    ravitaillements,
    loading,
    addRavitaillementVehicule,
    updateRavitaillementVehicule,
    deleteRavitaillementVehicule,
    reload: loadRavitaillements,
  };
}
