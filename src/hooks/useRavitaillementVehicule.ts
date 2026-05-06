import { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { writeActivityLogSafe } from "@/lib/activityLogs";
import type {
  RavitaillementVehicule,
  StatutRavitaillementVehicule,
  Vehicule,
} from "@/types";

interface VehiculeRow {
  id: number;
  vehicule: string;
  matricule: string;
  utilisation_affectation: string;
  chauffeur_responsable?: string | null;
  zone: string;
}

interface RavitaillementVehiculeRow {
  id: number;
  date_situation: string | null;
  date_ravitaillement: string;
  vehicule_id: number;
  montant_prevu: number | string;
  montant_ravitaille: number | string;
  statut: StatutRavitaillementVehicule;
  n_liter: number | string;
  created_at?: string;
  updated_at?: string;
  vehicule?: VehiculeRow | VehiculeRow[] | null;
}

interface RavitaillementVehiculePayload {
  dateSituation: string | null;
  dateRavitaillement: string;
  vehiculeId: number;
  montantPrevu: number;
  montantRavitaille: number;
  statut: StatutRavitaillementVehicule;
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
  };
}

function mapRavitaillementRow(row: RavitaillementVehiculeRow): RavitaillementVehicule {
  const vehiculeRow = Array.isArray(row.vehicule) ? row.vehicule[0] || null : row.vehicule || null;

  return {
    id: row.id,
    dateSituation: row.date_situation,
    dateRavitaillement: row.date_ravitaillement,
    vehiculeId: row.vehicule_id,
    vehicule: vehiculeRow ? mapVehiculeRow(vehiculeRow) : null,
    montantPrevu: Number(row.montant_prevu || 0),
    montantRavitaille: Number(row.montant_ravitaille || 0),
    statut: row.statut,
    nLiter: Number(row.n_liter || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildRavitaillementPayload(payload: RavitaillementVehiculePayload) {
  return {
    date_situation: payload.dateSituation,
    date_ravitaillement: payload.dateRavitaillement,
    vehicule_id: payload.vehiculeId,
    montant_prevu: payload.montantPrevu,
    montant_ravitaille: payload.montantRavitaille,
    statut: payload.statut,
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
          "id, date_situation, date_ravitaillement, vehicule_id, montant_prevu, montant_ravitaille, statut, n_liter, created_at, updated_at, vehicule:vehicules(id, vehicule, matricule, utilisation_affectation, chauffeur_responsable, zone)"
        )
        .order("date_ravitaillement", { ascending: false })
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
      description: `Creation d'un ravitaillement pour le vehicule ${payload.vehiculeId}.`,
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
          dateSituation: payload.dateSituation,
          dateRavitaillement: payload.dateRavitaillement,
          vehiculeId: payload.vehiculeId,
          montantPrevu: payload.montantPrevu,
          montantRavitaille: payload.montantRavitaille,
          statut: payload.statut,
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

  async function updateRavitaillementVehiculeStatut(
    id: number,
    statut: StatutRavitaillementVehicule
  ) {
    const previousRavitaillement =
      ravitaillements.find((item) => item.id === id) || null;
    const { error } = await supabase
      .from("ravitaillements_vehicules")
      .update({ statut })
      .eq("id", id);

    if (error) {
      console.error("Erreur mise a jour statut ravitaillement vehicule:", error);
      throw error;
    }

    await writeActivityLogSafe({
      module: "ravitaillements",
      action: "UPDATE_STATUT",
      targetTable: "ravitaillements_vehicules",
      targetId: id,
      description: `Changement de statut du ravitaillement ${id} vers ${statut}.`,
      beforeData: previousRavitaillement,
      afterData: previousRavitaillement
        ? { ...previousRavitaillement, statut }
        : { id, statut },
      metadata: {
        previousStatut: previousRavitaillement?.statut || null,
        nextStatut: statut,
      },
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
    updateRavitaillementVehiculeStatut,
    deleteRavitaillementVehicule,
    reload: loadRavitaillements,
  };
}
