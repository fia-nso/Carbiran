import { useState, useCallback } from "react";
import {
  apiGetDemandes,
  apiCreateDemande,
  apiUpdateDemande,
  apiDeleteDemande,
  apiReplaceDemandeVehicules,
  apiPatchDemandeVehicule,
  apiGetNotifications,
  apiMarquerLu,
} from "@/lib/api";
import type {
  DemandeRavitaillement,
  Notification,
  StatutDemande,
} from "@/types";

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
  // fetchDemandes
  // -------------------------------------------------------------------------

  const fetchDemandes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGetDemandes();
      setDemandes(
        (data as any[]).map((row) => ({
          ...row,
          statut: row.statut as StatutDemande,
          situation_soumise: row.situation_soumise ?? false,
        })) as DemandeRavitaillement[]
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erreur chargement demandes";
      setError(msg);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  // -------------------------------------------------------------------------
  // createDemande — chef de cours / chef_departement
  // -------------------------------------------------------------------------

  const createDemande = useCallback(
    async (departement: string, vehiculeIds: number[], _role?: string) => {
      const { id } = await apiCreateDemande({ departement, vehicule_ids: vehiculeIds });
      await fetchDemandes();
      return id as string;
    },
    [fetchDemandes]
  );

  // -------------------------------------------------------------------------
  // validerDemandeDept — chef département
  // -------------------------------------------------------------------------

  const validerDemandeDept = useCallback(
    async (demandeId: string, _departement?: string) => {
      await apiUpdateDemande(demandeId, { statut: "validee_dept" });
      await fetchDemandes();
    },
    [fetchDemandes]
  );

  // -------------------------------------------------------------------------
  // validerDemandeCommercial — signataire (DC)
  // -------------------------------------------------------------------------

  const validerDemandeCommercial = useCallback(
    async (demandeId: string, _createdBy?: string) => {
      await apiUpdateDemande(demandeId, { statut: "validee_dept" });
      await fetchDemandes();
    },
    [fetchDemandes]
  );

  // -------------------------------------------------------------------------
  // annulerDemande
  // -------------------------------------------------------------------------

  const annulerDemande = useCallback(
    async (demandeId: string) => {
      await apiDeleteDemande(demandeId);
      await fetchDemandes();
    },
    [fetchDemandes]
  );

  // -------------------------------------------------------------------------
  // saisirRavitaillement — responsable station
  // -------------------------------------------------------------------------

  const saisirRavitaillement = useCallback(
    async (demandeVehiculeId: string, data: SaisirRavitaillementData, demandeId: string) => {
      await apiPatchDemandeVehicule(demandeId, demandeVehiculeId, {
        ...data,
        statut: "ravitaille",
      });
      await fetchDemandes();
    },
    [fetchDemandes]
  );

  // -------------------------------------------------------------------------
  // validerDemandeStation — responsable station (soumettre à la cellule)
  // -------------------------------------------------------------------------

  const validerDemandeStation = useCallback(
    async (demandeId: string, _departement: string) => {
      await apiUpdateDemande(demandeId, { statut: "validee_station" });
      await fetchDemandes();
    },
    [fetchDemandes]
  );

  // -------------------------------------------------------------------------
  // validerDemandeCellule — cellule (Admin / MENAGER)
  // -------------------------------------------------------------------------

  const validerDemandeCellule = useCallback(
    async (demandeId: string, _departement?: string) => {
      await apiUpdateDemande(demandeId, { statut: "validee_cellule" });
      await fetchDemandes();
    },
    [fetchDemandes]
  );

  // -------------------------------------------------------------------------
  // updateDemandeVehicules — modifier les véhicules d'une demande existante
  // -------------------------------------------------------------------------

  const updateDemandeVehicules = useCallback(
    async (demandeId: string, vehiculeIds: number[]) => {
      await apiReplaceDemandeVehicules(demandeId, vehiculeIds);
      await fetchDemandes();
    },
    [fetchDemandes]
  );

  // -------------------------------------------------------------------------
  // retournerRavitaillement — remettre un véhicule en_attente
  // -------------------------------------------------------------------------

  const retournerRavitaillement = useCallback(
    async (demandeVehiculeId: string, demandeId: string, _matricule?: string) => {
      await apiPatchDemandeVehicule(demandeId, demandeVehiculeId, {
        statut: "en_attente",
        montant: null,
        n_liter: null,
        kilometrage: null,
      });
      await fetchDemandes();
    },
    [fetchDemandes]
  );

  // -------------------------------------------------------------------------
  // fetchNotifications
  // -------------------------------------------------------------------------

  const fetchNotifications = useCallback(async () => {
    const data = await apiGetNotifications();
    setNotifications(data as Notification[]);
  }, []);

  // -------------------------------------------------------------------------
  // marquerNotificationLue
  // -------------------------------------------------------------------------

  const marquerNotificationLue = useCallback(async (notificationId: string) => {
    await apiMarquerLu(notificationId);
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, lu: true } : n))
    );
  }, []);

  return {
    demandes,
    notifications,
    loading,
    error,
    fetchDemandes,
    createDemande,
    validerDemandeDept,
    validerDemandeCommercial,
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
