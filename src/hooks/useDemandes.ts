import { useState, useCallback } from "react";
import { supabase } from "@/supabaseClient";
import { notifyByRole, notifyByRoleAndDept, notifyByRoles } from "@/lib/notifications";
import type {
  DemandeRavitaillement,
  DemandeVehicule,
  Notification,
  StatutDemande,
} from "@/types";

// ---------------------------------------------------------------------------
// Raw DB row types (snake_case)
// ---------------------------------------------------------------------------

interface DemandeVehiculeRow {
  id: string;
  demande_id: string;
  vehicule_id: number;
  montant: number | null;
  n_liter: number | null;
  kilometrage: number | null;
  statut: string;
}

interface DemandeRow {
  id: string;
  departement: string;
  statut: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  demande_vehicules: DemandeVehiculeRow[] | null;
}

interface NotificationRow {
  id: string;
  user_id: string;
  message: string;
  type: string;
  lu: boolean;
  demande_id: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function mapDemandeVehiculeRow(row: DemandeVehiculeRow): DemandeVehicule {
  return {
    id: row.id,
    demande_id: row.demande_id,
    vehicule_id: row.vehicule_id,
    montant: row.montant ?? undefined,
    n_liter: row.n_liter ?? undefined,
    kilometrage: row.kilometrage ?? undefined,
    statut: row.statut as DemandeVehicule["statut"],
  };
}

function mapDemandeRow(row: DemandeRow): DemandeRavitaillement {
  return {
    id: row.id,
    departement: row.departement,
    statut: row.statut as StatutDemande,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    demande_vehicules: row.demande_vehicules
      ? row.demande_vehicules.map(mapDemandeVehiculeRow)
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// Select fragment reused across queries
// ---------------------------------------------------------------------------

const DEMANDE_SELECT = `
  id,
  departement,
  statut,
  created_by,
  created_at,
  updated_at,
  demande_vehicules (
    id,
    demande_id,
    vehicule_id,
    montant,
    n_liter,
    kilometrage,
    statut
  )
`.trim();

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface SaisirRavitaillementData {
  montant?: number;
  n_liter?: number;
  kilometrage?: number;
}

export function useDemandes() {
  const [demandes, setDemandes] = useState<DemandeRavitaillement[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // fetchDemandes — RLS on the DB side filters according to the connected role
  // -------------------------------------------------------------------------

  const fetchDemandes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("demandes_ravitaillement")
        .select(DEMANDE_SELECT)
        .order("created_at", { ascending: false });

      if (err) throw err;
      setDemandes(((data as unknown as DemandeRow[]) ?? []).map(mapDemandeRow));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erreur chargement demandes";
      setError(msg);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  // -------------------------------------------------------------------------
  // createDemande — chef de cours
  // -------------------------------------------------------------------------

  const createDemande = useCallback(
    async (departement: string, vehiculeIds: number[], role?: string) => {
      const { data: session } = await supabase.auth.getUser();
      const userId = session.user?.id;
      if (!userId) throw new Error("Utilisateur non connecté.");

      const isChefDept = role === "chef_departement";
      const statutInitial = isChefDept ? "validee_dept" : "en_attente";

      const { data: demande, error: demandeErr } = await supabase
        .from("demandes_ravitaillement")
        .insert({ departement, statut: statutInitial, created_by: userId })
        .select("id")
        .single();

      if (demandeErr) throw demandeErr;

      const vehiculeRows = vehiculeIds.map((vehicule_id) => ({
        demande_id: demande.id,
        vehicule_id,
        statut: "en_attente",
      }));

      const { error: dvErr } = await supabase
        .from("demande_vehicules")
        .insert(vehiculeRows);

      if (dvErr) throw dvErr;

      if (isChefDept) {
        // Demande directement validée — notifier les stations
        void notifyByRoles(
          ["responsable_station", "responsable_station_viewer"],
          `Nouvelle demande approuvée pour ${departement} — ravitaillement à effectuer`,
          "validation_dept",
          demande.id
        );
      } else {
        // Demande en attente — notifier le chef du département
        void notifyByRoleAndDept(
          "chef_departement",
          departement,
          `Nouvelle demande de ravitaillement — ${departement} (${vehiculeIds.length} véhicule(s)).`,
          "nouvelle_demande",
          demande.id
        );
      }

      await fetchDemandes();
      return demande.id as string;
    },
    [fetchDemandes]
  );

  // -------------------------------------------------------------------------
  // validerDemandeDept — chef département
  // -------------------------------------------------------------------------

  const validerDemandeDept = useCallback(
    async (demandeId: string, departement?: string) => {
      const { error: err } = await supabase
        .from("demandes_ravitaillement")
        .update({ statut: "validee_dept" })
        .eq("id", demandeId)
        .eq("statut", "en_attente");

      if (err) throw err;

      void notifyByRoles(
        ["responsable_station", "responsable_station_viewer"],
        `Demande approuvée pour ${departement ?? "un département"} — ravitaillement à effectuer`,
        "validation_dept",
        demandeId
      );

      await fetchDemandes();
    },
    [fetchDemandes]
  );

  // -------------------------------------------------------------------------
  // annulerDemande — chef département
  // -------------------------------------------------------------------------

  const annulerDemande = useCallback(
    async (demandeId: string) => {
      const { error: err } = await supabase
        .from("demandes_ravitaillement")
        .update({ statut: "annulee" })
        .eq("id", demandeId);

      if (err) throw err;
      await fetchDemandes();
    },
    [fetchDemandes]
  );

  // -------------------------------------------------------------------------
  // saisirRavitaillement — responsable station
  // -------------------------------------------------------------------------

  const saisirRavitaillement = useCallback(
    async (demandeVehiculeId: string, data: SaisirRavitaillementData) => {
      const { montant, n_liter, kilometrage } = data;

      const { error: updateErr } = await supabase
        .from("demande_vehicules")
        .update({ montant, n_liter, kilometrage, statut: "ravitaille" })
        .eq("id", demandeVehiculeId);

      if (updateErr) throw updateErr;
      await fetchDemandes();
    },
    [fetchDemandes]
  );

  // -------------------------------------------------------------------------
  // validerDemandeStation — responsable station (soumettre à la cellule)
  // -------------------------------------------------------------------------

  const validerDemandeStation = useCallback(
    async (demandeId: string, departement: string) => {
      const { error: err } = await supabase
        .from("demandes_ravitaillement")
        .update({ statut: "validee_station" })
        .eq("id", demandeId)
        .eq("statut", "validee_dept");

      if (err) throw err;

      const msg = `Demande ${departement} prête pour validation par la cellule.`;
      void Promise.all([
        notifyByRole("Admin",   msg, "soumission_station", demandeId),
        notifyByRole("MENAGER", msg, "soumission_station", demandeId),
      ]);

      await fetchDemandes();
    },
    [fetchDemandes]
  );

  // -------------------------------------------------------------------------
  // validerDemandeCellule — cellule (Admin)
  // -------------------------------------------------------------------------

  const validerDemandeCellule = useCallback(
    async (demandeId: string, departement?: string) => {
      const { error: err } = await supabase
        .from("demandes_ravitaillement")
        .update({ statut: "validee_cellule" })
        .eq("id", demandeId)
        .eq("statut", "validee_station");

      if (err) throw err;

      if (departement) {
        void notifyByRoleAndDept(
          "chef_departement",
          departement,
          `La demande ${departement} a été validée par la cellule.`,
          "validation_cellule",
          demandeId
        );
      }

      await fetchDemandes();
    },
    [fetchDemandes]
  );

  // -------------------------------------------------------------------------
  // updateDemandeVehicules — modifier les véhicules d'une demande existante
  // -------------------------------------------------------------------------

  const updateDemandeVehicules = useCallback(
    async (demandeId: string, vehiculeIds: number[]) => {
      // ── Étape 1 : récupérer les IDs existants ──────────────────────────────
      const { data: existingDvs, error: fetchErr } = await supabase
        .from("demande_vehicules")
        .select("id")
        .eq("demande_id", demandeId);

      if (fetchErr) throw fetchErr;

      console.log(
        `[updateDemandeVehicules] ${existingDvs?.length ?? 0} véhicule(s) existant(s) pour demande ${demandeId}`
      );

      // ── Étape 2 : supprimer les photos liées ──────────────────────────────
      if (existingDvs && existingDvs.length > 0) {
        const dvIds = existingDvs.map((r: { id: string }) => r.id);
        const { error: photoErr } = await supabase
          .from("photos_justification")
          .delete()
          .in("demande_vehicule_id", dvIds);
        if (photoErr) console.error("[updateDemandeVehicules] erreur suppression photos:", photoErr.message);
      }

      // ── Étape 3 + 4 : supprimer tous les demande_vehicules, attendre ──────
      const { error: deleteErr, count: deletedCount } = await supabase
        .from("demande_vehicules")
        .delete({ count: "exact" })
        .eq("demande_id", demandeId);

      console.log(`[updateDemandeVehicules] suppression: ${deletedCount ?? "?"} ligne(s) supprimée(s), erreur: ${deleteErr?.message ?? "aucune"}`);

      if (deleteErr) throw deleteErr;

      // ── Étape 5 : insérer les nouveaux véhicules ──────────────────────────
      if (vehiculeIds.length > 0) {
        const rows = vehiculeIds.map((vehicule_id) => ({
          demande_id: demandeId,
          vehicule_id,
          statut: "en_attente",
        }));
        const { data: inserted, error: insertErr } = await supabase
          .from("demande_vehicules")
          .insert(rows)
          .select("id");
        if (insertErr) throw insertErr;
        console.log(`[updateDemandeVehicules] ${inserted?.length ?? 0} nouveau(x) véhicule(s) insérés`);
      } else {
        console.log("[updateDemandeVehicules] aucun véhicule à insérer");
      }

      await fetchDemandes();
    },
    [fetchDemandes]
  );

  // -------------------------------------------------------------------------
  // retournerRavitaillement — remettre un véhicule en_attente + notif station
  // -------------------------------------------------------------------------

  const retournerRavitaillement = useCallback(
    async (demandeVehiculeId: string, demandeId: string, matricule?: string) => {
      // Only reset if vehicle is still in "ravitaille" state (guard against double-call)
      const { error: updateErr } = await supabase
        .from("demande_vehicules")
        .update({ statut: "en_attente", montant: null, n_liter: null, kilometrage: null })
        .eq("id", demandeVehiculeId)
        .eq("statut", "ravitaille");
      if (updateErr) throw updateErr;

      // Delete photos so station can re-upload corrected ones
      const { error: photoErr } = await supabase
        .from("photos_justification")
        .delete()
        .eq("demande_vehicule_id", demandeVehiculeId);
      if (photoErr) console.error("retournerRavitaillement photo delete:", photoErr.message);

      // If demande was already submitted to cellule (validee_station), revert it so
      // the station can re-do the vehicle and re-submit via validerDemandeStation
      await supabase
        .from("demandes_ravitaillement")
        .update({ statut: "validee_dept" })
        .eq("id", demandeId)
        .eq("statut", "validee_station");

      const msg = `Ravitaillement retourné pour correction${matricule ? ` : ${matricule}` : ""}`;
      void notifyByRoles(
        ["responsable_station", "responsable_station_viewer"],
        msg,
        "retour_station",
        demandeId
      );

      await fetchDemandes();
    },
    [fetchDemandes]
  );

  // -------------------------------------------------------------------------
  // fetchNotifications
  // -------------------------------------------------------------------------

  const fetchNotifications = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("notifications")
      .select("id, user_id, message, type, lu, demande_id, created_at")
      .order("created_at", { ascending: false });

    if (err) throw err;
    setNotifications((data as unknown as NotificationRow[]) ?? []);
  }, []);

  // -------------------------------------------------------------------------
  // marquerNotificationLue
  // -------------------------------------------------------------------------

  const marquerNotificationLue = useCallback(
    async (notificationId: string) => {
      const { error: err } = await supabase
        .from("notifications")
        .update({ lu: true })
        .eq("id", notificationId);

      if (err) throw err;
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, lu: true } : n))
      );
    },
    []
  );

  return {
    demandes,
    notifications,
    loading,
    error,
    fetchDemandes,
    createDemande,
    validerDemandeDept,
    annulerDemande,
    saisirRavitaillement,
    validerDemandeStation,
    validerDemandeCellule,
    updateDemandeVehicules,
    retournerRavitaillement,
    fetchNotifications,
    marquerNotificationLue,
  };
}
