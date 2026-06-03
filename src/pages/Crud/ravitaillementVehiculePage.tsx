import type { FormEvent, ReactNode } from "react";
import { useMemo, useState } from "react";
import QRCode from "qrcode";
import { Modal } from "@/components/ui/Modal";
import ConfirmationCodeModal from "@/components/ui/ConfirmationCodeModal";
import SearchableVehiculeSelect from "@/components/ui/SearchableVehiculeSelect";
import { useAuthContext } from "@/context/AuthProvider";
import { useRavitaillementsVehicule } from "@/hooks/useRavitaillementVehicule";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { useVehicules } from "@/hooks/useVehicule";
import type { RavitaillementVehicule } from "@/types";

type RavitaillementDraft = {
  date: string | null;
  vehiculeId: number;
  montantRavitaille: number;
  commentaire: string;
  kilometrage: number;
  nLiter: number;
};

interface RavitaillementFormState {
  date: string;
  vehiculeId: string;
  montantRavitaille: string;
  commentaire: string;
  kilometrage: string;
  nLiter: string;
}

interface PendingConfirmation {
  title: string;
  description: string;
  confirmLabel: string;
  tone: "danger" | "warning";
  onConfirm: () => Promise<void>;
}

interface ActionIconButtonProps {
  label: string;
  onClick: () => void;
  children: ReactNode;
  className: string;
  disabled?: boolean;
}

const normalizeZone = (zone: string) => zone?.trim().toLowerCase();

const initialFormState: RavitaillementFormState = {
  date: "",
  vehiculeId: "",
  montantRavitaille: "",
  commentaire: "",
  kilometrage: "",
  nLiter: "",
};

function ActionIconButton({
  label,
  onClick,
  children,
  className,
  disabled = false,
}: ActionIconButtonProps) {
  return (
    <div className="relative group">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        title={label}
        className={`h-10 w-10 inline-flex items-center justify-center rounded-xl border transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      >
        {children}
      </button>
      <div className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-gray-900 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
        {label}
      </div>
    </div>
  );
}

function normalizeDateValue(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    const [day, month, year] = value.split("/");
    return `${year}-${month}-${day}`;
  }

  return value;
}

function formatDateForDisplay(value: string | null | undefined) {
  const normalized = normalizeDateValue(value);
  const date = normalized ? new Date(`${normalized}T00:00:00`) : null;

  if (!date || Number.isNaN(date.getTime())) {
    return value || "-";
  }

  return date.toLocaleDateString("fr-FR");
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function validateRavitaillementDraft(payload: RavitaillementDraft) {
  const errors: string[] = [];

  if (!payload.date) {
    errors.push("La date est obligatoire.");
  }

  if (!payload.vehiculeId) {
    errors.push("Le vehicule est obligatoire.");
  }

  if (Number.isNaN(payload.montantRavitaille) || payload.montantRavitaille < 0) {
    errors.push("Le montant ravitaille doit etre un nombre positif ou nul.");
  }

  if (Number.isNaN(payload.kilometrage) || payload.kilometrage < 0) {
    errors.push("Le kilometrage doit etre un nombre positif ou nul.");
  }

  if (Number.isNaN(payload.nLiter) || payload.nLiter < 0) {
    errors.push("Le nombre de litres doit etre un nombre positif ou nul.");
  }

  return errors;
}

export default function RavitaillementVehiculePage() {
  const { user } = useAuthContext();
  const {
    ravitaillements,
    loading,
    reload,
    addRavitaillementVehicule,
    updateRavitaillementVehicule,
    deleteRavitaillementVehicule,
  } = useRavitaillementsVehicule();
  useRealtimeSync({ onRavitaillementChange: reload });
  const { allVehicules, loading: vehiculesLoading } = useVehicules();

  const [search, setSearch] = useState("");
  const [dateFilterFrom, setDateFilterFrom] = useState("");
  const [dateFilterTo, setDateFilterTo] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRavitaillement, setEditingRavitaillement] = useState<RavitaillementVehicule | null>(null);
  const [form, setForm] = useState<RavitaillementFormState>(initialFormState);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const isDG     = user?.role === "signataire" && user?.circuit_role === "directeur_general";
  const isViewer = user?.role === "viewer" || isDG;

  const displayedRavitaillements = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return ravitaillements.filter((item) => {
      const matchesSearch =
        !normalizedSearch ||
        [
          item.vehicule?.vehicule || "",
          item.vehicule?.matricule || "",
          item.vehicule?.chauffeurResponsable || "",
          item.vehicule?.zone || "",
          item.commentaire || "",
          normalizeDateValue(item.date),
        ].some((value) => value.toLowerCase().includes(normalizedSearch));

      const itemDate = normalizeDateValue(item.date);
      const matchesDateFrom = !dateFilterFrom || (!!itemDate && itemDate >= dateFilterFrom);
      const matchesDateTo = !dateFilterTo || (!!itemDate && itemDate <= dateFilterTo);

      return matchesSearch && matchesDateFrom && matchesDateTo;
    });
  }, [dateFilterFrom, dateFilterTo, ravitaillements, search]);

  const stats = {
    total: displayedRavitaillements.length,
    litres: displayedRavitaillements.reduce((sum, item) => sum + item.nLiter, 0),
    montantRavitaille: displayedRavitaillements.reduce((sum, item) => sum + item.montantRavitaille, 0),
  };
  const displayedIds = useMemo(
    () => displayedRavitaillements.map((item) => item.id),
    [displayedRavitaillements]
  );
  const selectedRavitaillements = useMemo(
    () => ravitaillements.filter((item) => selectedIds.includes(item.id)),
    [ravitaillements, selectedIds]
  );
  const isAllDisplayedSelected =
    displayedIds.length > 0 && displayedIds.every((id) => selectedIds.includes(id));

  function updateForm<K extends keyof RavitaillementFormState>(
    key: K,
    value: RavitaillementFormState[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openAddModal() {
    setEditingRavitaillement(null);
    setForm(initialFormState);
    setIsModalOpen(true);
  }

  function openEditModal(item: RavitaillementVehicule) {
    setEditingRavitaillement(item);
    setForm({
      date: normalizeDateValue(item.date),
      vehiculeId: String(item.vehiculeId),
      montantRavitaille: String(item.montantRavitaille),
      commentaire: item.commentaire,
      kilometrage: String(item.kilometrage),
      nLiter: String(item.nLiter),
    });
    setIsModalOpen(true);
  }

  function requestConfirmation(payload: PendingConfirmation) {
    setPendingConfirmation(payload);
  }

  function toggleSelection(id: number) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]
    );
  }

  function toggleSelectAllDisplayed() {
    setSelectedIds((prev) => {
      if (isAllDisplayedSelected) {
        return prev.filter((id) => !displayedIds.includes(id));
      }

      const next = new Set(prev);
      for (const id of displayedIds) {
        next.add(id);
      }
      return Array.from(next);
    });
  }

  function clearSelection() {
    setSelectedIds([]);
  }

  function handlePrintSelection() {
    if (selectedRavitaillements.length === 0) {
      alert("Selectionnez au moins un ravitaillement a imprimer.");
      return;
    }

    const printWindow = window.open("", "_blank", "width=1200,height=900");

    if (!printWindow) {
      alert("Impossible d'ouvrir la fenetre d'impression.");
      return;
    }

    const logoUrl = `${window.location.origin}/LOGO.webp`;
    const rowsHtml = selectedRavitaillements
      .map(
        (item, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${formatDateForDisplay(item.date)}</td>
            <td>${escapeHtml(item.vehicule?.vehicule || "-")}</td>
            <td>${escapeHtml(item.vehicule?.matricule || "-")}</td>
            <td>${escapeHtml(item.vehicule?.chauffeurResponsable || "-")}</td>
            <td>${escapeHtml(item.vehicule?.zone || "-")}</td>
            <td>${formatNumber(item.montantRavitaille)}</td>
            <td>${formatNumber(item.nLiter)}</td>
            <td>${formatNumber(item.kilometrage)}</td>
            <td>${escapeHtml(item.commentaire || "-")}</td>
          </tr>
        `
      )
      .join("");

    const totalMontant = selectedRavitaillements.reduce(
      (sum, item) => sum + item.montantRavitaille,
      0
    );
    printWindow.document.write(`
      <!doctype html>
      <html lang="fr">
        <head>
          <meta charset="utf-8" />
          <title>Impression ravitaillements</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 24px;
              color: #1f2937;
            }
            .print-header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 24px;
              border-bottom: 3px solid #166534;
              padding-bottom: 16px;
              margin-bottom: 18px;
            }
            .print-header img {
              width: 80px;
              height: 80px;
              object-fit: contain;
              flex-shrink: 0;
            }
            .print-header-text {
              flex: 1;
              text-align: center;
            }
            .print-header-text h2,
            .print-header-text h3,
            .print-header-text h4 {
              margin: 0;
              font-weight: 700;
              color: #111827;
            }
            .print-header-text h2 {
              font-size: 20px;
              letter-spacing: 0.04em;
            }
            .print-header-text h3 {
              font-size: 16px;
              margin-top: 4px;
            }
            .print-header-text h4 {
              font-size: 15px;
              margin-top: 4px;
            }
            h1 {
              margin: 0 0 8px;
              font-size: 22px;
            }
            p {
              margin: 0 0 16px;
              color: #4b5563;
            }
            .summary {
              margin-bottom: 20px;
              padding: 12px 16px;
              background: #ecfdf5;
              border: 1px solid #a7f3d0;
              border-radius: 12px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
            }
            th, td {
              border: 1px solid #d1d5db;
              padding: 10px 8px;
              text-align: left;
              vertical-align: top;
              font-size: 12px;
            }
            th {
              background: #166534;
              color: white;
            }
            tbody tr:nth-child(even) {
              background: #f9fafb;
            }
            @media print {
              @page {
                margin: 0;
                size: A4;
              }
              body {
                margin: 12px;
              }
            }
          </style>
        </head>
        <body>
          <div class="print-header">
            <img src="${logoUrl}" alt="Logo RIMATEL" />
            <div class="print-header-text">
              <h2>RIMATEL</h2>
              <h3>Direction Générale</h3>
              <h4>Cellule de Contrôle, Suivi &amp; Évaluation</h4>
            </div>
            <div style="width: 80px;"></div>
          </div>
          <h1>Ravitaillements selectionnes</h1>
          <div class="summary">
            <strong>Nombre d'elements :</strong> ${selectedRavitaillements.length}
            <br />
            <strong>Montant total :</strong> ${formatNumber(totalMontant)}
          </div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Date</th>
                <th>Vehicule</th>
                <th>Matricule</th>
                <th>Chauffeur</th>
                <th>Zone</th>
                <th>Montant</th>
                <th>Litres</th>
                <th>Kilometrage</th>
                <th>Commentaire</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
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

  function handlePrintSituation() {
    if (selectedRavitaillements.length === 0) {
      alert("Selectionnez au moins un ravitaillement a imprimer.");
      return;
    }

    const allZones = selectedRavitaillements.map((item) => item.vehicule?.zone).filter(Boolean) as string[];
    const uniqueNormalizedZones = new Set(allZones.map(normalizeZone));
    if (uniqueNormalizedZones.size > 1) {
      alert("Veuillez sélectionner des ravitaillements de la même zone.");
      return;
    }

    const printWindow = window.open("", "_blank", "width=900,height=1200");
    if (!printWindow) {
      alert("Impossible d'ouvrir la fenetre d'impression.");
      return;
    }

    const logoUrl = `${window.location.origin}/LOGO.webp`;
    const zone = allZones[0] ?? "—";
    const isCdpe = normalizeZone(zone) === "cpde";
    const today = new Date().toLocaleDateString("fr-FR");
    const totalMontant = selectedRavitaillements.reduce((sum, item) => sum + item.montantRavitaille, 0);

    const rowsHtml = selectedRavitaillements
      .map(
        (item, index) => `
          <tr>
            <td style="text-align:center;">${index + 1}</td>
            <td>${escapeHtml(item.vehicule?.vehicule || "-")}<br/><small>${escapeHtml(item.vehicule?.matricule || "-")}</small></td>
            <td>${formatNumber(item.montantRavitaille)}</td>
            <td>${formatDateForDisplay(item.date)}</td>
            <td>${escapeHtml(item.vehicule?.chauffeurResponsable || "-")}<br/><small>Nom :</small></td>
            <td>STATION</td>
          </tr>
        `
      )
      .join("");

    const headerInfoHtml = isCdpe
      ? `<p><strong>Direction Générale</strong></p>
         <p>La Cellule de Pilotage de déploiement et des extensions</p>`
      : `<p><strong>Direction Technique</strong></p>
         <p>${escapeHtml(zone)}</p>`;

    const signaturesHtml = isCdpe
      ? `<div class="sig-block"><p class="sig-title">Chef de la Cellule</p><div class="sig-line"></div></div>
         <div class="sig-block"><p class="sig-title">Directrice Financière</p><div class="sig-line"></div></div>
         <div class="sig-block"><p class="sig-title">Chef Cellule CSÉ</p><div class="sig-line"></div></div>
         <div class="sig-block"><p class="sig-title">Directeur Général</p><div class="sig-line"></div></div>`
      : `<div class="sig-block"><p class="sig-title">Chef Département</p><div class="sig-line"></div></div>
         <div class="sig-block"><p class="sig-title">Directeur Technique</p><div class="sig-line"></div></div>
         <div class="sig-block"><p class="sig-title">Directrice Financière</p><div class="sig-line"></div></div>
         <div class="sig-block"><p class="sig-title">Chef Cellule CSÉ</p><div class="sig-line"></div></div>
         <div class="sig-block"><p class="sig-title">Directeur Général</p><div class="sig-line"></div></div>`;

    printWindow.document.write(`
      <!doctype html>
      <html lang="fr">
        <head>
          <meta charset="utf-8" />
          <title>Situation des Dépenses CARBURANT</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: Arial, sans-serif; color: #1f2937; font-size: 11px; }
            /* En-tête du document (une seule fois, hors tableau) */
            .doc-header { display: flex; align-items: center; justify-content: space-between;
                          gap: 16px; margin-bottom: 4px; }
            .doc-header img { width: 80px; height: 80px; object-fit: contain; flex-shrink: 0; border: 2px solid #166534; border-radius: 4px; padding: 4px; background: white; }
            .doc-header-info p { margin: 2px 0; font-size: 13px; }
            .doc-date { font-size: 13px; text-align: right; white-space: nowrap; }
            .doc-title { text-align: center; font-size: 15px; font-weight: 700;
                          text-transform: uppercase; letter-spacing: 0.04em;
                          margin: 10px 0 12px; }
            /* Tableau */
            table { width: 100%; border-collapse: collapse; table-layout: fixed; }
            /* En-têtes colonnes (répétés via thead) */
            thead th { background: #1f2937; color: white; font-weight: 700;
                        text-align: center; font-size: 11px;
                        border: 1px solid #374151; padding: 5px 4px; }
            /* Lignes de données */
            tbody td { border: 1px solid #374151; padding: 5px 4px;
                        text-align: left; vertical-align: top; font-size: 11px; }
            /* Ligne de total */
            .total-row td { border: 1px solid #374151; padding: 5px 4px;
                             font-size: 12px; font-weight: 700; }
            /* Signatures (une seule fois, après le tableau) */
            .signatures { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-top: 30px; }
            .sig-block { flex: 1; display: flex; flex-direction: column; align-items: center; min-height: 120px; }
            .sig-title { font-weight: bold; font-size: 11px; text-align: center; margin-bottom: auto; text-transform: uppercase; }
            .sig-image { max-width: 150px; max-height: 60px; object-fit: contain; margin-bottom: 4px; }
            .sig-line { width: 100%; border-bottom: 1px solid black; margin-top: 4px; }
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
          <p style="text-align: center; font-size: 13px; font-weight: bold; margin: 4px 0;">Centre d'appel : 28888882</p>
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

  async function handlePrintBon() {
    if (selectedRavitaillements.length === 0) {
      alert("Selectionnez au moins un ravitaillement a imprimer.");
      return;
    }

    const printWindow = window.open("", "_blank", "width=900,height=1200");
    if (!printWindow) {
      alert("Impossible d'ouvrir la fenetre d'impression.");
      return;
    }

    const logoUrl = `${window.location.origin}/LOGO.webp`;

    const sorted = [...selectedRavitaillements].sort((a, b) =>
      (a.vehicule?.zone ?? "").localeCompare(b.vehicule?.zone ?? "", "fr")
    );

    const qrMap: Record<number, string> = {};
    for (const item of sorted) {
      const url = `https://carburan-rimatel.vercel.app/bon/${item.id}`;
      qrMap[item.id] = await QRCode.toDataURL(url, { width: 100 });
    }

    function bonHtml(item: (typeof selectedRavitaillements)[0], num: number) {
      const itemZone = item.vehicule?.zone ?? "";
      const itemIsCdpe = normalizeZone(itemZone) === "cpde";
      const bonHeaderInfo = itemIsCdpe
        ? `<p><strong>Direction Générale</strong></p><p>La Cellule de Pilotage de déploiement et des extensions</p><p style="text-align: center; font-size: 13px; font-weight: bold; margin: 4px 0;">Centre d'appel : 28888882</p>`
        : `<p><strong>Direction Technique</strong></p><p>${escapeHtml(itemZone)}</p><p style="text-align: center; font-size: 13px; font-weight: bold; margin: 4px 0;">Centre d'appel : 28888882</p>`;
      const qrImg = qrMap[item.id]
        ? `<img src="${qrMap[item.id]}" alt="QR Code" class="bon-qr" />`
        : `<div style="width:80px;height:80px;flex-shrink:0;"></div>`;
      return `
        <div class="bon">
          <div class="bon-header">
            <img src="${logoUrl}" alt="Logo RIMATEL" />
            <div class="bon-header-info">${bonHeaderInfo}</div>
            ${qrImg}
          </div>
          <div class="bon-frame">
            <div class="dotted-line"></div>
            <div class="bon-title">BON DE CARBURANT N° : ${num}</div>
            <div class="dotted-line"></div>
            <div class="bon-fields">
              <div class="field-row">
                <span class="field-label">Date :</span>
                <span class="field-value">${formatDateForDisplay(item.date)}</span>
              </div>
              <div class="field-row">
                <span class="field-label">Matricule du véhicule :</span>
                <span class="field-value">${escapeHtml(item.vehicule?.matricule || "")}</span>
              </div>
              <div class="field-row">
                <span class="field-label">Type de Voiture :</span>
                <span class="field-value">${escapeHtml(item.vehicule?.vehicule || "")}</span>
              </div>
              <div class="field-row">
                <span class="field-label">Nom du conducteur :</span>
                <span class="field-value">${escapeHtml(item.vehicule?.chauffeurResponsable || "")}</span>
              </div>
              <div class="field-row">
                <span class="field-label">Quantité de carburant (Litres) :</span>
                <span class="field-value">${formatNumber(item.nLiter)}</span>
              </div>
              <div class="field-row">
                <span class="field-label">Montant :</span>
                <span class="field-value">${formatNumber(item.montantRavitaille)} MRU</span>
              </div>
              <div class="field-row">
                <span class="field-label">Montant en lettres :</span>
                <span class="field-value">${escapeHtml(numberToWordsFr(item.montantRavitaille))}</span>
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
                <div class="bon-sig-line"></div>
              </div>
              <div class="bon-sig">
                <p class="bon-sig-title">VISA Chef Cellule CSÉ</p>
                <div class="bon-sig-line"></div>
              </div>
              <div class="bon-sig">
                <p class="bon-sig-title">VISA Directeur Général</p>
                <div class="bon-sig-line"></div>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    const emptyBon = `<div class="bon"></div>`;

    const pages: string[] = [];
    for (let i = 0; i < sorted.length; i += 2) {
      const first = sorted[i];
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
            .bon-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
            .bon-header img { width: 80px; height: 80px; object-fit: contain; flex-shrink: 0; border: 2px solid #166534; border-radius: 4px; padding: 4px; background: white; }
            .bon-qr { width: 80px; height: 80px; object-fit: contain; flex-shrink: 0; border: 2px solid #166534; border-radius: 4px; padding: 4px; background: white; }
            .bon-header-info { flex: 1; text-align: center; }
            .bon-header-info p { margin: 2px 0; font-size: 13px; }
            .bon-frame { border: 2px solid #1f2937; padding: 8px 14px 12px; flex: 1; display: flex; flex-direction: column; overflow: hidden; }
            .dotted-line { border-top: 1px dashed #374151; margin: 5px 0; }
            .bon-title { text-align: center; font-size: 16px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; padding: 6px 0; }
            .bon-fields { margin-top: 8px; display: flex; flex-direction: column; gap: 5px; flex: 1; }
            .field-row { display: flex; align-items: baseline; gap: 6px; border-bottom: 1px solid #d1d5db; padding-bottom: 4px; }
            .field-label { white-space: nowrap; font-size: 14px; flex-shrink: 0; }
            .field-value { font-size: 14px; flex: 1; }
            .field-bold .field-label,
            .field-bold .field-value { font-weight: 700; font-size: 15px; }
            .bon-signatures { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-top: 12px; }
            .bon-sig { flex: 1; display: flex; flex-direction: column; align-items: center; min-height: 100px; }
            .bon-sig-title { font-weight: bold; font-size: 12px; text-align: center; margin-bottom: auto; text-transform: uppercase; }
            .bon-sig-line { width: 100%; border-bottom: 1px solid black; margin-top: 4px; }
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const montantRavitaille =
      form.montantRavitaille.trim() === "" ? Number.NaN : Number(form.montantRavitaille);
    const kilometrage = form.kilometrage.trim() === "" ? 0 : Number(form.kilometrage);
    const nLiter = form.nLiter.trim() === "" ? 0 : Number(form.nLiter);

    const payload: RavitaillementDraft = {
      date: form.date.trim() || null,
      vehiculeId: Number(form.vehiculeId),
      montantRavitaille,
      commentaire: form.commentaire.trim(),
      kilometrage,
      nLiter,
    };

    const validationErrors = validateRavitaillementDraft(payload);
    if (validationErrors.length > 0) {
      alert(validationErrors.join("\n"));
      return;
    }

    try {
      if (editingRavitaillement) {
        const currentItem = editingRavitaillement;
        requestConfirmation({
          title: "Confirmer la modification",
          description: `Vous allez modifier le ravitaillement du ${formatDateForDisplay(
            payload.date
          )} pour ${currentItem.vehicule?.vehicule || "ce vehicule"}.`,
          confirmLabel: "Confirmer la modification",
          tone: "warning",
          onConfirm: async () => {
            await updateRavitaillementVehicule({
              ...currentItem,
              ...payload,
            });
            setForm(initialFormState);
            setEditingRavitaillement(null);
            setIsModalOpen(false);
          },
        });
      } else {
        await addRavitaillementVehicule(payload);
        setForm(initialFormState);
        setEditingRavitaillement(null);
        setIsModalOpen(false);
      }
    } catch (error) {
      console.error(error);
      alert("Une erreur est survenue lors de l'enregistrement du ravitaillement.");
    }
  }

  async function handleDelete(item: RavitaillementVehicule) {
    requestConfirmation({
      title: "Confirmer la suppression",
      description: `Vous allez supprimer le ravitaillement du ${formatDateForDisplay(
        item.date
      )} pour ${item.vehicule?.vehicule || "ce vehicule"}. Cette action est sensible.`,
      confirmLabel: "Confirmer la suppression",
      tone: "danger",
      onConfirm: async () => {
        try {
          await deleteRavitaillementVehicule(item.id);
        } catch (error) {
          console.error(error);
          alert("Erreur lors de la suppression du ravitaillement.");
        }
      },
    });
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-teal-50 to-orange-50 p-3 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-r from-green-500 to-teal-600 rounded-xl shadow-lg">
                <span className="text-2xl">R</span>
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Ravitaillements vehicules</h1>
                <p className="text-gray-600 mt-1">
                  Suivez les ravitaillements, les montants, le kilometrage et les litres par vehicule.
                </p>
              </div>
            </div>

            {!isViewer && (
              <button
                onClick={openAddModal}
                className="bg-gradient-to-r from-green-500 to-teal-600 text-white px-6 py-3 rounded-xl hover:from-green-600 hover:to-teal-700 transition-all duration-200 shadow-lg hover:shadow-xl flex items-center gap-2 font-medium"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Ajouter un ravitaillement
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-8">
            <div className="bg-green-50 border border-green-200 rounded-2xl p-5">
              <p className="text-sm text-green-700 font-medium">Ravitaillements affiches</p>
              <p className="text-3xl font-bold text-green-900 mt-2">{stats.total}</p>
            </div>
            <div className="bg-teal-50 border border-teal-200 rounded-2xl p-5">
              <p className="text-sm text-teal-700 font-medium">Litres ravitailles</p>
              <p className="text-3xl font-bold text-teal-900 mt-2">{formatNumber(stats.litres)}</p>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5">
              <p className="text-sm text-orange-700 font-medium">Montant ravitaille</p>
              <p className="text-3xl font-bold text-orange-900 mt-2">{formatNumber(stats.montantRavitaille)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-2 relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Rechercher par vehicule, matricule, chauffeur, zone ou commentaire..."
                className="pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200 w-full bg-white shadow-sm"
              />
            </div>

            <input
              type="date"
              value={dateFilterFrom}
              onChange={(event) => setDateFilterFrom(event.target.value)}
              className="px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200 bg-white"
            />

            <input
              type="date"
              value={dateFilterTo}
              onChange={(event) => setDateFilterTo(event.target.value)}
              className="px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200 bg-white"
            />
          </div>

          <p className="mt-4 text-sm text-gray-500">
            Filtrez par intervalle de dates : de la premiere date jusqu'a la deuxieme.
          </p>

          <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <p className="text-sm text-gray-600">
              {selectedRavitaillements.length} element(s) selectionne(s) pour impression.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={toggleSelectAllDisplayed}
                disabled={displayedRavitaillements.length === 0}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 text-sm"
              >
                {isAllDisplayedSelected ? "Tout deselectionner" : "Selectionner les resultats"}
              </button>
              <button
                type="button"
                onClick={clearSelection}
                disabled={selectedRavitaillements.length === 0}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 text-sm"
              >
                Vider la selection
              </button>
              <button
                type="button"
                onClick={handlePrintSelection}
                disabled={selectedRavitaillements.length === 0}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-gradient-to-r from-green-500 to-teal-600 text-white hover:from-green-600 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg text-sm"
              >
                Imprimer la selection
              </button>
              <button
                type="button"
                onClick={handlePrintSituation}
                disabled={selectedRavitaillements.length === 0}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white hover:from-blue-600 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg text-sm"
              >
                Imprimer Situation
              </button>
              <button
                type="button"
                onClick={handlePrintBon}
                disabled={selectedRavitaillements.length === 0}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 text-white hover:from-orange-600 hover:to-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg text-sm"
              >
                Imprimer Bon
              </button>
            </div>
          </div>
        </div>

        {!isViewer && allVehicules.length === 0 && !vehiculesLoading && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-amber-800">
            Aucun vehicule n'est disponible pour l'instant. Creez d'abord un vehicule avant d'ajouter un ravitaillement.
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-green-50 to-teal-100 border-b border-green-200">
                <tr>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-green-800 uppercase tracking-wider">
                    Select.
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-green-800 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-green-800 uppercase tracking-wider">
                    Vehicule
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-green-800 uppercase tracking-wider">
                    Zone
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-green-800 uppercase tracking-wider">
                    Montant ravitaille
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-green-800 uppercase tracking-wider">
                    Litres
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-green-800 uppercase tracking-wider">
                    Kilometrage
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-green-800 uppercase tracking-wider">
                    Commentaire
                  </th>
                  {!isViewer && (
                    <th className="px-6 py-4 text-center text-sm font-semibold text-green-800 uppercase tracking-wider">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={isViewer ? 8 : 9} className="px-6 py-12 text-center">
                      <div className="flex justify-center items-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
                        <span className="ml-3 text-gray-600">Chargement des ravitaillements...</span>
                      </div>
                    </td>
                  </tr>
                ) : displayedRavitaillements.length === 0 ? (
                  <tr>
                    <td colSpan={isViewer ? 8 : 9} className="px-6 py-12 text-center">
                      <div className="text-center">
                        <h3 className="text-lg font-medium text-gray-900">Aucun ravitaillement</h3>
                        <p className="mt-1 text-gray-500">
                          {isViewer
                            ? "Ajustez vos filtres pour afficher des resultats."
                            : "Ajoutez un ravitaillement ou ajustez vos filtres pour afficher des resultats."}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  displayedRavitaillements.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50 transition-colors duration-150">
                      <td className="px-6 py-4 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(item.id)}
                          onChange={() => toggleSelection(item.id)}
                          className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                          aria-label={`Selectionner le ravitaillement ${item.id}`}
                        />
                      </td>
                      <td className="px-6 py-4 text-gray-700 font-medium">
                        {formatDateForDisplay(item.date)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-gray-900">
                          {item.vehicule?.vehicule || "Vehicule indisponible"}
                        </div>
                        <div className="text-sm text-gray-500">
                          {item.vehicule?.matricule || "-"}
                        </div>
                        <div className="text-sm text-gray-500">
                          {item.vehicule?.chauffeurResponsable || "-"}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-700">{item.vehicule?.zone || "-"}</td>
                      <td className="px-6 py-4 text-gray-700">{formatNumber(item.montantRavitaille)}</td>
                      <td className="px-6 py-4 text-gray-700">{formatNumber(item.nLiter)}</td>
                      <td className="px-6 py-4 text-gray-700">{formatNumber(item.kilometrage)}</td>
                      <td className="px-6 py-4 text-gray-700">
                        <div className="max-w-xs whitespace-pre-wrap break-words">
                          {item.commentaire || "-"}
                        </div>
                      </td>
                      {!isViewer && (
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap justify-center gap-2">
                            <ActionIconButton
                              label="Modifier"
                              onClick={() => openEditModal(item)}
                              className="text-amber-700 bg-amber-50 hover:bg-amber-100 border-amber-200"
                            >
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 20h4l10-10-4-4L4 16v4z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l4 4" />
                              </svg>
                            </ActionIconButton>
                            <ActionIconButton
                              label="Supprimer"
                              onClick={() => handleDelete(item)}
                              className="text-red-700 bg-red-50 hover:bg-red-100 border-red-200"
                            >
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 7h12" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 7V5h6v2" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7l1 12h6l1-12" />
                              </svg>
                            </ActionIconButton>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="w-full h-1 bg-gradient-to-r from-amber-400 via-orange-500 to-green-600 rounded-full opacity-80"></div>

        <Modal
          isOpen={!isViewer && isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={editingRavitaillement ? "Modifier le ravitaillement" : "Nouveau ravitaillement"}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-2">
                  Date
                </label>
                <input
                  id="date"
                  type="date"
                  value={form.date}
                  onChange={(event) => updateForm("date", event.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200"
                />
              </div>

              <div>
                <label htmlFor="vehicule-id" className="block text-sm font-medium text-gray-700 mb-2">
                  Vehicule
                </label>
                <SearchableVehiculeSelect
                  vehicules={allVehicules}
                  value={form.vehiculeId}
                  onChange={(nextValue) => updateForm("vehiculeId", nextValue)}
                  disabled={allVehicules.length === 0}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="montant-ravitaille" className="block text-sm font-medium text-gray-700 mb-2">
                  Montant ravitaille
                </label>
                <input
                  id="montant-ravitaille"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.montantRavitaille}
                  onChange={(event) => updateForm("montantRavitaille", event.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200"
                  placeholder="0"
                />
              </div>

              <div>
                <label htmlFor="n-liter" className="block text-sm font-medium text-gray-700 mb-2">
                  Nombre de litres
                </label>
                <input
                  id="n-liter"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.nLiter}
                  onChange={(event) => updateForm("nLiter", event.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200"
                  placeholder="0"
                />
              </div>

              <div>
                <label htmlFor="kilometrage" className="block text-sm font-medium text-gray-700 mb-2">
                  Kilometrage
                </label>
                <input
                  id="kilometrage"
                  type="number"
                  min="0"
                  step="1"
                  value={form.kilometrage}
                  onChange={(event) => updateForm("kilometrage", event.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200"
                  placeholder="0"
                />
              </div>
            </div>

            <div>
              <label htmlFor="commentaire" className="block text-sm font-medium text-gray-700 mb-2">
                Commentaire
              </label>
              <textarea
                id="commentaire"
                value={form.commentaire}
                onChange={(event) => updateForm("commentaire", event.target.value)}
                rows={4}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200 resize-y"
                placeholder="Ajoutez un commentaire utile si besoin..."
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-6 py-3 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all duration-200 font-medium"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="px-6 py-3 bg-gradient-to-r from-green-500 to-teal-600 text-white rounded-xl hover:from-green-600 hover:to-teal-700 transition-all duration-200 shadow-lg font-medium"
              >
                {editingRavitaillement ? "Enregistrer" : "Ajouter"}
              </button>
            </div>
          </form>
        </Modal>

        <ConfirmationCodeModal
          isOpen={!isViewer && pendingConfirmation !== null}
          onClose={() => setPendingConfirmation(null)}
          onConfirm={async () => {
            if (pendingConfirmation) {
              await pendingConfirmation.onConfirm();
            }
          }}
          title={pendingConfirmation?.title || ""}
          description={pendingConfirmation?.description || ""}
          confirmLabel={pendingConfirmation?.confirmLabel || "Confirmer"}
          tone={pendingConfirmation?.tone || "danger"}
        />
      </div>
    </div>
  );
}
