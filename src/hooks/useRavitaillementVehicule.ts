import { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { writeActivityLogSafe } from "@/lib/activityLogs";
import type { RavitaillementVehicule, Vehicule } from "@/types";

interface VehiculeRow {
  id: number;
  vehicule: string;
  matricule: string;
  utilisation_affectation: string;
  chauffeur_responsable?: string | null;
  zone: string;
  centre?: string | null;
}

interface RavitaillementVehiculeRow {
  id: number;
  date: string | null;
  vehicule_id: number;
  montant_ravitaille: number | string;
  commentaire: string | null;
  kilometrage: number | string;
  n_liter: number | string;
  created_at?: string;
  updated_at?: string;
  vehicule?: VehiculeRow | VehiculeRow[] | null;
}

interface RavitaillementVehiculePayload {
  date: string | null;
  vehiculeId: number;
  montantRavitaille: number;
  commentaire: string;
  kilometrage: number;
  nLiter: number;
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

function mapRavitaillementRow(row: RavitaillementVehiculeRow): RavitaillementVehicule {
  const vehiculeRow = Array.isArray(row.vehicule) ? row.vehicule[0] || null : row.vehicule || null;

  return {
    id: row.id,
    date: row.date,
    vehiculeId: row.vehicule_id,
    vehicule: vehiculeRow ? mapVehiculeRow(vehiculeRow) : null,
    montantRavitaille: Number(row.montant_ravitaille || 0),
    commentaire: row.commentaire || "",
    kilometrage: Number(row.kilometrage || 0),
    nLiter: Number(row.n_liter || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildRavitaillementPayload(payload: RavitaillementVehiculePayload) {
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
      const { data, error } = await supabase
        .from("ravitaillements_vehicules")
        .select(
          "id, date, vehicule_id, montant_ravitaille, commentaire, kilometrage, n_liter, created_at, updated_at, vehicule:vehicules(id, vehicule, matricule, utilisation_affectation, chauffeur_responsable, zone, centre)"
        )
        .order("date", { ascending: false, nullsFirst: false })
        .order("id", { ascending: false });

      if (error) {
        throw error;
      }

      setRavitaillements(
        ((data as unknown as RavitaillementVehiculeRow[] | null) || []).map(mapRavitaillementRow)
      );
    } catch (error) {
      console.error("Erreur chargement ravitaillements vehicules:", error);
      throw error;
    } finally {
      setLoading(false);
    }
  }

  async function addRavitaillementVehicule(payload: RavitaillementVehiculePayload) {
    const { data, error } = await supabase
      .from("ravitaillements_vehicules")
      .insert([buildRavitaillementPayload(payload)])
      .select("id")
      .single();

    if (error) {
      console.error("Erreur ajout ravitaillement vehicule:", error);
      throw error;
    }

    await writeActivityLogSafe({
      module: "ravitaillements",
      action: "CREATE",
      targetTable: "ravitaillements_vehicules",
      targetId: data.id,
      description: `Creation d'un ravitaillement du ${payload.date || "-"} pour le vehicule ${payload.vehiculeId}.`,
      afterData: {
        ...payload,
      },
    });

    await loadRavitaillements();
  }

  async function updateRavitaillementVehicule(payload: RavitaillementVehicule) {
    const previousRavitaillement =
      ravitaillements.find((item) => item.id === payload.id) || null;
    const { error } = await supabase
      .from("ravitaillements_vehicules")
      .update(
        buildRavitaillementPayload({
          date: payload.date,
          vehiculeId: payload.vehiculeId,
          montantRavitaille: payload.montantRavitaille,
          commentaire: payload.commentaire,
          kilometrage: payload.kilometrage,
          nLiter: payload.nLiter,
        })
      )
      .eq("id", payload.id);

    if (error) {
      console.error("Erreur mise a jour ravitaillement vehicule:", error);
      throw error;
    }

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
    const previousRavitaillement =
      ravitaillements.find((item) => item.id === id) || null;
    const { error } = await supabase
      .from("ravitaillements_vehicules")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Erreur suppression ravitaillement vehicule:", error);
      throw error;
    }

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
