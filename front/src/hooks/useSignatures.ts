import { useState, useCallback } from "react";
import {
  apiGetSignatureUtilisateur,
  apiUploadSignature,
  apiGetSignatures,
  apiSigner,
} from "@/lib/api";

// ---------------------------------------------------------------------------
// Types publics
// ---------------------------------------------------------------------------

export interface SignatureSituation {
  id: string;
  demande_id: string;
  role: string;
  user_id: string;
  signature_url: string | null;
  signe_le: string;
  ordre: number;
  circuit: string; // 'situation' | 'bons'
}

export interface CircuitStep {
  ordre: number;
  role: string;
  label: string;
}

// ---------------------------------------------------------------------------
// Circuits
// ---------------------------------------------------------------------------

export const CIRCUIT_SITUATION: CircuitStep[] = [
  { ordre: 1, role: "chef_departement",      label: "Chef Département" },
  { ordre: 2, role: "directeur_technique",   label: "Directeur Technique" },
  { ordre: 3, role: "chef_cellule",          label: "Chef Cellule CSÉ" },
  { ordre: 4, role: "directeur_general",     label: "Directeur Général" },
  { ordre: 5, role: "directrice_financiere", label: "Directrice Financière" },
];

export const CIRCUIT_BONS: CircuitStep[] = [
  { ordre: 1, role: "chef_departement",  label: "Chef Département" },
  { ordre: 2, role: "chef_cellule",      label: "VISA Chef Cellule CSÉ" },
  { ordre: 3, role: "directeur_general", label: "VISA Directeur Général" },
];

export const CIRCUIT_SITUATION_DC: CircuitStep[] = [
  { ordre: 1, role: "directeur_commercial",  label: "Directeur Commercial" },
  { ordre: 2, role: "chef_cellule",          label: "Chef Cellule CSÉ" },
  { ordre: 3, role: "directeur_general",     label: "Directeur Général" },
  { ordre: 4, role: "directrice_financiere", label: "Directrice Financière" },
];

export const CIRCUIT_BONS_DC: CircuitStep[] = [
  { ordre: 1, role: "directeur_commercial", label: "Directeur Commercial" },
  { ordre: 2, role: "chef_cellule",         label: "VISA Chef Cellule CSÉ" },
  { ordre: 3, role: "directeur_general",    label: "VISA Directeur Général" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getCircuitRole(userRole: string, circuitRole?: string | null): string | null {
  if (userRole === "chef_departement") return "chef_departement";
  if (userRole === "Admin" || userRole === "MENAGER") return "chef_cellule";
  if (userRole === "signataire" && circuitRole) return circuitRole;
  return null;
}

export function hasAlreadySigned(signatures: SignatureSituation[], circuitRole: string): boolean {
  return signatures.some((s) => s.role === circuitRole);
}

export function getProchainSignataire(
  signatures: SignatureSituation[],
  circuit: CircuitStep[]
): CircuitStep | null {
  const signedRoles = new Set(signatures.map((s) => s.role));
  return circuit.find((step) => !signedRoles.has(step.role)) ?? null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSignatures() {
  const [signaturesSituation, setSignaturesSituation] = useState<SignatureSituation[]>([]);
  const [signaturesBons,      setSignaturesBons]      = useState<SignatureSituation[]>([]);

  // -------------------------------------------------------------------------
  // fetchSignatureUtilisateur
  // -------------------------------------------------------------------------

  const fetchSignatureUtilisateur = useCallback(async () => {
    const data = await apiGetSignatureUtilisateur();
    return data as { id: string; user_id: string; role: string; signature_url: string; created_at: string } | null;
  }, []);

  // -------------------------------------------------------------------------
  // uploadSignatureUtilisateur
  // -------------------------------------------------------------------------

  const uploadSignatureUtilisateur = useCallback(async (file: File, circuitRole: string): Promise<string> => {
    const result = await apiUploadSignature(file, circuitRole);
    return (result as { signature_url: string }).signature_url;
  }, []);

  // -------------------------------------------------------------------------
  // fetchSignaturesSituation
  // -------------------------------------------------------------------------

  const fetchSignaturesSituation = useCallback(async (demandeId: string) => {
    const data = await apiGetSignatures(demandeId);
    const all = (data as SignatureSituation[]) ?? [];

    const sigsS = all.filter((s) => (s.circuit ?? "situation") !== "bons");
    const sigsB = all.filter((s) => s.circuit === "bons");
    setSignaturesSituation(sigsS);
    setSignaturesBons(sigsB);
    return { situation: sigsS, bons: sigsB };
  }, []);

  // -------------------------------------------------------------------------
  // signerSituation
  // -------------------------------------------------------------------------

  const signerSituation = useCallback(
    async (demandeId: string, role: string, ordre: number, departement = ""): Promise<void> => {
      await apiSigner({ demande_id: demandeId, role, ordre, circuit: "situation", departement });
      await fetchSignaturesSituation(demandeId);
    },
    [fetchSignaturesSituation]
  );

  // -------------------------------------------------------------------------
  // signerBons
  // -------------------------------------------------------------------------

  const signerBons = useCallback(
    async (demandeId: string, role: string, ordre: number, departement = ""): Promise<void> => {
      await apiSigner({ demande_id: demandeId, role, ordre, circuit: "bons", departement });
      await fetchSignaturesSituation(demandeId);
    },
    [fetchSignaturesSituation]
  );

  return {
    signaturesSituation,
    signaturesBons,
    fetchSignatureUtilisateur,
    uploadSignatureUtilisateur,
    fetchSignaturesSituation,
    signerSituation,
    signerBons,
  };
}
