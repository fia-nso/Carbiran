import { useState, useCallback } from "react";
import { supabase } from "@/supabaseClient";
import { notifyByRole, notifyByRoleAndDept } from "@/lib/notifications";
import type {
  DemandeRavitaillement,
  DemandeVehicule,
  Notification,
  StatutDemande,
  TypePhoto,
} from "@/types";

// ---------------------------------------------------------------------------
// Raw DB row types (snake_case)
// ---------------------------------------------------------------------------

interface PhotoRow {
  id: string;
  demande_vehicule_id: string;
  url: string;
  type: TypePhoto;
  uploaded_at: string;
}

interface DemandeVehiculeRow {
  id: string;
  demande_id: string;
  vehicule_id: number;
  montant: number | null;
  n_liter: number | null;
  kilometrage: number | null;
  statut: string;
  vehicule: {
    id: number;
    vehicule: string;
    matricule: string;
    utilisation_affectation: string;
    chauffeur_responsable: string | null;
    zone: string;
  } | null;
  photos_justification: PhotoRow[] | null;
}

interface DemandeRow {
  id: string;
  departement: string;
  statut: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  demande_vehicules: DemandeVehiculeRow[] | null;
  creator: { email: string } | null;
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
    vehicule: row.vehicule
      ? {
          id: row.vehicule.id,
          vehicule: row.vehicule.vehicule,
          matricule: row.vehicule.matricule,
          utilisationAffectation: row.vehicule.utilisation_affectation,
          chauffeurResponsable: row.vehicule.chauffeur_responsable,
          zone: row.vehicule.zone,
        }
      : undefined,
    photos: row.photos_justification ?? undefined,
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
    creator: row.creator
      ? { email: row.creator.email, full_name: row.creator.email }
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// Select fragment reused across queries
// ---------------------------------------------------------------------------

const DEMANDE_SELECT = `
  id, departement, statut, created_by, created_at, updated_at,
  creator:profiles!created_by(email),
  demande_vehicules(
    id, demande_id, vehicule_id, montant, n_liter, kilometrage, statut,
    vehicule:vehicules(id, vehicule, matricule, utilisation_affectation, chauffeur_responsable, zone),
    photos_justification(id, demande_vehicule_id, url, type, uploaded_at)
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
    async (departement: string, vehiculeIds: number[]) => {
      const { data: session } = await supabase.auth.getUser();
      const userId = session.user?.id;
      if (!userId) throw new Error("Utilisateur non connecté.");

      const { data: demande, error: demandeErr } = await supabase
        .from("demandes_ravitaillement")
        .insert({ departement, statut: "en_attente", created_by: userId })
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

      // Notifier le(s) chef(s) du département concerné
      void notifyByRoleAndDept(
        "chef_departement",
        departement,
        `Nouvelle demande de ravitaillement — ${departement} (${vehiculeIds.length} véhicule(s)).`,
        "nouvelle_demande",
        demande.id
      );

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

      void notifyByRole(
        "responsable_station",
        `Une demande${departement ? ` — ${departement}` : ""} est prête pour ravitaillement.`,
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
    fetchNotifications,
    marquerNotificationLue,
  };
}
