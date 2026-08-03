import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRavitaillementsVehicule } from "@/hooks/useRavitaillementVehicule";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import SearchableVehiculeSelect from "@/components/ui/SearchableVehiculeSelect";
import type { Vehicule } from "@/types";

const monthLabels = [
  "Janvier",
  "Fevrier",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Aout",
  "Septembre",
  "Octobre",
  "Novembre",
  "Decembre",
];

function extractYear(value: string | null | undefined) {
  if (!value) return null;
  const match = value.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return Number(match[1]);
}

function extractMonthIndex(value: string | null | undefined) {
  if (!value) return null;
  const match = value.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return Number(match[2]) - 1;
}

function monthKeyOf(value: string | null | undefined) {
  const year = extractYear(value);
  const monthIndex = extractMonthIndex(value);
  if (year === null || monthIndex === null) return null;
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function formatCount(value: number) {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}

function formatMetric(value: number) {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export default function DashboardPage() {
  const { ravitaillements, loading, reload } = useRavitaillementsVehicule();
  useRealtimeSync({ onRavitaillementChange: reload });

  const [selectedYear, setSelectedYear] = useState<number>(() => new Date().getFullYear());
  const [selectedMonthIndex, setSelectedMonthIndex] = useState<number | null>(null);

  // Detail panel filters
  const [filterZone, setFilterZone] = useState("");
  const [filterCentre, setFilterCentre] = useState("");
  const [filterMatricule, setFilterMatricule] = useState("");

  // "Consommation par véhicule" — filtres véhicule + zone + mois (indépendants du reste)
  const [consoVehicule, setConsoVehicule] = useState<string>(""); // "" = tous, sinon id véhicule
  const [consoZone, setConsoZone] = useState<string>(""); // "" = toutes les zones
  // Multi-sélection de mois. [] = cumul total, 1 = ce mois, 2+ = comparaison en colonnes.
  const [consoMonths, setConsoMonths] = useState<string[]>([]);
  const [monthDropdownOpen, setMonthDropdownOpen] = useState(false);
  const monthDropdownRef = useRef<HTMLDivElement>(null);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (const item of ravitaillements) {
      const year = extractYear(item.date);
      if (year) years.add(year);
    }
    if (years.size === 0) years.add(new Date().getFullYear());
    return Array.from(years).sort((a, b) => b - a);
  }, [ravitaillements]);

  const effectiveYear = availableYears.includes(selectedYear) ? selectedYear : availableYears[0];

  const monthlyRows = useMemo(() => {
    const rows = monthLabels.map((label) => ({
      month: label,
      nbRavitaillements: 0,
      montantRavitaille: 0,
      litres: 0,
      kilometrage: 0,
    }));
    for (const item of ravitaillements) {
      const year = extractYear(item.date);
      const month = extractMonthIndex(item.date);
      if (year === effectiveYear && month !== null) {
        rows[month].nbRavitaillements += 1;
        rows[month].montantRavitaille += item.montantRavitaille;
        rows[month].litres += item.nLiter;
        rows[month].kilometrage += item.kilometrage;
      }
    }
    return rows;
  }, [effectiveYear, ravitaillements]);

  const totals = monthlyRows.reduce(
    (acc, row) => ({
      nbRavitaillements: acc.nbRavitaillements + row.nbRavitaillements,
      montantRavitaille: acc.montantRavitaille + row.montantRavitaille,
      litres: acc.litres + row.litres,
      kilometrage: acc.kilometrage + row.kilometrage,
    }),
    { nbRavitaillements: 0, montantRavitaille: 0, litres: 0, kilometrage: 0 }
  );

  // Ravitaillements for the selected month (unfiltered)
  const monthRavitaillements = useMemo(() => {
    if (selectedMonthIndex === null) return [];
    return ravitaillements.filter((item) => {
      return extractYear(item.date) === effectiveYear && extractMonthIndex(item.date) === selectedMonthIndex;
    });
  }, [ravitaillements, effectiveYear, selectedMonthIndex]);

  // Available zones and centres for the selected month
  const { availableZones, availableCentres } = useMemo(() => {
    const zones = new Set<string>();
    const centres = new Set<string>();
    for (const item of monthRavitaillements) {
      if (item.vehicule?.zone) zones.add(item.vehicule.zone);
      if (item.vehicule?.centre) centres.add(item.vehicule.centre);
    }
    return {
      availableZones: Array.from(zones).sort(),
      availableCentres: Array.from(centres).sort(),
    };
  }, [monthRavitaillements]);

  // Filtered ravitaillements for the detail panel
  const filteredMonthRavitaillements = useMemo(() => {
    return monthRavitaillements.filter((item) => {
      if (filterZone && item.vehicule?.zone !== filterZone) return false;
      if (filterCentre && item.vehicule?.centre !== filterCentre) return false;
      if (
        filterMatricule &&
        !item.vehicule?.matricule.toLowerCase().includes(filterMatricule.toLowerCase())
      )
        return false;
      return true;
    });
  }, [monthRavitaillements, filterZone, filterCentre, filterMatricule]);

  // Group by vehicule_id for the detail table
  const vehiculeRows = useMemo(() => {
    const map = new Map<
      number,
      {
        vehiculeId: number;
        matricule: string;
        nom: string;
        zone: string;
        centre: string;
        count: number;
        montant: number;
        litres: number;
        kilometrage: number;
      }
    >();
    for (const item of filteredMonthRavitaillements) {
      const key = item.vehiculeId;
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
        existing.montant += item.montantRavitaille;
        existing.litres += item.nLiter;
        existing.kilometrage += item.kilometrage;
      } else {
        map.set(key, {
          vehiculeId: key,
          matricule: item.vehicule?.matricule ?? `#${key}`,
          nom: item.vehicule?.vehicule ?? "—",
          zone: item.vehicule?.zone ?? "—",
          centre: item.vehicule?.centre ?? "—",
          count: 1,
          montant: item.montantRavitaille,
          litres: item.nLiter,
          kilometrage: item.kilometrage,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.matricule.localeCompare(b.matricule));
  }, [filteredMonthRavitaillements]);

  const detailTotals = useMemo(
    () =>
      vehiculeRows.reduce(
        (acc, r) => ({
          count: acc.count + r.count,
          montant: acc.montant + r.montant,
          litres: acc.litres + r.litres,
          kilometrage: acc.kilometrage + r.kilometrage,
        }),
        { count: 0, montant: 0, litres: 0, kilometrage: 0 }
      ),
    [vehiculeRows]
  );

  const hasFilters = filterZone !== "" || filterCentre !== "" || filterMatricule !== "";

  // -------------------------------------------------------------------------
  // Consommation par véhicule (tous les ravitaillements enregistrés)
  // -------------------------------------------------------------------------

  // Liste des véhicules distincts présents dans les ravitaillements (pour le combobox).
  const consoVehiculeList = useMemo<Vehicule[]>(() => {
    const map = new Map<number, Vehicule>();
    for (const item of ravitaillements) {
      if (item.vehicule && !map.has(item.vehiculeId)) {
        map.set(item.vehiculeId, item.vehicule);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.matricule.localeCompare(b.matricule));
  }, [ravitaillements]);

  // Zones distinctes des véhicules ravitaillés (pour le filtre zone).
  const consoZoneOptions = useMemo(() => {
    const zones = new Set<string>();
    for (const item of ravitaillements) {
      if (item.vehicule?.zone) zones.add(item.vehicule.zone);
    }
    return Array.from(zones).sort();
  }, [ravitaillements]);

  // Liste des mois (YYYY-MM) où il existe au moins un ravitaillement, les plus récents d'abord.
  const consoMonthOptions = useMemo(() => {
    const keys = new Set<string>();
    for (const item of ravitaillements) {
      const year = extractYear(item.date);
      const monthIndex = extractMonthIndex(item.date);
      if (year !== null && monthIndex !== null) {
        keys.add(`${year}-${String(monthIndex + 1).padStart(2, "0")}`);
      }
    }
    return Array.from(keys)
      .sort((a, b) => b.localeCompare(a))
      .map((key) => {
        const [year, month] = key.split("-");
        return { key, label: `${monthLabels[Number(month) - 1]} ${year}` };
      });
  }, [ravitaillements]);

  // Ferme le dropdown des mois au clic à l'extérieur.
  useEffect(() => {
    if (!monthDropdownOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (monthDropdownRef.current && !monthDropdownRef.current.contains(event.target as Node)) {
        setMonthDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [monthDropdownOpen]);

  const consoMonthLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const option of consoMonthOptions) map.set(option.key, option.label);
    return map;
  }, [consoMonthOptions]);

  const labelOfMonth = (key: string) => consoMonthLabelMap.get(key) ?? key;

  // Mois sélectionnés triés chronologiquement (ex: Juin avant Juillet) pour l'ordre des colonnes.
  const selectedMonthsSorted = useMemo(
    () => [...consoMonths].sort((a, b) => a.localeCompare(b)),
    [consoMonths]
  );

  const isComparison = consoMonths.length >= 2;

  function toggleConsoMonth(key: string) {
    setConsoMonths((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  // Mode simple (0 ou 1 mois) : cumul total ou un seul mois.
  const consoScoped = useMemo(
    () =>
      ravitaillements.filter((r) => {
        if (consoVehicule !== "" && r.vehiculeId !== Number(consoVehicule)) return false;
        if (consoZone !== "" && r.vehicule?.zone !== consoZone) return false;
        if (consoMonths.length === 1 && monthKeyOf(r.date) !== consoMonths[0]) return false;
        return true;
      }),
    [ravitaillements, consoVehicule, consoZone, consoMonths]
  );

  // Mode comparaison (2 mois ou plus) : par véhicule, agrégats par mois côte à côte.
  const comparison = useMemo(() => {
    if (!isComparison) return null;
    const monthSet = new Set(consoMonths);
    const map = new Map<
      number,
      {
        vehiculeId: number;
        matricule: string;
        nom: string;
        byMonth: Record<string, { count: number; litres: number; montant: number }>;
      }
    >();
    for (const item of ravitaillements) {
      if (consoVehicule !== "" && item.vehiculeId !== Number(consoVehicule)) continue;
      if (consoZone !== "" && item.vehicule?.zone !== consoZone) continue;
      const key = monthKeyOf(item.date);
      if (key === null || !monthSet.has(key)) continue;
      let entry = map.get(item.vehiculeId);
      if (!entry) {
        entry = {
          vehiculeId: item.vehiculeId,
          matricule: item.vehicule?.matricule ?? `#${item.vehiculeId}`,
          nom: item.vehicule?.vehicule ?? "—",
          byMonth: {},
        };
        map.set(item.vehiculeId, entry);
      }
      const cell = entry.byMonth[key] ?? { count: 0, litres: 0, montant: 0 };
      cell.count += 1;
      cell.litres += item.nLiter;
      cell.montant += item.montantRavitaille;
      entry.byMonth[key] = cell;
    }
    const rows = Array.from(map.values()).sort((a, b) => a.matricule.localeCompare(b.matricule));
    const totalsByMonth: Record<string, { count: number; litres: number; montant: number }> = {};
    for (const key of consoMonths) totalsByMonth[key] = { count: 0, litres: 0, montant: 0 };
    for (const row of rows) {
      for (const key of consoMonths) {
        const cell = row.byMonth[key];
        if (!cell) continue;
        totalsByMonth[key].count += cell.count;
        totalsByMonth[key].litres += cell.litres;
        totalsByMonth[key].montant += cell.montant;
      }
    }
    return { rows, totalsByMonth };
  }, [isComparison, consoMonths, consoVehicule, consoZone, ravitaillements]);

  const consoRows = useMemo(() => {
    const map = new Map<
      number,
      { vehiculeId: number; matricule: string; nom: string; count: number; litres: number; montant: number }
    >();
    for (const item of consoScoped) {
      const existing = map.get(item.vehiculeId);
      if (existing) {
        existing.count += 1;
        existing.litres += item.nLiter;
        existing.montant += item.montantRavitaille;
      } else {
        map.set(item.vehiculeId, {
          vehiculeId: item.vehiculeId,
          matricule: item.vehicule?.matricule ?? `#${item.vehiculeId}`,
          nom: item.vehicule?.vehicule ?? "—",
          count: 1,
          litres: item.nLiter,
          montant: item.montantRavitaille,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.matricule.localeCompare(b.matricule));
  }, [consoScoped]);

  const consoTotals = useMemo(
    () =>
      consoRows.reduce(
        (acc, r) => ({ count: acc.count + r.count, litres: acc.litres + r.litres, montant: acc.montant + r.montant }),
        { count: 0, litres: 0, montant: 0 }
      ),
    [consoRows]
  );

  // Impression / export PDF du tableau "Consommation par vehicule" tel qu'affiche
  // (memes filtres : vehicule, zone, mois ou comparaison multi-mois).
  function handleDownloadConsoPdf() {
    const printWindow = window.open("", "_blank", "width=1200,height=900");

    if (!printWindow) {
      alert("Impossible d'ouvrir la fenetre d'impression.");
      return;
    }

    const logoUrl = `${window.location.origin}/LOGO.webp`;

    const selectedVehicule =
      consoVehicule === ""
        ? null
        : consoVehiculeList.find((v) => String(v.id) === consoVehicule) ?? null;

    const vehiculeFilterLabel = selectedVehicule
      ? `${selectedVehicule.matricule} — ${selectedVehicule.vehicule}`
      : "Tous les vehicules";
    const zoneFilterLabel = consoZone === "" ? "Toutes les zones" : consoZone;
    const periodeFilterLabel =
      consoMonths.length === 0
        ? "Cumul de tous les mois"
        : consoMonths.length === 1
          ? labelOfMonth(consoMonths[0])
          : `Comparaison : ${selectedMonthsSorted.map(labelOfMonth).join(", ")}`;

    let tableHtml: string;

    if (isComparison && comparison) {
      const monthHeadHtml = selectedMonthsSorted
        .map((key) => `<th colspan="3" class="month-group">${escapeHtml(labelOfMonth(key))}</th>`)
        .join("");
      const subHeadHtml = selectedMonthsSorted
        .map(() => '<th class="num group-start">Nb</th><th class="num">Litres</th><th class="num">Montant</th>')
        .join("");
      const bodyHtml =
        comparison.rows.length === 0
          ? `<tr><td colspan="${2 + selectedMonthsSorted.length * 3}" class="empty">Aucun ravitaillement pour les filtres selectionnes.</td></tr>`
          : comparison.rows
              .map((row) => {
                const cells = selectedMonthsSorted
                  .map((key) => {
                    const cell = row.byMonth[key];
                    return `
                      <td class="num group-start">${cell ? formatCount(cell.count) : "—"}</td>
                      <td class="num">${cell ? formatMetric(cell.litres) : "—"}</td>
                      <td class="num">${cell ? formatAmount(cell.montant) : "—"}</td>
                    `;
                  })
                  .join("");
                return `
                  <tr>
                    <td>${escapeHtml(row.matricule)}</td>
                    <td>${escapeHtml(row.nom)}</td>
                    ${cells}
                  </tr>
                `;
              })
              .join("");
      const footHtml =
        comparison.rows.length === 0
          ? ""
          : `
            <tfoot>
              <tr>
                <td colspan="2">Total (${comparison.rows.length} vehicule${comparison.rows.length > 1 ? "s" : ""})</td>
                ${selectedMonthsSorted
                  .map((key) => {
                    const t = comparison.totalsByMonth[key];
                    return `
                      <td class="num group-start">${formatCount(t.count)}</td>
                      <td class="num">${formatMetric(t.litres)}</td>
                      <td class="num">${formatAmount(t.montant)}</td>
                    `;
                  })
                  .join("")}
              </tr>
            </tfoot>
          `;
      tableHtml = `
        <table>
          <thead>
            <tr>
              <th rowspan="2">Matricule</th>
              <th rowspan="2">Vehicule</th>
              ${monthHeadHtml}
            </tr>
            <tr>${subHeadHtml}</tr>
          </thead>
          <tbody>${bodyHtml}</tbody>
          ${footHtml}
        </table>
      `;
    } else {
      const bodyHtml =
        consoRows.length === 0
          ? '<tr><td colspan="5" class="empty">Aucun ravitaillement pour les filtres selectionnes.</td></tr>'
          : consoRows
              .map(
                (row) => `
                  <tr>
                    <td>${escapeHtml(row.matricule)}</td>
                    <td>${escapeHtml(row.nom)}</td>
                    <td class="num">${formatCount(row.count)}</td>
                    <td class="num">${formatMetric(row.litres)}</td>
                    <td class="num">${formatAmount(row.montant)}</td>
                  </tr>
                `
              )
              .join("");
      const footHtml =
        consoRows.length === 0
          ? ""
          : `
            <tfoot>
              <tr>
                <td colspan="2">Total (${consoRows.length} vehicule${consoRows.length > 1 ? "s" : ""})</td>
                <td class="num">${formatCount(consoTotals.count)}</td>
                <td class="num">${formatMetric(consoTotals.litres)}</td>
                <td class="num">${formatAmount(consoTotals.montant)}</td>
              </tr>
            </tfoot>
          `;
      tableHtml = `
        <table>
          <thead>
            <tr>
              <th>Matricule</th>
              <th>Vehicule</th>
              <th class="num">Nb ravit.</th>
              <th class="num">Total litres</th>
              <th class="num">Total montant</th>
            </tr>
          </thead>
          <tbody>${bodyHtml}</tbody>
          ${footHtml}
        </table>
      `;
    }

    printWindow.document.write(`
      <!doctype html>
      <html lang="fr">
        <head>
          <meta charset="utf-8" />
          <title>Consommation par vehicule</title>
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
            .date-line {
              margin: 0 0 16px;
              color: #4b5563;
              font-size: 13px;
            }
            .summary {
              margin-bottom: 20px;
              padding: 12px 16px;
              background: #ecfdf5;
              border: 1px solid #a7f3d0;
              border-radius: 12px;
              font-size: 13px;
              line-height: 1.7;
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
            th.month-group {
              text-align: center;
            }
            td.num, th.num {
              text-align: right;
            }
            .group-start {
              border-left: 2px solid #166534;
            }
            .empty {
              text-align: center;
              color: #6b7280;
              font-style: italic;
              padding: 24px 8px;
            }
            tbody tr:nth-child(even) {
              background: #f9fafb;
            }
            tfoot td {
              background: #fffbeb;
              font-weight: 700;
            }
            @media print {
              @page {
                margin: 0;
                size: A4 landscape;
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
          <h1>Consommation par vehicule</h1>
          <p class="date-line">Edite le ${escapeHtml(new Date().toLocaleDateString("fr-FR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }))}</p>
          <div class="summary">
            <strong>Vehicule :</strong> ${escapeHtml(vehiculeFilterLabel)}
            <br />
            <strong>Zone :</strong> ${escapeHtml(zoneFilterLabel)}
            <br />
            <strong>Periode :</strong> ${escapeHtml(periodeFilterLabel)}
          </div>
          ${tableHtml}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  function handleRowClick(monthIndex: number) {
    if (selectedMonthIndex === monthIndex) {
      setSelectedMonthIndex(null);
    } else {
      setSelectedMonthIndex(monthIndex);
      setFilterZone("");
      setFilterCentre("");
      setFilterMatricule("");
    }
  }

  function closeDetail() {
    setSelectedMonthIndex(null);
    setFilterZone("");
    setFilterCentre("");
    setFilterMatricule("");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-teal-50 to-orange-50 p-3 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-6 sm:space-y-8">
        {/* Header + KPI cards */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-4 sm:p-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-r from-green-500 to-teal-600 rounded-xl shadow-lg flex-shrink-0">
                <span className="text-2xl">D</span>
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Dashboard</h1>
                <p className="text-gray-600 mt-1">
                  Synthese mensuelle des ravitaillements, des montants, des litres et du kilometrage.
                </p>
              </div>
            </div>

            <div className="w-full sm:w-56">
              <label htmlFor="dashboard-year" className="block text-sm font-medium text-gray-700 mb-2">
                Annee
              </label>
              <select
                id="dashboard-year"
                value={effectiveYear}
                onChange={(event) => setSelectedYear(Number(event.target.value))}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200 bg-white"
              >
                {availableYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-8">
            <div className="bg-green-50 border border-green-200 rounded-2xl p-5">
              <p className="text-sm text-green-700 font-medium">Nb ravitaillements</p>
              <p className="text-3xl font-bold text-green-900 mt-2">{formatCount(totals.nbRavitaillements)}</p>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5">
              <p className="text-sm text-orange-700 font-medium">Montant ravitaille</p>
              <p className="text-3xl font-bold text-orange-900 mt-2">{formatAmount(totals.montantRavitaille)}</p>
            </div>
            <div className="bg-teal-50 border border-teal-200 rounded-2xl p-5">
              <p className="text-sm text-teal-700 font-medium">Litres</p>
              <p className="text-3xl font-bold text-teal-900 mt-2">{formatMetric(totals.litres)}</p>
            </div>
          </div>
        </div>

        {/* Monthly table */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-200 bg-gradient-to-r from-green-600 to-teal-700">
            <h2 className="text-xl font-bold text-white">Synthese annuelle par mois</h2>
            <p className="text-green-100 text-sm mt-1">Cliquez sur un mois pour voir le detail des vehicules.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-green-600 to-teal-700">
                <tr>
                  <th className="px-4 py-4 text-left text-sm font-semibold text-white">Mois</th>
                  <th className="px-4 py-4 text-left text-sm font-semibold text-white">Nb ravitaillements</th>
                  <th className="px-4 py-4 text-left text-sm font-semibold text-white">Montant ravitaille</th>
                  <th className="px-4 py-4 text-left text-sm font-semibold text-white">Litres</th>
                  <th className="px-4 py-4 text-left text-sm font-semibold text-white">Kilometrage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-600">
                      Chargement de la synthese...
                    </td>
                  </tr>
                ) : (
                  monthlyRows.map((row, idx) => {
                    const isSelected = selectedMonthIndex === idx;
                    return (
                      <tr
                        key={row.month}
                        onClick={() => handleRowClick(idx)}
                        className={`cursor-pointer transition-colors duration-150 ${
                          isSelected
                            ? "bg-teal-100 border-l-4 border-l-teal-500"
                            : "hover:bg-green-50/50"
                        }`}
                      >
                        <td className="px-4 py-3 font-medium text-gray-900">
                          <span className="flex items-center gap-2">
                            {row.month}
                            {isSelected && (
                              <span className="text-teal-600 text-xs font-semibold">(detail ouvert)</span>
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-700">{formatCount(row.nbRavitaillements)}</td>
                        <td className="px-4 py-3 text-gray-700">{formatAmount(row.montantRavitaille)}</td>
                        <td className="px-4 py-3 text-gray-700">{formatMetric(row.litres)}</td>
                        <td className="px-4 py-3 text-gray-700">{formatMetric(row.kilometrage)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              <tfoot className="bg-amber-50 border-t-2 border-amber-200">
                <tr>
                  <td className="px-4 py-4 text-lg font-bold text-gray-900">Total</td>
                  <td className="px-4 py-4 text-lg font-bold text-blue-700">{formatCount(totals.nbRavitaillements)}</td>
                  <td className="px-4 py-4 text-lg font-bold text-blue-700">{formatAmount(totals.montantRavitaille)}</td>
                  <td className="px-4 py-4 text-lg font-bold text-blue-700">{formatMetric(totals.litres)}</td>
                  <td className="px-4 py-4 text-lg font-bold text-blue-700">{formatMetric(totals.kilometrage)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Month detail panel */}
        {selectedMonthIndex !== null && (
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
            {/* Panel header */}
            <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-gray-200 bg-gradient-to-r from-teal-600 to-green-700 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-white">
                  Detail — {monthLabels[selectedMonthIndex]} {effectiveYear}
                </h2>
                <p className="text-teal-100 text-sm mt-0.5">
                  {monthlyRows[selectedMonthIndex].nbRavitaillements} ravitaillement(s) ce mois
                </p>
              </div>
              <button
                onClick={closeDetail}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-white/20 hover:bg-white/30 transition-colors text-white"
                aria-label="Fermer le detail"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Filters */}
            <div className="px-4 sm:px-6 py-4 border-b border-gray-100 bg-gray-50">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Zone</label>
                  <select
                    value={filterZone}
                    onChange={(e) => setFilterZone(e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 min-h-[40px] focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent bg-white"
                  >
                    <option value="">Toutes les zones</option>
                    {availableZones.map((z) => (
                      <option key={z} value={z}>{z}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Centre</label>
                  <select
                    value={filterCentre}
                    onChange={(e) => setFilterCentre(e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 min-h-[40px] focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent bg-white"
                  >
                    <option value="">Tous les centres</option>
                    {availableCentres.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Matricule</label>
                  <input
                    type="text"
                    value={filterMatricule}
                    onChange={(e) => setFilterMatricule(e.target.value)}
                    placeholder="Rechercher..."
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 min-h-[40px] focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent placeholder-gray-400"
                  />
                </div>
              </div>
              {hasFilters && (
                <button
                  onClick={() => { setFilterZone(""); setFilterCentre(""); setFilterMatricule(""); }}
                  className="mt-3 text-xs font-medium text-teal-600 hover:text-teal-800 transition-colors"
                >
                  Effacer les filtres
                </button>
              )}
            </div>

            {/* Summary KPI strip when no filters */}
            {!hasFilters && (
              <div className="grid grid-cols-2 gap-3 px-4 sm:px-6 py-4 bg-teal-50/50 border-b border-gray-100">
                <div>
                  <p className="text-xs text-teal-700 font-medium">Nb ravitaillements</p>
                  <p className="text-xl font-bold text-teal-900 mt-0.5">{formatCount(monthlyRows[selectedMonthIndex].nbRavitaillements)}</p>
                </div>
                <div>
                  <p className="text-xs text-orange-700 font-medium">Montant (MRU)</p>
                  <p className="text-xl font-bold text-orange-900 mt-0.5">{formatAmount(monthlyRows[selectedMonthIndex].montantRavitaille)}</p>
                </div>
              </div>
            )}

            {/* Vehicle breakdown */}
            {vehiculeRows.length === 0 ? (
              <p className="text-center text-gray-400 py-12 text-sm">
                {hasFilters ? "Aucun vehicule ne correspond aux filtres." : "Aucun ravitaillement ce mois."}
              </p>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Matricule</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Vehicule</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Zone</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Centre</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Nb ravit.</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Montant</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {vehiculeRows.map((row) => (
                        <tr key={row.vehiculeId} className="hover:bg-teal-50/40 transition-colors">
                          <td className="px-4 py-3 font-medium text-gray-900 text-sm">{row.matricule}</td>
                          <td className="px-4 py-3 text-gray-700 text-sm">{row.nom}</td>
                          <td className="px-4 py-3 text-gray-500 text-sm">{row.zone}</td>
                          <td className="px-4 py-3 text-gray-500 text-sm">{row.centre}</td>
                          <td className="px-4 py-3 text-right text-gray-700 text-sm">{formatCount(row.count)}</td>
                          <td className="px-4 py-3 text-right text-gray-700 text-sm">{formatAmount(row.montant)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-amber-50 border-t-2 border-amber-200">
                      <tr>
                        <td colSpan={4} className="px-4 py-3 font-bold text-gray-900 text-sm">Total ({vehiculeRows.length} vehicule{vehiculeRows.length > 1 ? "s" : ""})</td>
                        <td className="px-4 py-3 text-right font-bold text-blue-700 text-sm">{formatCount(detailTotals.count)}</td>
                        <td className="px-4 py-3 text-right font-bold text-blue-700 text-sm">{formatAmount(detailTotals.montant)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="sm:hidden divide-y divide-gray-100">
                  {vehiculeRows.map((row) => (
                    <div key={row.vehiculeId} className="px-4 py-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-gray-900">{row.matricule}</p>
                        <span className="text-xs bg-teal-100 text-teal-700 font-medium px-2 py-0.5 rounded-full">
                          {formatCount(row.count)} ravit.
                        </span>
                      </div>
                      <p className="text-sm text-gray-600">{row.nom}</p>
                      <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                        <span className="bg-gray-100 px-2 py-0.5 rounded">{row.zone}</span>
                        <span className="bg-gray-100 px-2 py-0.5 rounded">{row.centre}</span>
                      </div>
                      <div className="pt-1">
                        <div className="bg-orange-50 rounded-lg p-2 text-center">
                          <p className="text-xs text-orange-600 font-medium">Montant (MRU)</p>
                          <p className="text-sm font-bold text-orange-800">{formatAmount(row.montant)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {/* Mobile total */}
                  <div className="px-4 py-4 bg-amber-50 border-t-2 border-amber-200">
                    <p className="font-bold text-gray-900 text-sm mb-2">
                      Total — {vehiculeRows.length} vehicule{vehiculeRows.length > 1 ? "s" : ""}, {formatCount(detailTotals.count)} ravitaillement{detailTotals.count > 1 ? "s" : ""}
                    </p>
                    <div className="bg-orange-50 rounded-lg p-2 text-center border border-orange-200">
                      <p className="text-xs text-orange-600 font-medium">Montant (MRU)</p>
                      <p className="text-sm font-bold text-orange-800">{formatAmount(detailTotals.montant)}</p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Consommation par vehicule */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
          <div className="px-4 sm:px-6 py-5 border-b border-gray-200 bg-gradient-to-r from-green-600 to-teal-700 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-white">Consommation par vehicule</h2>
              <p className="text-green-100 text-sm mt-1">
                {consoMonths.length === 0
                  ? "Cumul de tous les ravitaillements enregistres."
                  : consoMonths.length === 1
                    ? `Ravitaillements de ${labelOfMonth(consoMonths[0])}.`
                    : `Comparaison de ${consoMonths.length} mois cote a cote.`}
              </p>
              {consoMonths.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {selectedMonthsSorted.map((key) => (
                    <span
                      key={key}
                      className="inline-flex items-center gap-1 bg-white/20 text-white text-xs font-medium pl-2.5 pr-1 py-1 rounded-full"
                    >
                      {labelOfMonth(key)}
                      <button
                        type="button"
                        onClick={() => toggleConsoMonth(key)}
                        className="hover:bg-white/30 rounded-full p-0.5"
                        aria-label={`Retirer ${labelOfMonth(key)}`}
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={() => setConsoMonths([])}
                    className="text-white/80 hover:text-white text-xs underline"
                  >
                    Tout effacer
                  </button>
                </div>
              )}
            </div>
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-start gap-3 w-full lg:w-auto lg:justify-end">
              <div className="w-full sm:w-72">
                <label htmlFor="conso-vehicule" className="sr-only">Vehicule</label>
                <SearchableVehiculeSelect
                  vehicules={consoVehiculeList}
                  value={consoVehicule}
                  onChange={setConsoVehicule}
                />
                {consoVehicule === "" && (
                  <p className="text-green-100 text-xs mt-1">Tous les vehicules</p>
                )}
              </div>
              <div className="w-full sm:w-52">
                <label htmlFor="conso-zone" className="sr-only">Zone</label>
                <select
                  id="conso-zone"
                  value={consoZone}
                  onChange={(event) => setConsoZone(event.target.value)}
                  className="w-full px-4 py-2.5 border border-white/40 rounded-xl bg-white/95 text-gray-800 text-sm focus:ring-2 focus:ring-white outline-none transition-all"
                >
                  <option value="">Toutes les zones</option>
                  {consoZoneOptions.map((zone) => (
                    <option key={zone} value={zone}>{zone}</option>
                  ))}
                </select>
                <p className="text-green-100 text-xs mt-1">
                  {consoZone === "" ? "Toutes les zones" : `Zone : ${consoZone}`}
                </p>
              </div>
              <div className="w-full sm:w-64" ref={monthDropdownRef}>
                <span className="sr-only">Mois (selection multiple)</span>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setMonthDropdownOpen((open) => !open)}
                    aria-haspopup="listbox"
                    aria-expanded={monthDropdownOpen}
                    className="w-full flex items-center justify-between gap-2 px-4 py-2.5 border border-white/40 rounded-xl bg-white/95 text-gray-800 focus:ring-2 focus:ring-white outline-none transition-all text-left"
                  >
                    <span className="truncate text-sm">
                      {consoMonths.length === 0
                        ? "Tous les mois (cumul)"
                        : consoMonths.length === 1
                          ? labelOfMonth(consoMonths[0])
                          : `${consoMonths.length} mois selectionnes`}
                    </span>
                    <svg
                      className={`w-4 h-4 flex-shrink-0 text-gray-500 transition-transform ${monthDropdownOpen ? "rotate-180" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {monthDropdownOpen && (
                    <div className="absolute right-0 z-20 mt-2 w-full max-h-72 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl py-1">
                      <button
                        type="button"
                        onClick={() => setConsoMonths([])}
                        className={`w-full text-left px-4 py-2 text-sm border-b border-gray-100 hover:bg-green-50 ${
                          consoMonths.length === 0 ? "text-green-700 font-semibold" : "text-gray-600"
                        }`}
                      >
                        Tous les mois (cumul)
                      </button>
                      {consoMonthOptions.length === 0 ? (
                        <p className="px-4 py-3 text-sm text-gray-400">Aucun mois disponible.</p>
                      ) : (
                        consoMonthOptions.map((m) => (
                          <label
                            key={m.key}
                            className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-green-50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={consoMonths.includes(m.key)}
                              onChange={() => toggleConsoMonth(m.key)}
                              className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                            />
                            <span>{m.label}</span>
                          </label>
                        ))
                      )}
                    </div>
                  )}
                </div>
                <p className="text-green-100 text-xs mt-1">
                  {consoMonths.length >= 2
                    ? "Mode comparaison"
                    : "Selectionnez un ou plusieurs mois"}
                </p>
              </div>
              <button
                type="button"
                onClick={handleDownloadConsoPdf}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/95 text-green-700 font-medium text-sm hover:bg-white transition-colors shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                </svg>
                Telecharger PDF
              </button>
            </div>
          </div>

          {/* Tableau par vehicule */}
          <div className="overflow-x-auto">
            {isComparison && comparison ? (
              /* Mode comparaison : un groupe de colonnes par mois */
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th
                      rowSpan={2}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide align-bottom"
                    >
                      Matricule
                    </th>
                    <th
                      rowSpan={2}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide align-bottom"
                    >
                      Vehicule
                    </th>
                    {selectedMonthsSorted.map((key) => (
                      <th
                        key={key}
                        colSpan={3}
                        className="px-4 py-2 text-center text-xs font-bold text-green-800 uppercase tracking-wide bg-green-50 border-l-2 border-green-200"
                      >
                        {labelOfMonth(key)}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {selectedMonthsSorted.map((key) => (
                      <Fragment key={key}>
                        <th className="px-3 py-2 text-right text-[11px] font-semibold text-gray-500 uppercase bg-green-50/60 border-l-2 border-green-200">Nb</th>
                        <th className="px-3 py-2 text-right text-[11px] font-semibold text-gray-500 uppercase bg-green-50/60">Litres</th>
                        <th className="px-3 py-2 text-right text-[11px] font-semibold text-gray-500 uppercase bg-green-50/60">Montant</th>
                      </Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    <tr>
                      <td colSpan={2 + selectedMonthsSorted.length * 3} className="px-6 py-12 text-center text-gray-500">Chargement...</td>
                    </tr>
                  ) : comparison.rows.length === 0 ? (
                    <tr>
                      <td colSpan={2 + selectedMonthsSorted.length * 3} className="px-6 py-12 text-center text-gray-400">Aucun ravitaillement pour les mois selectionnes.</td>
                    </tr>
                  ) : (
                    comparison.rows.map((row) => (
                      <tr key={row.vehiculeId} className="hover:bg-green-50/50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-900 text-sm">{row.matricule}</td>
                        <td className="px-4 py-3 text-gray-700 text-sm">{row.nom}</td>
                        {selectedMonthsSorted.map((key) => {
                          const cell = row.byMonth[key];
                          return (
                            <Fragment key={key}>
                              <td className="px-3 py-3 text-right text-gray-700 text-sm border-l-2 border-green-100">
                                {cell ? formatCount(cell.count) : "—"}
                              </td>
                              <td className="px-3 py-3 text-right text-gray-700 text-sm">
                                {cell ? formatMetric(cell.litres) : "—"}
                              </td>
                              <td className="px-3 py-3 text-right text-gray-700 text-sm">
                                {cell ? formatAmount(cell.montant) : "—"}
                              </td>
                            </Fragment>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
                {comparison.rows.length > 0 && (
                  <tfoot className="bg-amber-50 border-t-2 border-amber-200">
                    <tr>
                      <td colSpan={2} className="px-4 py-3 font-bold text-gray-900 text-sm">
                        Total ({comparison.rows.length} vehicule{comparison.rows.length > 1 ? "s" : ""})
                      </td>
                      {selectedMonthsSorted.map((key) => {
                        const t = comparison.totalsByMonth[key];
                        return (
                          <Fragment key={key}>
                            <td className="px-3 py-3 text-right font-bold text-blue-700 text-sm border-l-2 border-amber-200">{formatCount(t.count)}</td>
                            <td className="px-3 py-3 text-right font-bold text-blue-700 text-sm">{formatMetric(t.litres)}</td>
                            <td className="px-3 py-3 text-right font-bold text-blue-700 text-sm">{formatAmount(t.montant)}</td>
                          </Fragment>
                        );
                      })}
                    </tr>
                  </tfoot>
                )}
              </table>
            ) : (
              /* Mode simple : cumul total (0 mois) ou un seul mois */
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Matricule</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Vehicule</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Nb ravit.</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Total litres</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Total montant</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-gray-500">Chargement...</td>
                    </tr>
                  ) : consoRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-gray-400">Aucun ravitaillement enregistre.</td>
                    </tr>
                  ) : (
                    consoRows.map((row) => (
                      <tr key={row.vehiculeId} className="hover:bg-green-50/50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-900 text-sm">{row.matricule}</td>
                        <td className="px-4 py-3 text-gray-700 text-sm">{row.nom}</td>
                        <td className="px-4 py-3 text-right text-gray-700 text-sm">{formatCount(row.count)}</td>
                        <td className="px-4 py-3 text-right text-gray-700 text-sm">{formatMetric(row.litres)}</td>
                        <td className="px-4 py-3 text-right text-gray-700 text-sm">{formatAmount(row.montant)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {consoRows.length > 0 && (
                  <tfoot className="bg-amber-50 border-t-2 border-amber-200">
                    <tr>
                      <td colSpan={2} className="px-4 py-3 font-bold text-gray-900 text-sm">
                        Total ({consoRows.length} vehicule{consoRows.length > 1 ? "s" : ""})
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-blue-700 text-sm">{formatCount(consoTotals.count)}</td>
                      <td className="px-4 py-3 text-right font-bold text-blue-700 text-sm">{formatMetric(consoTotals.litres)}</td>
                      <td className="px-4 py-3 text-right font-bold text-blue-700 text-sm">{formatAmount(consoTotals.montant)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
