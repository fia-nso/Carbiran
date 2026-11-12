import { useState, useCallback } from "react";
import {
  apiGetSignatureUtilisateur,
  apiUploadSignature,
  apiGetSignatures,
  apiSignerDocuments,
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
  signatures: { role: string }[],
  circuit: CircuitStep[]
): CircuitStep | null {
  const signedRoles = new Set(signatures.map((s) => s.role));
  return circuit.find((step) => !signedRoles.has(step.role)) ?? null;
}

export type CircuitName = "situation" | "bons";

export interface EtatSignature {
  /** Circuits contenant le rôle et qu'il n'a pas encore signés. */
  manquants: CircuitName[];
  /** Vrai si le rôle est le prochain signataire de chacun de ses circuits manquants. */
  peutSigner: boolean;
  /** Libellés des acteurs qui doivent signer avant lui. */
  attenteDe: string[];
}

/** Même règle que backend/src/lib/signatureCircuit.ts. */
export function getEtatSignature(
  signatures: { role: string; circuit?: string | null }[],
  departement: string,
  role: string | null
): EtatSignature {
  const isDC = departement === "DC";
  const situation = isDC ? CIRCUIT_SITUATION_DC : CIRCUIT_SITUATION;
  const circuits: { nom: CircuitName; steps: CircuitStep[] }[] = [
    { nom: "situation", steps: situation },
    { nom: "bons", steps: isDC ? CIRCUIT_BONS_DC : CIRCUIT_BONS },
  ];

  const manquants: CircuitName[] = [];
  const attente = new Set<string>();

  for (const { nom, steps } of circuits) {
    if (!role || !steps.some((step) => step.role === role)) continue;

    const signees = signatures.filter((s) => (s.circuit === "bons") === (nom === "bons"));
    if (signees.some((s) => s.role === role)) continue;

    manquants.push(nom);
    const prochain = getProchainSignataire(signees, steps);
    if (prochain && prochain.role !== role) attente.add(prochain.role);
  }

  return {
    manquants,
    peutSigner: manquants.length > 0 && attente.size === 0,
    attenteDe: [...attente].map((r) => situation.find((step) => step.role === r)?.label ?? r),
  };
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
  // signerDocuments
  // -------------------------------------------------------------------------

  const signerDocuments = useCallback(
    async (demandeId: string): Promise<void> => {
      await apiSignerDocuments(demandeId);
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
    signerDocuments,
  };
}
