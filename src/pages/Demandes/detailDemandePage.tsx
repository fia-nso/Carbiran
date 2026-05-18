import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/supabaseClient";
import { useAuthContext } from "@/context/AuthProvider";
import { useDemandes } from "@/hooks/useDemandes";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import {
  useSignatures,
  CIRCUIT_SITUATION,
  CIRCUIT_BONS,
  getCircuitRole,
  getProchainSignataire,
  hasAlreadySigned,
} from "@/hooks/useSignatures";
import type { SignatureSituation, CircuitStep } from "@/hooks/useSignatures";
import { uploadPhoto } from "@/lib/uploadPhoto";
import { createNotification, notifyByRole, notifyByRoleAndDept } from "@/lib/notifications";
import type {
  DemandeRavitaillement,
  DemandeVehicule,
  PhotoJustification,
  StatutDemande,
  TypePhoto,
} from "@/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RavForm {
  montant: string;
  n_liter: string;
  kilometrage: string;
  photos: Partial<Record<TypePhoto, File>>;
}

interface VehiculeInfo {
  id: number;
  vehicule: string;
  matricule: string;
  chauffeur_responsable: string | null;
  zone: string;
}

// ---------------------------------------------------------------------------
// Print helpers
// ---------------------------------------------------------------------------

function formatNumber(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

const normalizeZone = (zone: string) => zone?.trim().toLowerCase();

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function numberToWordsFr(n: number): string {
  const intPart = Math.floor(Math.abs(n));
  const ones = [
    "", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf",
    "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize",
    "dix-sept", "dix-huit", "dix-neuf",
  ];

  function belowHundred(x: number): string {
    if (x < 20) return ones[x];
    const d = Math.floor(x / 10);
    const u = x % 10;
    if (d === 7) return u === 1 ? "soixante-et-onze" : `soixante-${ones[10 + u]}`;
    if (d === 8) return u === 0 ? "quatre-vingts" : `quatre-vingt-${ones[u]}`;
    if (d === 9) return `quatre-vingt-${ones[10 + u]}`;
    const tens = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"][d];
    return u === 0 ? tens : u === 1 && d < 7 ? `${tens}-et-un` : `${tens}-${ones[u]}`;
  }

  function belowThousand(x: number): string {
    if (x < 100) return belowHundred(x);
    const h = Math.floor(x / 100);
    const r = x % 100;
    const centWord = h === 1 ? "cent" : `${ones[h]} cent${r === 0 ? "s" : ""}`;
    return r === 0 ? centWord : `${centWord} ${belowHundred(r)}`;
  }

  function convert(x: number): string {
    if (x === 0) return "zéro";
    if (x < 1000) return belowThousand(x);
    if (x < 1_000_000) {
      const t = Math.floor(x / 1000);
      const r = x % 1000;
      const tWord = t === 1 ? "mille" : `${belowThousand(t)} mille`;
      return r === 0 ? tWord : `${tWord} ${belowThousand(r)}`;
    }
    const m = Math.floor(x / 1_000_000);
    const r = x % 1_000_000;
    const mWord = `${belowThousand(m)} million${m > 1 ? "s" : ""}`;
    return r === 0 ? mWord : `${mWord} ${convert(r)}`;
  }

  return n < 0 ? `moins ${convert(intPart)}` : convert(intPart);
}

// ---------------------------------------------------------------------------
// DB row → domain mapper
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any): DemandeRavitaillement {
  return {
    id: row.id,
    departement: row.departement,
    statut: row.statut as StatutDemande,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    demande_vehicules: (row.demande_vehicules ?? []).map((dv: any): DemandeVehicule => ({
      id: dv.id,
      demande_id: dv.demande_id,
      vehicule_id: dv.vehicule_id,
      montant: dv.montant ?? undefined,
      n_liter: dv.n_liter ?? undefined,
      kilometrage: dv.kilometrage ?? undefined,
      statut: dv.statut,
    })),
  };
}

const DETAIL_SELECT = `
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
// Sub-components config
// ---------------------------------------------------------------------------

const STATUT_CONFIG: Record<StatutDemande, { label: string; classes: string }> = {
  en_attente:      { label: "En attente d'approbation",    classes: "bg-orange-100 text-orange-800 border-orange-200" },
  validee_dept:    { label: "Approuvée",                   classes: "bg-blue-100 text-blue-800 border-blue-200" },
  validee_station: { label: "Ravitaillement effectué",     classes: "bg-purple-100 text-purple-800 border-purple-200" },
  validee_cellule: { label: "Validée",                     classes: "bg-green-100 text-green-800 border-green-200" },
  annulee:         { label: "Annulée",                     classes: "bg-red-100 text-red-800 border-red-200" },
};

const DV_STATUT: Record<string, { label: string; classes: string }> = {
  en_attente: { label: "En attente de ravitaillement", classes: "bg-orange-100 text-orange-700" },
  ravitaille: { label: "Ravitaillement effectué",      classes: "bg-purple-100 text-purple-700" },
  valide:     { label: "Validée",                      classes: "bg-green-100 text-green-700" },
  refuse:     { label: "En attente de ravitaillement", classes: "bg-orange-100 text-orange-700" },
};

function StatutBadge({ statut }: { statut: StatutDemande }) {
  const cfg = STATUT_CONFIG[statut];
  return (
    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cfg.classes}`}>
      {cfg.label}
    </span>
  );
}

function DvStatutBadge({ statut, demandeStatut }: { statut: string; demandeStatut?: string }) {
  let cfg = DV_STATUT[statut] ?? { label: statut, classes: "bg-gray-100 text-gray-700" };
  if (statut === "en_attente" && demandeStatut === "en_attente") {
    cfg = { label: "En attente d'approbation", classes: "bg-orange-100 text-orange-700" };
  }
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${cfg.classes}`}>
      {cfg.label}
    </span>
  );
}

const PHOTO_LABELS: Record<TypePhoto, string> = {
  vehicule_avant: "Véhicule avant",
  vehicule_apres: "Véhicule après",
  pompe:          "Pompe",
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DetailDemandePage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthContext();
  const {
    validerDemandeDept,
    annulerDemande,
    saisirRavitaillement,
    retournerRavitaillement,
  } = useDemandes();

  const {
    signaturesSituation,
    signaturesBons,
    fetchSignaturesSituation,
    signerSituation,
    signerBons,
  } = useSignatures();

  const [demande, setDemande] = useState<DemandeRavitaillement | null>(null);
  const [vehiculesMap, setVehiculesMap] = useState<Record<number, VehiculeInfo>>({});
  const [photosMap, setPhotosMap] = useState<Record<string, PhotoJustification[]>>({});
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [ravForms, setRavForms] = useState<Record<string, RavForm>>({});
  const [successMap, setSuccessMap] = useState<Record<string, string>>({});
  const [signingForSituation, setSigningForSituation] = useState(false);
  const [signingForBons,      setSigningForBons]      = useState(false);
  const [signErrorSituation,  setSignErrorSituation]  = useState<string | null>(null);
  const [signErrorBons,       setSignErrorBons]       = useState<string | null>(null);

  const isChefDeCours   = user?.role === "chef_de_cours";
  const isChefDept      = user?.role === "chef_departement";
  const isStation       = user?.role === "responsable_station";
  const isStationViewer = user?.role === "responsable_station_viewer";
  const isCellule       = user?.role === "Admin" || user?.role === "MENAGER";
  const isSignataire    = user?.role === "signataire";
  const isCircuitActor  = isChefDept || isSignataire || isCellule;

  // -------------------------------------------------------------------------
  // Fetch demande + photos
  // -------------------------------------------------------------------------

  const fetchDemande = useCallback(async (silent = false) => {
    if (!id) return;
    if (!silent) setLoading(true);
    setFetchError(null);
    try {
      const { data, error } = await supabase
        .from("demandes_ravitaillement")
        .select(DETAIL_SELECT)
        .eq("id", id)
        .single();

      if (error) {
        // PGRST116 = no rows returned — record exists but RLS blocks access
        const isAccessDenied =
          (error as { code?: string }).code === "PGRST116" ||
          error.message.includes("0 rows");
        throw new Error(
          isAccessDenied ? "Vous n'avez pas accès à cette demande." : error.message
        );
      }
      if (!data) throw new Error("Vous n'avez pas accès à cette demande.");

      const mapped = mapRow(data);
      setDemande(mapped);

      const dvIds      = (mapped.demande_vehicules ?? []).map((dv) => dv.id);
      const needPhotos = (mapped.demande_vehicules ?? []).some((dv) => dv.statut !== "en_attente");

      if (needPhotos && dvIds.length > 0) {
        const { data: pData } = await supabase
          .from("photos_justification")
          .select("id, demande_vehicule_id, url, type, uploaded_at")
          .in("demande_vehicule_id", dvIds);

        const pMap: Record<string, PhotoJustification[]> = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (pData ?? []).forEach((p: any) => {
          if (!pMap[p.demande_vehicule_id]) pMap[p.demande_vehicule_id] = [];
          pMap[p.demande_vehicule_id].push(p as PhotoJustification);
        });
        setPhotosMap(pMap);
      }
    } catch (e: unknown) {
      setFetchError(e instanceof Error ? e.message : "Erreur de chargement.");
      setDemande(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void fetchDemande(); }, [fetchDemande]);

  useRealtimeSync({
    onDemandesChange: () => {
      void fetchDemande(true);
      if (demande?.id) void fetchSignaturesSituation(demande.id);
    },
    onDvChange:     () => { void fetchDemande(true); },
    onPhotosChange: () => { void fetchDemande(true); },
  });

  // Charge les signatures quand la demande est connue
  useEffect(() => {
    if (!demande?.id) return;
    void fetchSignaturesSituation(demande.id);
  }, [demande?.id, fetchSignaturesSituation]);

  // -------------------------------------------------------------------------
  // Load vehicule info whenever demande changes
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!demande) return;
    const vehiculeIds = (demande.demande_vehicules ?? []).map((dv) => dv.vehicule_id);
    if (vehiculeIds.length === 0) return;

    supabase
      .from("vehicules")
      .select("id, vehicule, matricule, chauffeur_responsable, zone")
      .in("id", vehiculeIds)
      .then(({ data }) => {
        const map: Record<number, VehiculeInfo> = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (data ?? []).forEach((v: any) => { map[v.id] = v as VehiculeInfo; });
        setVehiculesMap(map);
      });
  }, [demande]);

  // Init ravForms when demande loads for responsable_station
  useEffect(() => {
    if (!demande || !isStation) return;
    setRavForms((prev) => {
      const next = { ...prev };
      demande.demande_vehicules?.forEach((dv) => {
        if (dv.statut === "en_attente" && !next[dv.id]) {
          next[dv.id] = { montant: "", n_liter: "", kilometrage: "", photos: {} };
        }
      });
      return next;
    });
  }, [demande, isStation]);

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  async function handleValiderDept() {
    if (!demande) return;
    setProcessing("valider_dept");
    try {
      await validerDemandeDept(id!, demande.departement);
      await fetchDemande();
    } finally {
      setProcessing(null);
    }
  }

  async function handleAnnuler() {
    if (!demande) return;
    if (!window.confirm("Annuler cette demande ? Cette action est irréversible.")) return;
    setProcessing("annuler");
    try {
      await annulerDemande(id!);
      void createNotification(
        demande.created_by,
        `Votre demande ${demande.departement} a été annulée par le chef de département.`,
        "annulation",
        id
      );
      await fetchDemande();
    } finally {
      setProcessing(null);
    }
  }

  async function handleRetournerRavitaillement(dv: DemandeVehicule) {
    if (!demande) return;
    setProcessing(`retourner_${dv.id}`);
    setSubmitError(null);
    try {
      const vehiculeInfo = vehiculesMap[dv.vehicule_id];
      await retournerRavitaillement(dv.id, demande.id, vehiculeInfo?.matricule);
      setSuccessMap((prev) => ({ ...prev, [dv.id]: "Renvoyé à la station pour correction." }));
      await fetchDemande();
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : "Erreur lors du retour.");
    } finally {
      setProcessing(null);
    }
  }

  async function handleEnvoyerRavitaillement(dv: DemandeVehicule) {
    const form = ravForms[dv.id];
    if (!form) return;
    setProcessing(`rav_${dv.id}`);
    setSubmitError(null);
    try {
      await saisirRavitaillement(dv.id, {
        montant:     form.montant     ? parseFloat(form.montant)     : undefined,
        n_liter:     form.n_liter     ? parseFloat(form.n_liter)     : undefined,
        kilometrage: form.kilometrage ? parseFloat(form.kilometrage) : undefined,
      }, demande?.id ?? '');

      const photoEntries = (Object.entries(form.photos) as [TypePhoto, File | undefined][])
        .filter((entry): entry is [TypePhoto, File] => entry[1] != null);

      if (photoEntries.length > 0) {
        await Promise.all(
          photoEntries.map(([type, file]) => uploadPhoto(file, dv.id, type))
        );
      }

      const vehiculeInfo = vehiculesMap[dv.vehicule_id];
      const montantVal   = parseFloat(form.montant);
      const notifMsg     = `Nouveau ravitaillement à vérifier : ${vehiculeInfo?.matricule ?? `#${dv.vehicule_id}`} - ${montantVal.toLocaleString("fr-FR")} MRU`;
      void Promise.all([
        notifyByRole("Admin",   notifMsg, "ravitaillement_saisi", id),
        notifyByRole("MENAGER", notifMsg, "ravitaillement_saisi", id),
      ]);

      setSuccessMap((prev) => ({ ...prev, [dv.id]: "Ravitaillement envoyé !" }));
      await fetchDemande();
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : "Erreur lors de l'envoi.");
    } finally {
      setProcessing(null);
    }
  }

  async function handleValiderVehicule(dv: DemandeVehicule) {
    if (!demande) return;
    setProcessing(`valider_${dv.id}`);
    setSubmitError(null);
    try {
      const { error: updateErr } = await supabase
        .from("demande_vehicules")
        .update({ statut: "valide" })
        .eq("id", dv.id);
      if (updateErr) throw updateErr;

      const { error: insertErr } = await supabase
        .from("ravitaillements_vehicules")
        .insert({
          vehicule_id:        dv.vehicule_id,
          montant_ravitaille: dv.montant ?? 0,
          n_liter:            dv.n_liter ?? 0,
          kilometrage:        dv.kilometrage ?? 0,
          date:               new Date().toISOString().split("T")[0],
          commentaire:        "Ravitaillement validé par la Cellule CSÉ",
        });
      if (insertErr) throw insertErr;

      const vehiculeInfo = vehiculesMap[dv.vehicule_id];
      void notifyByRoleAndDept(
        "chef_departement",
        demande.departement,
        `Véhicule ${vehiculeInfo?.matricule ?? `#${dv.vehicule_id}`} validé — montant ${(dv.montant ?? 0).toLocaleString("fr-FR")} MRU`,
        "vehicule_valide",
        id
      );

      const { data: dvs } = await supabase
        .from("demande_vehicules")
        .select("statut")
        .eq("demande_id", demande.id);

      const tousTraites = dvs?.every((d) => d.statut === "valide" || d.statut === "refuse");
      if (tousTraites) {
        await supabase
          .from("demandes_ravitaillement")
          .update({ statut: "validee_cellule" })
          .eq("id", demande.id);
      }

      setSuccessMap((prev) => ({ ...prev, [dv.id]: "Véhicule validé et enregistré !" }));
      await fetchDemande();
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : "Erreur lors de la validation.");
    } finally {
      setProcessing(null);
    }
  }

  async function handleRefuserVehicule(dv: DemandeVehicule) {
    if (!window.confirm("Refuser le ravitaillement de ce véhicule ?")) return;
    setProcessing(`refuser_${dv.id}`);
    setSubmitError(null);
    try {
      const { error } = await supabase
        .from("demande_vehicules")
        .update({ statut: "refuse" })
        .eq("id", dv.id);
      if (error) throw error;

      setSuccessMap((prev) => ({ ...prev, [dv.id]: "Véhicule refusé." }));
      await fetchDemande();
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : "Erreur lors du refus.");
    } finally {
      setProcessing(null);
    }
  }

  function updateRavForm(dvId: string, patch: Partial<Omit<RavForm, "photos">>) {
    setRavForms((prev) => ({ ...prev, [dvId]: { ...prev[dvId], ...patch } }));
  }

  function updateRavPhoto(dvId: string, type: TypePhoto, file: File | null) {
    setRavForms((prev) => ({
      ...prev,
      [dvId]: {
        ...prev[dvId],
        photos: { ...prev[dvId]?.photos, [type]: file ?? undefined },
      },
    }));
  }

  // -------------------------------------------------------------------------
  // Signer le circuit
  // -------------------------------------------------------------------------

  const userCircuitRole = user ? getCircuitRole(user.role, user.email ?? null) : null;

  async function handleSignerSituation(circuitRole: string, ordre: number) {
    if (!demande) return;
    setSigningForSituation(true);
    setSignErrorSituation(null);
    try {
      await signerSituation(demande.id, circuitRole, ordre);
    } catch (e: unknown) {
      setSignErrorSituation(e instanceof Error ? e.message : "Erreur lors de la signature.");
    } finally {
      setSigningForSituation(false);
    }
  }

  async function handleSignerBons(circuitRole: string, ordre: number) {
    if (!demande) return;
    setSigningForBons(true);
    setSignErrorBons(null);
    try {
      await signerBons(demande.id, circuitRole, ordre);
    } catch (e: unknown) {
      setSignErrorBons(e instanceof Error ? e.message : "Erreur lors de la signature.");
    } finally {
      setSigningForBons(false);
    }
  }

  // Helper : image de signature dans le HTML des impressions
  function sigImgHtml(sigs: SignatureSituation[], role: string): string {
    const url = sigs.find((s) => s.role === role)?.signature_url ?? null;
    if (url) {
      return `<img src="${url}" crossorigin="anonymous" style="max-height:48px;max-width:110px;object-fit:contain;display:block;margin:2px auto;" />`;
    }
    return `<div style="height:50px;"></div>`;
  }

  // -------------------------------------------------------------------------
  // Print — Situation
  // -------------------------------------------------------------------------

  function handlePrintSituation() {
    if (!demande) return;
    const items = (demande.demande_vehicules ?? []).filter((dv) => dv.statut === "valide");
    if (items.length === 0) {
      alert("Aucun véhicule validé pour le moment.");
      return;
    }

    const printWindow = window.open("", "_blank", "width=900,height=1200");
    if (!printWindow) {
      alert("Impossible d'ouvrir la fenêtre d'impression.");
      return;
    }

    const logoUrl      = `${window.location.origin}/rimatel-logo.jpeg`;
    const dept         = demande.departement;
    const isCdpe       = normalizeZone(dept) === "cpde";
    const today        = new Date().toLocaleDateString("fr-FR");
    const dateStr      = new Date(demande.created_at).toLocaleDateString("fr-FR");
    const totalMontant = items.reduce((sum, dv) => sum + (dv.montant ?? 0), 0);

    const rowsHtml = items
      .map(
        (dv, index) => {
          const v = vehiculesMap[dv.vehicule_id];
          return `
            <tr>
              <td style="text-align:center;">${index + 1}</td>
              <td>${escapeHtml(v?.vehicule || "-")}<br/><small>${escapeHtml(v?.matricule || "-")}</small></td>
              <td>${formatNumber(dv.montant ?? 0)}</td>
              <td>${dateStr}</td>
              <td>${escapeHtml(v?.chauffeur_responsable || "-")}<br/><small>Nom :</small></td>
              <td>STATION</td>
            </tr>
          `;
        }
      )
      .join("");

    const headerInfoHtml = isCdpe
      ? `<p><strong>Direction Générale</strong></p>
         <p>La Cellule de Pilotage de déploiement et des extensions</p>`
      : `<p><strong>Direction Technique</strong></p>
         <p>${escapeHtml(dept)}</p>`;

    const sigs = signaturesSituation;
    const signaturesHtml = isCdpe
      ? `<div class="sig-block"><p class="sig-title">Chef de la Cellule</p>${sigImgHtml(sigs,"chef_cellule")}<div class="sig-line"></div></div>
         <div class="sig-block"><p class="sig-title">Directrice Financière</p>${sigImgHtml(sigs,"directrice_financiere")}<div class="sig-line"></div></div>
         <div class="sig-block"><p class="sig-title">Chef Cellule CSÉ</p>${sigImgHtml(sigs,"chef_cellule")}<div class="sig-line"></div></div>
         <div class="sig-block"><p class="sig-title">Directeur Général</p>${sigImgHtml(sigs,"directeur_general")}<div class="sig-line"></div></div>`
      : `<div class="sig-block"><p class="sig-title">Chef Département</p>${sigImgHtml(sigs,"chef_departement")}<div class="sig-line"></div></div>
         <div class="sig-block"><p class="sig-title">Directeur Technique</p>${sigImgHtml(sigs,"directeur_technique")}<div class="sig-line"></div></div>
         <div class="sig-block"><p class="sig-title">Directrice Financière</p>${sigImgHtml(sigs,"directrice_financiere")}<div class="sig-line"></div></div>
         <div class="sig-block"><p class="sig-title">Chef Cellule CSÉ</p>${sigImgHtml(sigs,"chef_cellule")}<div class="sig-line"></div></div>
         <div class="sig-block"><p class="sig-title">Directeur Général</p>${sigImgHtml(sigs,"directeur_general")}<div class="sig-line"></div></div>`;

    printWindow.document.write(`
      <!doctype html>
      <html lang="fr">
        <head>
          <meta charset="utf-8" />
          <title>Situation des Dépenses CARBURANT</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: Arial, sans-serif; color: #1f2937; font-size: 11px; }
            .doc-header { display: flex; align-items: center; justify-content: space-between;
                          gap: 16px; margin-bottom: 4px; }
            .doc-header img { width: 80px; height: 80px; object-fit: contain; flex-shrink: 0; }
            .doc-header-info p { margin: 2px 0; font-size: 13px; }
            .doc-date { font-size: 13px; text-align: right; white-space: nowrap; }
            .doc-title { text-align: center; font-size: 15px; font-weight: 700;
                          text-transform: uppercase; letter-spacing: 0.04em;
                          margin: 10px 0 12px; }
            table { width: 100%; border-collapse: collapse; table-layout: fixed; }
            thead th { background: #1f2937; color: white; font-weight: 700;
                        text-align: center; font-size: 11px;
                        border: 1px solid #374151; padding: 5px 4px; }
            tbody td { border: 1px solid #374151; padding: 5px 4px;
                        text-align: left; vertical-align: top; font-size: 11px; }
            .total-row td { border: 1px solid #374151; padding: 5px 4px;
                             font-size: 12px; font-weight: 700; }
            .signatures { display: flex; gap: 12px; margin-top: 32px; }
            .sig-block { flex: 1; text-align: center; }
            .sig-title { font-weight: 700; font-size: 11px; margin: 0 0 6px; text-transform: uppercase; }
            .sig-space { height: 56px; border-bottom: 1px solid #374151; }
            .sig-line { border-bottom: 1px solid #374151; margin-top: 2px; }
            @media print {
              @page { size: A4 landscape; margin: 0mm; }
              body { margin: 10mm; padding: 0; width: calc(297mm - 20mm); box-sizing: border-box; font-size: 11px; }
              table { width: 100%; table-layout: fixed; border-collapse: collapse; }
              td, th { overflow: hidden; text-overflow: ellipsis; word-wrap: break-word; padding: 4px 6px; }
              thead { display: table-header-group; }
              tr { page-break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <div class="doc-header">
            <img src="${logoUrl}" alt="Logo RIMATEL" />
            <div class="doc-header-info">${headerInfoHtml}</div>
            <div class="doc-date">Date : ${today}</div>
          </div>
          <div class="doc-title">Situation des dépenses carburant</div>
          <table>
            <thead>
              <tr>
                <th style="width:5%;">N°</th>
                <th style="width:28%;">Description</th>
                <th style="width:15%;">Montant</th>
                <th style="width:15%;">Date/Période</th>
                <th style="width:22%;">Responsable</th>
                <th style="width:15%;">Bénéficiaire</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
              <tr class="total-row">
                <td colspan="2" style="text-align:right;">Total</td>
                <td>${formatNumber(totalMontant)}</td>
                <td colspan="3"></td>
              </tr>
            </tbody>
          </table>
          <div class="signatures">${signaturesHtml}</div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  // -------------------------------------------------------------------------
  // Print — Bons
  // -------------------------------------------------------------------------

  function handlePrintBon() {
    if (!demande) return;
    const items = (demande.demande_vehicules ?? []).filter((dv) => dv.statut === "valide");
    if (items.length === 0) {
      alert("Aucun véhicule validé pour le moment.");
      return;
    }

    const printWindow = window.open("", "_blank", "width=900,height=1200");
    if (!printWindow) {
      alert("Impossible d'ouvrir la fenêtre d'impression.");
      return;
    }

    const logoUrl = `${window.location.origin}/rimatel-logo.jpeg`;
    const dateStr = new Date(demande.created_at).toLocaleDateString("fr-FR");
    const dept    = demande.departement;

    function bonHtml(dv: DemandeVehicule, num: number) {
      const v          = vehiculesMap[dv.vehicule_id];
      const itemZone   = v?.zone ?? dept;
      const itemIsCdpe = normalizeZone(itemZone) === "cpde";
      const bonHeaderInfo = itemIsCdpe
        ? `<p><strong>Direction Générale</strong></p><p>La Cellule de Pilotage de déploiement et des extensions</p>`
        : `<p><strong>Direction Technique</strong></p><p>${escapeHtml(itemZone)}</p>`;
      return `
        <div class="bon">
          <div class="bon-header">
            <img src="${logoUrl}" alt="Logo RIMATEL" />
            <div class="bon-header-info">${bonHeaderInfo}</div>
          </div>
          <div class="bon-frame">
            <div class="dotted-line"></div>
            <div class="bon-title">BON DE CARBURANT N° : ${num}</div>
            <div class="dotted-line"></div>
            <div class="bon-fields">
              <div class="field-row">
                <span class="field-label">Date :</span>
                <span class="field-value">${dateStr}</span>
              </div>
              <div class="field-row">
                <span class="field-label">Matricule du véhicule :</span>
                <span class="field-value">${escapeHtml(v?.matricule || "")}</span>
              </div>
              <div class="field-row">
                <span class="field-label">Type de Voiture :</span>
                <span class="field-value">${escapeHtml(v?.vehicule || "")}</span>
              </div>
              <div class="field-row">
                <span class="field-label">Nom du conducteur :</span>
                <span class="field-value">${escapeHtml(v?.chauffeur_responsable || "")}</span>
              </div>
              <div class="field-row">
                <span class="field-label">Quantité de carburant (Litres) :</span>
                <span class="field-value">${formatNumber(dv.n_liter ?? 0)}</span>
              </div>
              <div class="field-row">
                <span class="field-label">Montant :</span>
                <span class="field-value">${formatNumber(dv.montant ?? 0)} MRU</span>
              </div>
              <div class="field-row">
                <span class="field-label">Montant en lettres :</span>
                <span class="field-value">${escapeHtml(numberToWordsFr(dv.montant ?? 0))}</span>
              </div>
              <div class="field-row">
                <span class="field-label">Station-service :</span>
                <span class="field-value"></span>
              </div>
              <div class="field-row">
                <span class="field-label">Signature du responsable Station :</span>
                <span class="field-value"></span>
              </div>
            </div>
            <div class="bon-signatures">
              <div class="bon-sig">
                <p class="bon-sig-title">Signature Chef Département</p>
                ${sigImgHtml(signaturesBons, "chef_departement")}
                <div class="bon-sig-line"></div>
              </div>
              <div class="bon-sig">
                <p class="bon-sig-title">VISA Chef Cellule CSÉ</p>
                ${sigImgHtml(signaturesBons, "chef_cellule")}
                <div class="bon-sig-line"></div>
              </div>
              <div class="bon-sig">
                <p class="bon-sig-title">VISA Directeur Général</p>
                ${sigImgHtml(signaturesBons, "directeur_general")}
                <div class="bon-sig-line"></div>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    const emptyBon = `<div class="bon"></div>`;
    const sorted   = [...items].sort((a, b) =>
      (vehiculesMap[a.vehicule_id]?.zone ?? "").localeCompare(
        vehiculesMap[b.vehicule_id]?.zone ?? "", "fr"
      )
    );

    const pages: string[] = [];
    for (let i = 0; i < sorted.length; i += 2) {
      const first  = sorted[i];
      const second = sorted[i + 1];
      const isLast = i + 2 >= sorted.length;
      pages.push(`
        <div class="page${isLast ? "" : " page-break"}">
          ${bonHtml(first, i + 1)}
          <div class="separator"></div>
          ${second ? bonHtml(second, i + 2) : emptyBon}
        </div>
      `);
    }

    printWindow.document.write(`
      <!doctype html>
      <html lang="fr">
        <head>
          <meta charset="utf-8" />
          <title>Bons de Carburant</title>
          <style>
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; color: #1f2937; font-size: 12px; margin: 0; padding: 0; }
            .page { width: 100%; height: calc(297mm - 20mm); display: flex; flex-direction: column; overflow: hidden; }
            .page-break { page-break-after: always; }
            .bon { height: 138.5mm; display: flex; flex-direction: column; padding: 8mm 12mm; overflow: hidden; }
            .separator { height: 0; border-top: 2px dashed #9ca3af; width: 100%; }
            .bon-header { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 10px; }
            .bon-header img { width: 64px; height: 64px; object-fit: contain; flex-shrink: 0; }
            .bon-header-info p { margin: 2px 0; font-size: 16px; }
            .bon-frame { border: 2px solid #1f2937; padding: 8px 14px 12px; flex: 1; display: flex; flex-direction: column; overflow: hidden; }
            .dotted-line { border-top: 1px dashed #374151; margin: 5px 0; }
            .bon-title { text-align: center; font-size: 16px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; padding: 6px 0; }
            .bon-fields { margin-top: 8px; display: flex; flex-direction: column; gap: 5px; flex: 1; }
            .field-row { display: flex; align-items: baseline; gap: 6px; border-bottom: 1px solid #d1d5db; padding-bottom: 4px; }
            .field-label { white-space: nowrap; font-size: 14px; flex-shrink: 0; }
            .field-value { font-size: 14px; flex: 1; }
            .bon-signatures { display: flex; gap: 12px; margin-top: 12px; justify-content: space-around; }
            .bon-sig { flex: 1; text-align: center; }
            .bon-sig-title { font-weight: 700; font-size: 13px; text-transform: uppercase; margin: 0 0 6px; }
            .bon-sig-space { height: 50px; border-bottom: 1px solid #374151; }
            .bon-sig-line { border-bottom: 1px solid #374151; margin-top: 2px; }
            @media print {
              @page { size: A4 portrait; margin: 0mm; }
              body { margin: 10mm; padding: 0; }
            }
          </style>
        </head>
        <body>${pages.join("")}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  // -------------------------------------------------------------------------
  // Loading / error states
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] gap-3">
        <div className="animate-spin w-8 h-8 border-4 border-gray-200 border-t-green-500 rounded-full" />
        <span className="text-gray-500">Chargement...</span>
      </div>
    );
  }

  if (fetchError || !demande) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center">
        <p className="text-red-600 mb-4">{fetchError ?? "Demande introuvable."}</p>
        <Link to="/demandes" className="text-sm text-teal-600 hover:underline">
          ← Retour aux demandes
        </Link>
      </div>
    );
  }

  const statutCfg = STATUT_CONFIG[demande.statut];

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="max-w-4xl mx-auto py-4 sm:py-6 px-4 sm:px-0 space-y-6">
      {/* Back + header */}
      <div className="bg-white rounded-2xl shadow border border-gray-200 p-6">
        <div className="flex items-start gap-3 mb-4">
          <Link
            to="/demandes"
            className="mt-0.5 p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors flex-shrink-0"
            aria-label="Retour"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{demande.departement}</h1>
              <StatutBadge statut={demande.statut} />
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Créée le {new Date(demande.created_at).toLocaleDateString("fr-FR")}
              {" · "}
              {demande.demande_vehicules?.length ?? 0} véhicule(s)
            </p>
          </div>
        </div>

        {/* Action bar */}
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 pt-4 border-t border-gray-100">
          {/* chef_de_cours : modifier si en_attente */}
          {isChefDeCours && demande.statut === "en_attente" && (
            <Link
              to={`/demandes/${id}/modifier`}
              className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 bg-white border border-blue-300 text-blue-700 rounded-xl hover:bg-blue-50 transition-colors text-sm font-medium flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Modifier la demande
            </Link>
          )}

          {/* chef_departement : valider + annuler + modifier */}
          {isChefDept && demande.statut === "en_attente" && (
            <>
              <button
                onClick={handleValiderDept}
                disabled={processing === "valider_dept"}
                className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all shadow text-sm font-medium disabled:opacity-50"
              >
                {processing === "valider_dept" ? "Approbation…" : "Approuver la demande"}
              </button>
              <button
                onClick={handleAnnuler}
                disabled={processing === "annuler"}
                className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 bg-white border border-red-300 text-red-700 rounded-xl hover:bg-red-50 transition-colors text-sm font-medium disabled:opacity-50"
              >
                {processing === "annuler" ? "Annulation…" : "Annuler la demande"}
              </button>
            </>
          )}

          {isChefDept &&
            (demande.statut === "en_attente" || demande.statut === "validee_dept") &&
            !demande.demande_vehicules?.some((dv) => dv.statut === "ravitaille" || dv.statut === "valide") && (
              <Link
                to={`/demandes/${id}/modifier`}
                className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 bg-white border border-blue-300 text-blue-700 rounded-xl hover:bg-blue-50 transition-colors text-sm font-medium flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Modifier la demande
              </Link>
            )}

          {(isCircuitActor || isChefDeCours) && (demande.demande_vehicules ?? []).some((dv) => dv.statut === "valide") && (
            signaturesSituation.some((s) => s.role === "directeur_general") ? (
              <>
                <button
                  onClick={handlePrintSituation}
                  className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors text-sm font-medium flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Imprimer situation
                </button>
                <button
                  onClick={handlePrintBon}
                  className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors text-sm font-medium flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Imprimer les bons
                </button>
              </>
            ) : (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
                Impression disponible après signature du Directeur Général
              </p>
            )
          )}

          {demande.statut === "annulee" && (
            <span className={`px-4 py-2 rounded-xl text-sm font-medium border ${statutCfg.classes}`}>
              Demande annulée
            </span>
          )}
        </div>
      </div>

      {submitError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          {submitError}
        </p>
      )}

      {/* Vehicles list — pour non-acteurs du circuit, + pour cellule (actions de validation) */}
      {(!isCircuitActor || isCellule) && (
        <div className="space-y-4">
          {(demande.demande_vehicules ?? []).map((dv) => (
            <VehiculeCard
              key={dv.id}
              dv={dv}
              demande={demande}
              isStation={isStation}
              isStationViewer={isStationViewer}
              isCellule={isCellule}
              isChefDept={isChefDept}
              isChefDeCours={isChefDeCours}
              vehiculeInfo={vehiculesMap[dv.vehicule_id]}
              photos={photosMap[dv.id]}
              ravForm={ravForms[dv.id]}
              processing={processing}
              successMessage={successMap[dv.id]}
              onUpdateForm={(patch) => updateRavForm(dv.id, patch)}
              onUpdatePhoto={(type, file) => updateRavPhoto(dv.id, type, file)}
              onEnvoyer={() => handleEnvoyerRavitaillement(dv)}
              onValider={() => handleValiderVehicule(dv)}
              onRefuser={() => handleRefuserVehicule(dv)}
              onRetourner={() => handleRetournerRavitaillement(dv)}
            />
          ))}
        </div>
      )}

      {/* Placeholder pour chef_dept / signataires en attente de validation */}
      {(isChefDept || isSignataire) &&
        !(demande.demande_vehicules ?? []).some((dv) => dv.statut === "valide") && (
        <div className="bg-white rounded-2xl shadow border border-gray-200 p-8 text-center text-gray-400 text-sm">
          Les aperçus seront disponibles après validation des ravitaillements par la cellule.
        </div>
      )}

      {/* Aperçus situation + bons — pour tous les acteurs du circuit + chef_de_cours (lecture seule) */}
      {(isCircuitActor || isChefDeCours) && (demande.demande_vehicules ?? []).some((dv) => dv.statut === "valide") && (
        <>
          <SituationApercu
            demande={demande}
            vehiculesMap={vehiculesMap}
            signatures={signaturesSituation}
            userCircuitRole={userCircuitRole}
            isSigning={signingForSituation}
            signError={signErrorSituation}
            onSigner={handleSignerSituation}
          />
          <BonsApercu
            demande={demande}
            vehiculesMap={vehiculesMap}
            signatures={signaturesBons}
            userCircuitRole={userCircuitRole}
            isSigning={signingForBons}
            signError={signErrorBons}
            onSigner={handleSignerBons}
          />
        </>
      )}

      {/* Circuit de signatures — uniquement pour les non-acteurs hors chef_de_cours (ex: station) */}
      {!isCircuitActor && !isChefDeCours && (demande.demande_vehicules ?? []).some((dv) => dv.statut === "valide") && (
        <SignaturesSection
          signaturesSituation={signaturesSituation}
          signaturesBons={signaturesBons}
        />
      )}

      <div className="w-full h-1 bg-gradient-to-r from-amber-400 via-orange-500 to-green-600 rounded-full opacity-80" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// SignaturesSection
// ---------------------------------------------------------------------------

interface SignaturesSectionProps {
  signaturesSituation: SignatureSituation[];
  signaturesBons: SignatureSituation[];
}

function SignaturesSection({ signaturesSituation, signaturesBons }: SignaturesSectionProps) {
  function StepRow({ step, sigs }: { step: CircuitStep; sigs: SignatureSituation[] }) {
    const sig      = sigs.find((s) => s.role === step.role);
    const isSigned = !!sig;
    return (
      <div className="flex items-center gap-3 py-2.5 border-b border-gray-100 last:border-0">
        <span className={`flex-shrink-0 text-lg ${isSigned ? "text-green-500" : "text-gray-300"}`}>
          {isSigned ? "✅" : "⏳"}
        </span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${isSigned ? "text-gray-900" : "text-gray-400"}`}>
            {step.label}
          </p>
          {sig && (
            <p className="text-xs text-gray-400">
              Signé le {new Date(sig.signe_le).toLocaleDateString("fr-FR", {
                day: "2-digit", month: "2-digit", year: "numeric",
                hour: "2-digit", minute: "2-digit",
              })}
            </p>
          )}
        </div>
        {sig?.signature_url && (
          <img src={sig.signature_url} alt="sig" className="h-8 w-16 object-contain opacity-70" />
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-base font-semibold text-gray-900">Circuit de signatures</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Situation des dépenses et bons de carburant — circuits indépendants.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-0 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
        <div className="px-6 py-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Situation des dépenses (5 signataires)
          </p>
          {CIRCUIT_SITUATION.map((step) => (
            <StepRow key={step.role} step={step} sigs={signaturesSituation} />
          ))}
        </div>
        <div className="px-6 py-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Bons de carburant (3 signataires)
          </p>
          {CIRCUIT_BONS.map((step) => (
            <StepRow key={step.role} step={step} sigs={signaturesBons} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SituationApercu — vue en lecture pour les signataires
// ---------------------------------------------------------------------------

interface SituationApercuProps {
  demande: DemandeRavitaillement;
  vehiculesMap: Record<number, VehiculeInfo>;
  signatures: SignatureSituation[];       // circuit='situation' uniquement
  userCircuitRole: string | null;
  isSigning: boolean;
  signError: string | null;
  onSigner: (role: string, ordre: number) => void;
}

function SituationApercu({
  demande,
  vehiculesMap,
  signatures,
  userCircuitRole,
  isSigning,
  signError,
  onSigner,
}: SituationApercuProps) {
  const items      = (demande.demande_vehicules ?? []).filter((dv) => dv.statut === "valide");
  const dept       = demande.departement;
  const isCdpe     = normalizeZone(dept) === "cpde";
  const today      = new Date().toLocaleDateString("fr-FR");
  const dateStr    = new Date(demande.created_at).toLocaleDateString("fr-FR");
  const totalMontant = items.reduce((sum, dv) => sum + (dv.montant ?? 0), 0);
  const totalLitres  = items.reduce((sum, dv) => sum + (dv.n_liter  ?? 0), 0);

  const prochainSituation = getProchainSignataire(signatures, CIRCUIT_SITUATION);
  const alreadySigned     = userCircuitRole ? hasAlreadySigned(signatures, userCircuitRole) : false;
  const canSign           =
    !alreadySigned &&
    userCircuitRole !== null &&
    CIRCUIT_SITUATION.some((s) => s.role === userCircuitRole) &&
    prochainSituation?.role === userCircuitRole;

  const sigBlocks = isCdpe
    ? [
        { role: "chef_cellule",          label: "Chef de la Cellule" },
        { role: "directrice_financiere", label: "Directrice Financière" },
        { role: "chef_cellule",          label: "Chef Cellule CSÉ" },
        { role: "directeur_general",     label: "Directeur Général" },
      ]
    : [
        { role: "chef_departement",      label: "Chef Département" },
        { role: "directeur_technique",   label: "Directeur Technique" },
        { role: "directrice_financiere", label: "Directrice Financière" },
        { role: "chef_cellule",          label: "Chef Cellule CSÉ" },
        { role: "directeur_general",     label: "Directeur Général" },
      ];

  return (
    <div className="bg-white rounded-2xl shadow border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-base font-semibold text-gray-900">Aperçu de la situation</h2>
        <p className="text-xs text-gray-500 mt-0.5">Situation des dépenses carburant — lecture seule</p>
      </div>

      <div className="px-6 py-5 space-y-6">
        {/* En-tête document */}
        <div className="flex items-center gap-4">
          <img
            src="/rimatel-logo.jpeg"
            alt="Logo RIMATEL"
            className="w-16 h-16 object-contain flex-shrink-0"
          />
          <div className="flex-1">
            {isCdpe ? (
              <>
                <p className="font-bold text-sm text-gray-900">Direction Générale</p>
                <p className="text-sm text-gray-600">La Cellule de Pilotage de déploiement et des extensions</p>
              </>
            ) : (
              <>
                <p className="font-bold text-sm text-gray-900">Direction Technique</p>
                <p className="text-sm text-gray-600">{dept}</p>
              </>
            )}
          </div>
          <div className="text-sm text-gray-700 text-right whitespace-nowrap flex-shrink-0">
            Date : {today}
          </div>
        </div>

        {/* Titre */}
        <p className="text-center text-sm font-bold uppercase tracking-widest text-gray-900">
          Situation des dépenses carburant
        </p>

        {/* Tableau */}
        {items.length === 0 ? (
          <p className="text-center text-gray-400 py-6">Aucun véhicule validé pour le moment.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-gray-800 text-white">
                  <th className="px-3 py-2 text-center border border-gray-600">N°</th>
                  <th className="px-3 py-2 text-left border border-gray-600">Type · Matricule</th>
                  <th className="px-3 py-2 text-right border border-gray-600">Montant (MRU)</th>
                  <th className="px-3 py-2 text-right border border-gray-600">Litres (L)</th>
                  <th className="px-3 py-2 text-center border border-gray-600">Date</th>
                  <th className="px-3 py-2 text-left border border-gray-600">Responsable</th>
                </tr>
              </thead>
              <tbody>
                {items.map((dv, index) => {
                  const v = vehiculesMap[dv.vehicule_id];
                  return (
                    <tr key={dv.id} className={index % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="px-3 py-2 border border-gray-200 text-center">{index + 1}</td>
                      <td className="px-3 py-2 border border-gray-200">
                        <span className="font-medium">{v?.vehicule || "—"}</span>
                        {v?.matricule && (
                          <span className="block text-gray-500">{v.matricule}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 border border-gray-200 text-right font-medium">
                        {formatNumber(dv.montant ?? 0)}
                      </td>
                      <td className="px-3 py-2 border border-gray-200 text-right">
                        {formatNumber(dv.n_liter ?? 0)}
                      </td>
                      <td className="px-3 py-2 border border-gray-200 text-center">{dateStr}</td>
                      <td className="px-3 py-2 border border-gray-200">
                        {v?.chauffeur_responsable || "—"}
                      </td>
                    </tr>
                  );
                })}
                <tr className="bg-gray-100 font-bold">
                  <td className="px-3 py-2 border border-gray-200 text-right" colSpan={2}>
                    Total
                  </td>
                  <td className="px-3 py-2 border border-gray-200 text-right">
                    {formatNumber(totalMontant)}
                  </td>
                  <td className="px-3 py-2 border border-gray-200 text-right">
                    {formatNumber(totalLitres)}
                  </td>
                  <td className="px-3 py-2 border border-gray-200" colSpan={2} />
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Blocs de signatures */}
        <div
          className="grid gap-3 pt-2"
          style={{ gridTemplateColumns: `repeat(${sigBlocks.length}, minmax(0, 1fr))` }}
        >
          {sigBlocks.map((block, i) => {
            const sig = signatures.find((s) => s.role === block.role);
            return (
              <div key={i} className="text-center">
                <p className="text-xs font-bold uppercase tracking-tight mb-2 text-gray-700 leading-tight">
                  {block.label}
                </p>
                <div className="h-12 flex items-end justify-center mb-1">
                  {sig?.signature_url && (
                    <img
                      src={sig.signature_url}
                      alt={block.label}
                      className="max-h-12 max-w-full object-contain"
                    />
                  )}
                </div>
                <div className="border-b border-gray-400" />
              </div>
            );
          })}
        </div>

        {/* Bouton signer la situation */}
        {canSign && (
          <button
            onClick={() => {
              const step = CIRCUIT_SITUATION.find((s) => s.role === userCircuitRole);
              if (step) onSigner(step.role, step.ordre);
            }}
            disabled={isSigning}
            className="w-full min-h-[44px] px-4 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all shadow text-sm font-medium disabled:opacity-50"
          >
            {isSigning ? "Signature en cours…" : "Signer la situation"}
          </button>
        )}

        {canSign && (
          <p className="text-xs text-center text-gray-400">
            Pas encore de signature enregistrée ?{" "}
            <Link to="/signature/upload" className="text-teal-600 hover:underline font-medium">
              Enregistrer ma signature
            </Link>
          </p>
        )}

        {alreadySigned && (
          <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 text-center">
            Vous avez signé cette situation.
          </p>
        )}

        {signError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            {signError}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BonsApercu — aperçu en lecture des bons de carburant
// ---------------------------------------------------------------------------

interface BonsApercuProps {
  demande: DemandeRavitaillement;
  vehiculesMap: Record<number, VehiculeInfo>;
  signatures: SignatureSituation[];       // circuit='bons' uniquement
  userCircuitRole: string | null;
  isSigning: boolean;
  signError: string | null;
  onSigner: (role: string, ordre: number) => void;
}

function BonsApercu({
  demande,
  vehiculesMap,
  signatures,
  userCircuitRole,
  isSigning,
  signError,
  onSigner,
}: BonsApercuProps) {
  const items   = (demande.demande_vehicules ?? []).filter((dv) => dv.statut === "valide");
  const dept    = demande.departement;
  const dateStr = new Date(demande.created_at).toLocaleDateString("fr-FR");

  const prochainBons  = getProchainSignataire(signatures, CIRCUIT_BONS);
  const alreadySigned = userCircuitRole ? hasAlreadySigned(signatures, userCircuitRole) : false;
  const canSignBons   =
    !alreadySigned &&
    userCircuitRole !== null &&
    CIRCUIT_BONS.some((s) => s.role === userCircuitRole) &&
    prochainBons?.role === userCircuitRole;

  const bonSigBlocks = [
    { role: "chef_departement",  label: "Signature Chef Département" },
    { role: "chef_cellule",      label: "VISA Chef Cellule CSÉ" },
    { role: "directeur_general", label: "VISA Directeur Général" },
  ];

  if (items.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl shadow border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-base font-semibold text-gray-900">Aperçu des bons de carburant</h2>
        <p className="text-xs text-gray-500 mt-0.5">Bons de carburant — lecture seule</p>
      </div>

      <div className="px-6 py-5 space-y-5">
        {/* Grille de bons — 2 par ligne sur grands écrans */}
        <div className="grid sm:grid-cols-2 gap-4">
          {items.map((dv, index) => {
            const v        = vehiculesMap[dv.vehicule_id];
            const bonZone  = v?.zone ?? dept;
            const isBonCdpe = normalizeZone(bonZone) === "cpde";

            return (
              <div key={dv.id} className="border-2 border-gray-800 rounded-xl overflow-hidden text-xs">
                {/* En-tête du bon */}
                <div className="flex items-start gap-3 p-3 border-b border-gray-300 bg-gray-50">
                  <img
                    src="/rimatel-logo.jpeg"
                    alt="Logo RIMATEL"
                    className="w-10 h-10 object-contain flex-shrink-0"
                  />
                  <div>
                    {isBonCdpe ? (
                      <>
                        <p className="font-bold">Direction Générale</p>
                        <p className="text-gray-600 leading-tight">
                          La Cellule de Pilotage de déploiement et des extensions
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="font-bold">Direction Technique</p>
                        <p className="text-gray-600">{bonZone}</p>
                      </>
                    )}
                  </div>
                </div>

                {/* Corps du bon */}
                <div className="p-3">
                  <div className="border-t border-dashed border-gray-400 my-2" />
                  <p className="text-center text-sm font-bold uppercase tracking-wide py-0.5">
                    BON DE CARBURANT N° : {index + 1}
                  </p>
                  <div className="border-t border-dashed border-gray-400 my-2" />

                  {/* Champs */}
                  <div className="space-y-1">
                    {[
                      ["Date :",                          dateStr],
                      ["Matricule du véhicule :",         v?.matricule || "—"],
                      ["Type de Voiture :",               v?.vehicule  || "—"],
                      ["Nom du conducteur :",             v?.chauffeur_responsable || "—"],
                      ["Quantité de carburant (L) :",     formatNumber(dv.n_liter ?? 0)],
                      ["Montant :",                       `${formatNumber(dv.montant ?? 0)} MRU`],
                      ["Montant en lettres :",            numberToWordsFr(dv.montant ?? 0)],
                      ["Station-service :",               ""],
                    ].map(([label, value]) => (
                      <div key={label} className="flex gap-1 border-b border-gray-200 pb-0.5">
                        <span className="font-semibold whitespace-nowrap text-gray-700">{label}</span>
                        <span className="flex-1 text-gray-900">{value}</span>
                      </div>
                    ))}
                  </div>

                  {/* Blocs de signatures */}
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    {bonSigBlocks.map((block) => {
                      const sig = signatures.find((s) => s.role === block.role);
                      return (
                        <div key={block.role} className="text-center">
                          <p className="font-bold uppercase leading-tight mb-1" style={{ fontSize: "0.6rem" }}>
                            {block.label}
                          </p>
                          <div className="h-8 flex items-end justify-center mb-0.5">
                            {sig?.signature_url && (
                              <img
                                src={sig.signature_url}
                                alt={block.label}
                                className="max-h-8 max-w-full object-contain"
                              />
                            )}
                          </div>
                          <div className="border-b border-gray-600" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bouton signer les bons */}
        {canSignBons && (
          <button
            onClick={() => {
              const step = CIRCUIT_BONS.find((s) => s.role === userCircuitRole);
              if (step) onSigner(step.role, step.ordre);
            }}
            disabled={isSigning}
            className="w-full min-h-[44px] px-4 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all shadow text-sm font-medium disabled:opacity-50"
          >
            {isSigning ? "Signature en cours…" : "Signer les bons"}
          </button>
        )}

        {alreadySigned && (
          <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 text-center">
            Vous avez signé les bons.
          </p>
        )}

        {canSignBons && (
          <p className="text-xs text-center text-gray-400">
            Pas encore de signature enregistrée ?{" "}
            <Link to="/signature/upload" className="text-teal-600 hover:underline font-medium">
              Enregistrer ma signature
            </Link>
          </p>
        )}

        {signError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            {signError}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// VehiculeCard
// ---------------------------------------------------------------------------

interface VehiculeCardProps {
  dv: DemandeVehicule;
  demande: DemandeRavitaillement;
  isStation: boolean;
  isStationViewer: boolean;
  isCellule: boolean;
  isChefDept: boolean;
  isChefDeCours: boolean;
  vehiculeInfo?: VehiculeInfo;
  photos?: PhotoJustification[];
  ravForm: RavForm | undefined;
  processing: string | null;
  successMessage?: string;
  onUpdateForm: (patch: Partial<Omit<RavForm, "photos">>) => void;
  onUpdatePhoto: (type: TypePhoto, file: File | null) => void;
  onEnvoyer: () => void;
  onValider: () => void;
  onRefuser: () => void;
  onRetourner: () => void;
}

function VehiculeCard({
  dv,
  demande,
  isStation,
  isStationViewer,
  isCellule,
  isChefDept,
  isChefDeCours,
  vehiculeInfo,
  photos,
  ravForm,
  processing,
  successMessage,
  onUpdateForm,
  onUpdatePhoto,
  onEnvoyer,
  onValider,
  onRefuser,
  onRetourner,
}: VehiculeCardProps) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const showStationSent     = isStation && dv.statut === "ravitaille";
  const showStationReadOnly = isStation && (dv.statut === "ravitaille" || dv.statut === "valide");
  const showForm            = isStation && demande.statut === "validee_dept" && dv.statut === "en_attente";
  const showAmounts         = (isCellule || isChefDept || isStationViewer || isChefDeCours || showStationReadOnly) && dv.statut !== "en_attente";
  const showPhotos          = (isCellule || isStationViewer || isChefDeCours || showStationReadOnly) && (photos?.length ?? 0) > 0;
  const showCelluleActions = isCellule && dv.statut === "ravitaille";
  const isSaving           = processing === `rav_${dv.id}`;
  const isValidating       = processing === `valider_${dv.id}`;
  const isRefusing         = processing === `refuser_${dv.id}`;
  const isReturning        = processing === `retourner_${dv.id}`;

  const canEnvoyer =
    ravForm != null &&
    parseFloat(ravForm.montant) > 0 &&
    parseFloat(ravForm.n_liter) > 0 &&
    Object.values(ravForm.photos).some(Boolean);

  const vehiculeLabel = vehiculeInfo
    ? `${vehiculeInfo.matricule} · ${vehiculeInfo.vehicule}`
    : `Véhicule #${dv.vehicule_id}`;

  const vehiculeSubLabel = vehiculeInfo
    ? [vehiculeInfo.chauffeur_responsable, vehiculeInfo.zone].filter(Boolean).join(" · ")
    : "";

  return (
    <div className="bg-white rounded-2xl shadow border border-gray-200 overflow-hidden">
      {lightboxUrl && <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 truncate">{vehiculeLabel}</p>
          {vehiculeSubLabel && (
            <p className="text-xs text-gray-500 mt-0.5">{vehiculeSubLabel}</p>
          )}
        </div>
        <DvStatutBadge statut={dv.statut} demandeStatut={demande.statut} />
      </div>

      {/* Success message */}
      {successMessage && (
        <div className="px-6 py-3 bg-green-50 border-b border-green-100">
          <p className="text-sm text-green-700 font-medium">{successMessage}</p>
        </div>
      )}

      {/* Badge envoyé — station après envoi */}
      {showStationSent && (
        <div className="px-6 py-3 bg-blue-50 border-b border-blue-100 flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <span className="text-sm font-medium text-blue-700">Envoyé — en attente de validation</span>
        </div>
      )}

      {/* Amounts (cellule / chef / station après envoi) */}
      {showAmounts && (dv.montant != null || dv.n_liter != null || dv.kilometrage != null) && (
        <div className="px-6 py-4 grid grid-cols-3 gap-4 bg-gray-50 border-b border-gray-100">
          <AmountCell label="Montant" value={dv.montant} unit="MRU" />
          <AmountCell label="Litres"  value={dv.n_liter}  unit="L" />
          <AmountCell label="Kilométrage" value={dv.kilometrage} unit="km" />
        </div>
      )}

      {/* Photos lecture seule (cellule / viewer / chef / station après envoi) */}
      {showPhotos && (
        <div className="px-6 py-4 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Photos justificatives
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(["vehicule_avant", "vehicule_apres", "pompe"] as TypePhoto[]).map((type) => {
              const photo = photos?.find((p) => p.type === type);
              return (
                <div key={type} className="space-y-1">
                  {photo ? (
                    <button
                      type="button"
                      onClick={() => setLightboxUrl(photo.url)}
                      className="block w-full rounded-xl overflow-hidden border border-gray-200 hover:opacity-90 transition-opacity cursor-zoom-in"
                    >
                      <img
                        src={photo.url}
                        alt={PHOTO_LABELS[type]}
                        className="w-full h-32 object-cover"
                      />
                    </button>
                  ) : (
                    <div className="w-full h-32 rounded-xl border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center">
                      <span className="text-xs text-gray-400">Pas de photo</span>
                    </div>
                  )}
                  <p className="text-xs text-center text-gray-500">{PHOTO_LABELS[type]}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Cellule — valider / refuser / retourner par véhicule */}
      {showCelluleActions && (
        <div className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row gap-3 border-b border-gray-100">
          <button
            onClick={onValider}
            disabled={isValidating || isRefusing || isReturning}
            className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 bg-gradient-to-r from-green-500 to-teal-600 text-white rounded-xl hover:from-green-600 hover:to-teal-700 transition-all shadow text-sm font-medium disabled:opacity-50"
          >
            {isValidating ? "Validation…" : "Valider ce véhicule"}
          </button>
          <button
            onClick={onRetourner}
            disabled={isValidating || isRefusing || isReturning}
            className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 bg-white border border-orange-300 text-orange-700 rounded-xl hover:bg-orange-50 transition-colors text-sm font-medium disabled:opacity-50"
          >
            {isReturning ? "Retour…" : "Retourner à la station"}
          </button>
          <button
            onClick={onRefuser}
            disabled={isValidating || isRefusing || isReturning}
            className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 bg-white border border-red-300 text-red-700 rounded-xl hover:bg-red-50 transition-colors text-sm font-medium disabled:opacity-50"
          >
            {isRefusing ? "Refus…" : "Refuser ce véhicule"}
          </button>
        </div>
      )}

      {/* Saisie form (responsable station) */}
      {showForm && ravForm && (
        <div className="px-6 py-5 space-y-5">
          <p className="text-sm font-semibold text-gray-700">Saisir le ravitaillement</p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <NumericField
              id={`montant-${dv.id}`}
              label="Montant (MRU)"
              required
              value={ravForm.montant}
              onChange={(v) => onUpdateForm({ montant: v })}
            />
            <NumericField
              id={`n_liter-${dv.id}`}
              label="Litres (L)"
              required
              value={ravForm.n_liter}
              onChange={(v) => onUpdateForm({ n_liter: v })}
            />
            <NumericField
              id={`kilometrage-${dv.id}`}
              label="Kilométrage (km)"
              value={ravForm.kilometrage}
              onChange={(v) => onUpdateForm({ kilometrage: v })}
            />
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Photos ({(["vehicule_avant", "vehicule_apres", "pompe"] as TypePhoto[]).filter((t) => ravForm.photos[t]).length}/3)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {(["vehicule_avant", "vehicule_apres", "pompe"] as TypePhoto[]).map((type) => (
                <PhotoInput
                  key={type}
                  dvId={dv.id}
                  type={type}
                  file={ravForm.photos[type] ?? null}
                  onChange={(file) => onUpdatePhoto(type, file)}
                />
              ))}
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={onEnvoyer}
              disabled={isSaving || !canEnvoyer}
              title={!canEnvoyer ? "Saisissez le montant, les litres (L) et au moins une photo" : undefined}
              className="w-full sm:w-auto min-h-[44px] px-6 py-2.5 bg-gradient-to-r from-green-500 to-teal-600 text-white rounded-xl hover:from-green-600 hover:to-teal-700 transition-all shadow text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? "Envoi en cours…" : "Envoyer ce ravitaillement"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

function AmountCell({ label, value, unit }: { label: string; value?: number; unit: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="font-semibold text-gray-900">
        {value != null ? `${value.toLocaleString("fr-FR")} ${unit}` : "—"}
      </p>
    </div>
  );
}

function NumericField({
  id,
  label,
  value,
  onChange,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-gray-600 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        id={id}
        type="number"
        min="0"
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all"
      />
    </div>
  );
}

function PhotoInput({
  dvId,
  type,
  file,
  onChange,
}: {
  dvId: string;
  type: TypePhoto;
  file: File | null;
  onChange: (f: File | null) => void;
}) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const label      = PHOTO_LABELS[type];
  const previewUrl = file ? URL.createObjectURL(file) : null;
  const inputId    = `photo-${dvId}-${type}`;

  return (
    <div>
      {lightboxUrl && <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {previewUrl ? (
        <>
          <button
            type="button"
            onClick={() => setLightboxUrl(previewUrl)}
            className="block w-full h-28 rounded-xl border border-teal-400 bg-teal-50 overflow-hidden cursor-zoom-in"
          >
            <img src={previewUrl} alt={label} className="w-full h-full object-cover" />
          </button>
          <div className="flex mt-1">
            <label
              htmlFor={inputId}
              className="flex-1 text-xs text-center text-teal-600 hover:text-teal-800 cursor-pointer"
            >
              Modifier
            </label>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="flex-1 text-xs text-center text-red-500 hover:text-red-700"
            >
              Supprimer
            </button>
          </div>
        </>
      ) : (
        <label
          htmlFor={inputId}
          className="flex flex-col items-center justify-center w-full h-28 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 hover:border-teal-400 hover:bg-teal-50 cursor-pointer transition-colors"
        >
          <div className="flex flex-col items-center gap-1 text-gray-400">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-xs">Ajouter</span>
          </div>
        </label>
      )}
      <input
        id={inputId}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lightbox
// ---------------------------------------------------------------------------

function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  // Keyboard: Escape ferme
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Android back button: pousse un état history pour intercepter le retour
  useEffect(() => {
    window.history.pushState({ photo: true }, "");
    const handlePop = () => onClose();
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/90 flex items-center justify-center"
      style={{ zIndex: 9998 }}
      onClick={onClose}
    >
      {/* Bouton X — fixed pour rester visible même si l'image est grande */}
      <button
        type="button"
        onClick={onClose}
        className="fixed top-2.5 right-2.5 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/35 active:bg-white/50 transition-colors text-white"
        style={{ zIndex: 9999, width: 44, height: 44 }}
        aria-label="Fermer"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      <img
        src={url}
        alt="Photo agrandie"
        className="max-w-full max-h-full object-contain"
        style={{ touchAction: "pinch-zoom", userSelect: "none", transform: "scale(1)" }}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
