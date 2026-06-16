import { useMemo, useState } from "react";
import { useRavitaillementsVehicule } from "@/hooks/useRavitaillementVehicule";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";

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

function formatCount(value: number) {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}

function formatMetric(value: number) {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);
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
      </div>
    </div>
  );
}
