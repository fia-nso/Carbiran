import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/supabaseClient";
import { useAuthContext } from "@/context/AuthProvider";
import { useDemandes } from "@/hooks/useDemandes";
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
  en_attente:      { label: "En attente de validation",    classes: "bg-orange-100 text-orange-800 border-orange-200" },
  validee_dept:    { label: "Approuvée par le département", classes: "bg-blue-100 text-blue-800 border-blue-200" },
  validee_station: { label: "Ravitaillement effectué",     classes: "bg-purple-100 text-purple-800 border-purple-200" },
  validee_cellule: { label: "Validée",                     classes: "bg-green-100 text-green-800 border-green-200" },
  annulee:         { label: "Annulée",                     classes: "bg-red-100 text-red-800 border-red-200" },
};

const DV_STATUT: Record<string, { label: string; classes: string }> = {
  en_attente: { label: "En attente de validation", classes: "bg-orange-100 text-orange-700" },
  ravitaille: { label: "Ravitaillé",               classes: "bg-blue-100 text-blue-700" },
  valide:     { label: "Validé",                   classes: "bg-green-100 text-green-700" },
  refuse:     { label: "Refusé",                   classes: "bg-red-100 text-red-700" },
};

function StatutBadge({ statut }: { statut: StatutDemande }) {
  const cfg = STATUT_CONFIG[statut];
  return (
    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cfg.classes}`}>
      {cfg.label}
    </span>
  );
}

function DvStatutBadge({ statut }: { statut: string }) {
  const cfg = DV_STATUT[statut] ?? { label: statut, classes: "bg-gray-100 text-gray-700" };
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

  const [demande, setDemande] = useState<DemandeRavitaillement | null>(null);
  const [vehiculesMap, setVehiculesMap] = useState<Record<number, VehiculeInfo>>({});
  const [photosMap, setPhotosMap] = useState<Record<string, PhotoJustification[]>>({});
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [ravForms, setRavForms] = useState<Record<string, RavForm>>({});
  const [successMap, setSuccessMap] = useState<Record<string, string>>({});

  const isChefDeCours   = user?.role === "chef_de_cours";
  const isChefDept      = user?.role === "chef_departement";
  const isStation       = user?.role === "responsable_station";
  const isStationViewer = user?.role === "responsable_station_viewer";
  const isCellule       = user?.role === "Admin" || user?.role === "MENAGER";

  // -------------------------------------------------------------------------
  // Fetch demande + photos
  // -------------------------------------------------------------------------

  const fetchDemande = useCallback(async () => {
    if (!id) return;
    setLoading(true);
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
      });

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

    const signaturesHtml = isCdpe
      ? `<div class="sig-block"><p class="sig-title">Chef de la Cellule</p><div class="sig-space"></div></div>
         <div class="sig-block"><p class="sig-title">Directrice Financière</p><div class="sig-space"></div></div>
         <div class="sig-block"><p class="sig-title">Chef Cellule CSÉ</p><div class="sig-space"></div></div>
         <div class="sig-block"><p class="sig-title">Directeur Général</p><div class="sig-space"></div></div>`
      : `<div class="sig-block"><p class="sig-title">Chef Département</p><div class="sig-space"></div></div>
         <div class="sig-block"><p class="sig-title">Directeur Technique</p><div class="sig-space"></div></div>
         <div class="sig-block"><p class="sig-title">Directrice Financière</p><div class="sig-space"></div></div>
         <div class="sig-block"><p class="sig-title">Chef Cellule CSÉ</p><div class="sig-space"></div></div>
         <div class="sig-block"><p class="sig-title">Directeur Général</p><div class="sig-space"></div></div>`;

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
            @media print {
              @page { size: A4 landscape; margin: 0; }
              body { font-size: 11px; }
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
                <div class="bon-sig-space"></div>
              </div>
              <div class="bon-sig">
                <p class="bon-sig-title">VISA Chef Cellule CSÉ</p>
                <div class="bon-sig-space"></div>
              </div>
              <div class="bon-sig">
                <p class="bon-sig-title">VISA Directeur Général</p>
                <div class="bon-sig-space"></div>
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
            .page { width: 210mm; height: 297mm; display: flex; flex-direction: column; overflow: hidden; }
            .page-break { page-break-after: always; }
            .bon { height: 148.5mm; display: flex; flex-direction: column; padding: 8mm 12mm; overflow: hidden; }
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
            @media print {
              @page { margin: 0; size: A4 portrait; }
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
                {processing === "valider_dept" ? "Validation…" : "Valider la demande"}
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

          {isChefDept && (
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

      {/* Vehicles list */}
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

      <div className="w-full h-1 bg-gradient-to-r from-amber-400 via-orange-500 to-green-600 rounded-full opacity-80" />
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
  const showForm           = isStation && demande.statut === "validee_dept" && dv.statut === "en_attente";
  const showAmounts        = (isCellule || isChefDept || isStationViewer) && dv.statut !== "en_attente";
  const showPhotos         = (isCellule || isStationViewer) && (photos?.length ?? 0) > 0;
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
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 truncate">{vehiculeLabel}</p>
          {vehiculeSubLabel && (
            <p className="text-xs text-gray-500 mt-0.5">{vehiculeSubLabel}</p>
          )}
        </div>
        <DvStatutBadge statut={dv.statut} />
      </div>

      {/* Success message */}
      {successMessage && (
        <div className="px-6 py-3 bg-green-50 border-b border-green-100">
          <p className="text-sm text-green-700 font-medium">{successMessage}</p>
        </div>
      )}

      {/* Amounts (cellule / chef after ravitaillement) */}
      {showAmounts && (dv.montant != null || dv.n_liter != null || dv.kilometrage != null) && (
        <div className="px-6 py-4 grid grid-cols-3 gap-4 bg-gray-50 border-b border-gray-100">
          <AmountCell label="Montant" value={dv.montant} unit="MRU" />
          <AmountCell label="Litres"  value={dv.n_liter}  unit="L" />
          <AmountCell label="Kilométrage" value={dv.kilometrage} unit="km" />
        </div>
      )}

      {/* Photos (cellule only) */}
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
                    <a
                      href={photo.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-xl overflow-hidden border border-gray-200 hover:opacity-90 transition-opacity"
                    >
                      <img
                        src={photo.url}
                        alt={PHOTO_LABELS[type]}
                        className="w-full h-32 object-cover"
                      />
                    </a>
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
  type,
  file,
  onChange,
}: {
  type: TypePhoto;
  file: File | null;
  onChange: (f: File | null) => void;
}) {
  const label      = PHOTO_LABELS[type];
  const previewUrl = file ? URL.createObjectURL(file) : null;

  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <label
        className={`flex flex-col items-center justify-center w-full h-28 rounded-xl border-2 border-dashed cursor-pointer transition-colors overflow-hidden ${
          file
            ? "border-teal-400 bg-teal-50"
            : "border-gray-300 bg-gray-50 hover:border-teal-400 hover:bg-teal-50"
        }`}
      >
        {previewUrl ? (
          <img src={previewUrl} alt={label} className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-1 text-gray-400">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-xs">Ajouter</span>
          </div>
        )}
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        />
      </label>
      {file && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="mt-1 text-xs text-red-500 hover:text-red-700 w-full text-center"
        >
          Supprimer
        </button>
      )}
    </div>
  );
}
