import { useState, useCallback } from "react";
import { supabase } from "@/supabaseClient";
import { notifyByRole } from "@/lib/notifications";
import { sendSignatureEmail } from "@/lib/sendEmail";

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

// Circuit complet — Situation des dépenses (5 signataires)
export const CIRCUIT_SITUATION: CircuitStep[] = [
  { ordre: 1, role: "chef_departement",      label: "Chef Département" },
  { ordre: 2, role: "directeur_technique",   label: "Directeur Technique" },
  { ordre: 3, role: "chef_cellule",          label: "Chef Cellule CSÉ" },
  { ordre: 4, role: "directeur_general",     label: "Directeur Général" },
  { ordre: 5, role: "directrice_financiere", label: "Directrice Financière" },
];

// Circuit réduit — Bons de carburant (3 signataires)
export const CIRCUIT_BONS: CircuitStep[] = [
  { ordre: 1, role: "chef_departement",  label: "Chef Département" },
  { ordre: 2, role: "chef_cellule",      label: "VISA Chef Cellule CSÉ" },
  { ordre: 3, role: "directeur_general", label: "VISA Directeur Général" },
];

// Circuit DC — Situation des dépenses (4 signataires, sans DT)
export const CIRCUIT_SITUATION_DC: CircuitStep[] = [
  { ordre: 1, role: "directeur_commercial",  label: "Directeur Commercial" },
  { ordre: 2, role: "chef_cellule",          label: "Chef Cellule CSÉ" },
  { ordre: 3, role: "directeur_general",     label: "Directeur Général" },
  { ordre: 4, role: "directrice_financiere", label: "Directrice Financière" },
];

// Circuit DC — Bons de carburant (3 signataires)
export const CIRCUIT_BONS_DC: CircuitStep[] = [
  { ordre: 1, role: "directeur_commercial", label: "Directeur Commercial" },
  { ordre: 2, role: "chef_cellule",         label: "VISA Chef Cellule CSÉ" },
  { ordre: 3, role: "directeur_general",    label: "VISA Directeur Général" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Détermine le rôle du circuit pour un utilisateur donné. */
export function getCircuitRole(userRole: string, circuitRole?: string | null): string | null {
  if (userRole === "chef_departement") return "chef_departement";
  if (userRole === "Admin" || userRole === "MENAGER") return "chef_cellule";
  if (userRole === "signataire" && circuitRole) return circuitRole;
  return null;
}

/** Vérifie si l'utilisateur a déjà signé dans un tableau de signatures donné. */
export function hasAlreadySigned(signatures: SignatureSituation[], circuitRole: string): boolean {
  return signatures.some((s) => s.role === circuitRole);
}

/** Retourne la prochaine étape à signer dans le circuit. */
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
  // fetchSignatureUtilisateur — signature enregistrée par l'utilisateur connecté
  // -------------------------------------------------------------------------

  const fetchSignatureUtilisateur = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data } = await supabase
      .from("signatures_utilisateurs")
      .select("id, user_id, role, signature_url, created_at")
      .eq("user_id", user.id)
      .maybeSingle();

    return data as { id: string; user_id: string; role: string; signature_url: string; created_at: string } | null;
  }, []);

  // -------------------------------------------------------------------------
  // uploadSignatureUtilisateur — upload + enregistrement en base
  // -------------------------------------------------------------------------

  const uploadSignatureUtilisateur = useCallback(async (file: File, circuitRole: string): Promise<string> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Non connecté");

    const ext  = file.name.split(".").pop() ?? "png";
    const path = `${user.id}/signature.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from("signatures")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (uploadErr) throw uploadErr;

    const { data: { publicUrl } } = supabase.storage.from("signatures").getPublicUrl(path);

    const { error: insertErr } = await supabase
      .from("signatures_utilisateurs")
      .upsert({ user_id: user.id, role: circuitRole, signature_url: publicUrl }, { onConflict: "user_id" });
    if (insertErr) throw insertErr;

    return publicUrl;
  }, []);

  // -------------------------------------------------------------------------
  // fetchSignaturesSituation — charge toutes les signatures d'une demande
  // et les répartit par circuit
  // -------------------------------------------------------------------------

  const fetchSignaturesSituation = useCallback(async (demandeId: string) => {
    const { data } = await supabase
      .from("signatures_situation")
      .select("id, demande_id, role, user_id, signature_url, signe_le, ordre, circuit")
      .eq("demande_id", demandeId)
      .order("ordre");

    const all = (data as SignatureSituation[]) ?? [];

    // Recharge les dernières URLs depuis signatures_utilisateurs
    // pour refléter une signature re-uploadée après la signature de circuit
    if (all.length > 0) {
      const userIds = [...new Set(all.map((s) => s.user_id))];
      const { data: latestSigs } = await supabase
        .from("signatures_utilisateurs")
        .select("user_id, signature_url")
        .in("user_id", userIds);

      const latestMap: Record<string, string | null> = {};
      (latestSigs ?? []).forEach((s: { user_id: string; signature_url: string | null }) => {
        latestMap[s.user_id] = s.signature_url;
      });

      all.forEach((s) => {
        if (latestMap[s.user_id]) s.signature_url = latestMap[s.user_id];
      });
    }

    const sigsS = all.filter((s) => (s.circuit ?? "situation") !== "bons");
    const sigsB = all.filter((s) => s.circuit === "bons");
    setSignaturesSituation(sigsS);
    setSignaturesBons(sigsB);
    return { situation: sigsS, bons: sigsB };
  }, []);

  // -------------------------------------------------------------------------
  // signerSituation — appose la signature sur le circuit SITUATION
  // -------------------------------------------------------------------------

  const signerSituation = useCallback(
    async (demandeId: string, role: string, ordre: number, departement = ""): Promise<void> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non connecté");

      const { data: sigData } = await supabase
        .from("signatures_utilisateurs")
        .select("signature_url")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!sigData?.signature_url) {
        throw new Error("Vous devez d'abord enregistrer votre signature.");
      }

      const { error } = await supabase.from("signatures_situation").insert({
        demande_id:    demandeId,
        role,
        user_id:       user.id,
        signature_url: sigData.signature_url,
        ordre,
        circuit:       "situation",
      });
      if (error) throw error;

      await fetchSignaturesSituation(demandeId);

      const circuitSit = departement === "DC" ? CIRCUIT_SITUATION_DC : CIRCUIT_SITUATION;
      const nextStep = circuitSit[ordre]; // ordre est 1-based, index = ordre
      if (nextStep) {
        const nextAppRole = nextStep.role === "chef_cellule" ? "Admin" : "signataire";
        const msg = `Votre signature est requise pour la situation de carburant (étape ${nextStep.ordre} : ${nextStep.label})`;
        void notifyByRole(nextAppRole, msg, "signature_requise", demandeId);
        if (nextStep.role === "chef_cellule") {
          void notifyByRole("MENAGER", msg, "signature_requise", demandeId);
        }
      }

      if (departement === "DC") {
        if (role === "directeur_commercial") {
          void sendSignatureEmail("ahmed.herma@rimatel.mr", "Chef Cellule CSÉ", demandeId, departement,
            "La situation DC est prête pour votre signature.");
        } else if (role === "chef_cellule") {
          void sendSignatureEmail("medahab@rimatel.mr", "Directeur Général", demandeId, departement,
            "La situation et les bons DC sont prêts pour votre signature.");
        } else if (role === "directeur_general") {
          void sendSignatureEmail("mariiem.hadrami@rimatel.mr", "Directrice Financière", demandeId, departement,
            "La situation DC est prête pour votre signature finale.");
        }
      } else {
        if (role === "chef_departement") {
          void sendSignatureEmail("toulba@rimatel.mr", "Directeur Technique", demandeId, departement,
            "La situation des dépenses carburant est prête pour votre signature.");
        } else if (role === "directeur_technique") {
          void sendSignatureEmail("ahmed.herma@rimatel.mr", "Chef Cellule CSÉ", demandeId, departement,
            "La situation des dépenses carburant est prête pour votre signature.");
        } else if (role === "chef_cellule") {
          void sendSignatureEmail("medahab@rimatel.mr", "Directeur Général", demandeId, departement,
            "La situation et les bons de carburant sont prêts pour votre signature.");
        } else if (role === "directeur_general") {
          void sendSignatureEmail("mariiem.hadrami@rimatel.mr", "Directrice Financière", demandeId, departement,
            "La situation des dépenses carburant est prête pour votre signature finale.");
        }
      }
    },
    [fetchSignaturesSituation]
  );

  // -------------------------------------------------------------------------
  // signerBons — appose la signature sur le circuit BONS (indépendant)
  // -------------------------------------------------------------------------

  const signerBons = useCallback(
    async (demandeId: string, role: string, ordre: number, departement = ""): Promise<void> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non connecté");

      const { data: sigData } = await supabase
        .from("signatures_utilisateurs")
        .select("signature_url")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!sigData?.signature_url) {
        throw new Error("Vous devez d'abord enregistrer votre signature.");
      }

      const { error } = await supabase.from("signatures_situation").insert({
        demande_id:    demandeId,
        role,
        user_id:       user.id,
        signature_url: sigData.signature_url,
        ordre,
        circuit:       "bons",
      });
      if (error) throw error;

      await fetchSignaturesSituation(demandeId);

      const circuitBon = departement === "DC" ? CIRCUIT_BONS_DC : CIRCUIT_BONS;
      const nextStep = circuitBon[ordre]; // ordre est 1-based, index = ordre
      if (nextStep) {
        const nextAppRole = nextStep.role === "chef_cellule" ? "Admin" : "signataire";
        const msg = `Votre signature est requise pour les bons de carburant (étape ${nextStep.ordre} : ${nextStep.label})`;
        void notifyByRole(nextAppRole, msg, "signature_requise", demandeId);
        if (nextStep.role === "chef_cellule") {
          void notifyByRole("MENAGER", msg, "signature_requise", demandeId);
        }
      }

      if (role === "chef_departement" || role === "directeur_commercial") {
        void sendSignatureEmail("ahmed.herma@rimatel.mr", "Chef Cellule CSÉ", demandeId, departement,
          "Les bons de carburant sont prêts pour votre signature.");
      } else if (role === "chef_cellule") {
        void sendSignatureEmail("medahab@rimatel.mr", "Directeur Général", demandeId, departement,
          "Les bons de carburant sont prêts pour votre VISA.");
      }
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
