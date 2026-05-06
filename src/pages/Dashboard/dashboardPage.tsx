import { useMemo, useState } from "react";
import { useRavitaillementsVehicule } from "@/hooks/useRavitaillementVehicule";

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
  if (!value) {
    return null;
  }

  const normalized = value.slice(0, 10);
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return null;
  }

  return Number(match[1]);
}

function extractMonthIndex(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.slice(0, 10);
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return null;
  }

  return Number(match[2]) - 1;
}

function formatCount(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatLitres(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export default function DashboardPage() {
  const { ravitaillements, loading } = useRavitaillementsVehicule();

  const availableYears = useMemo(() => {
    const years = new Set<number>();

    for (const item of ravitaillements) {
      const situationYear = extractYear(item.dateSituation);
      const ravitaillementYear = extractYear(item.dateRavitaillement);

      if (situationYear) {
        years.add(situationYear);
      }

      if (ravitaillementYear) {
        years.add(ravitaillementYear);
      }
    }

    if (years.size === 0) {
      years.add(new Date().getFullYear());
    }

    return Array.from(years).sort((a, b) => b - a);
  }, [ravitaillements]);

  const [selectedYear, setSelectedYear] = useState<number>(() => new Date().getFullYear());

  const effectiveYear = availableYears.includes(selectedYear)
    ? selectedYear
    : availableYears[0];

  const monthlyRows = useMemo(() => {
    const rows = monthLabels.map((label) => ({
      month: label,
      nbPrevu: 0,
      nbRealise: 0,
      montantPrevu: 0,
      montantRavitaille: 0,
      reliquat: 0,
      litres: 0,
    }));

    for (const item of ravitaillements) {
      const situationYear = extractYear(item.dateSituation);
      const situationMonth = extractMonthIndex(item.dateSituation);
      const ravitaillementYear = extractYear(item.dateRavitaillement);
      const ravitaillementMonth = extractMonthIndex(item.dateRavitaillement);

      if (situationYear === effectiveYear && situationMonth !== null) {
        rows[situationMonth].nbPrevu += 1;
        rows[situationMonth].montantPrevu += item.montantPrevu;
      }

      if (ravitaillementYear === effectiveYear && ravitaillementMonth !== null) {
        rows[ravitaillementMonth].nbRealise += 1;
        rows[ravitaillementMonth].montantRavitaille += item.montantRavitaille;
        rows[ravitaillementMonth].litres += item.nLiter;
      }
    }

    return rows.map((row) => ({
      ...row,
      reliquat: row.montantPrevu - row.montantRavitaille,
    }));
  }, [effectiveYear, ravitaillements]);

  const totals = monthlyRows.reduce(
    (acc, row) => ({
      nbPrevu: acc.nbPrevu + row.nbPrevu,
      nbRealise: acc.nbRealise + row.nbRealise,
      montantPrevu: acc.montantPrevu + row.montantPrevu,
      montantRavitaille: acc.montantRavitaille + row.montantRavitaille,
      reliquat: acc.reliquat + row.reliquat,
      litres: acc.litres + row.litres,
    }),
    {
      nbPrevu: 0,
      nbRealise: 0,
      montantPrevu: 0,
      montantRavitaille: 0,
      reliquat: 0,
      litres: 0,
    }
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-teal-50 to-orange-50 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-r from-green-500 to-teal-600 rounded-xl shadow-lg">
                <span className="text-2xl">D</span>
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
                <p className="text-gray-600 mt-1">
                  Synthese annuelle par mois des ravitaillements.
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

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mt-8">
            <div className="bg-green-50 border border-green-200 rounded-2xl p-5">
              <p className="text-sm text-green-700 font-medium">Nb prevu</p>
              <p className="text-3xl font-bold text-green-900 mt-2">{formatCount(totals.nbPrevu)}</p>
            </div>
            <div className="bg-teal-50 border border-teal-200 rounded-2xl p-5">
              <p className="text-sm text-teal-700 font-medium">Nb realise</p>
              <p className="text-3xl font-bold text-teal-900 mt-2">{formatCount(totals.nbRealise)}</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
              <p className="text-sm text-amber-700 font-medium">Montant prevu</p>
              <p className="text-3xl font-bold text-amber-900 mt-2">{formatAmount(totals.montantPrevu)}</p>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5">
              <p className="text-sm text-orange-700 font-medium">Montant ravitaille</p>
              <p className="text-3xl font-bold text-orange-900 mt-2">{formatAmount(totals.montantRavitaille)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-200 bg-gradient-to-r from-green-600 to-teal-700">
            <h2 className="text-xl font-bold text-white">Synthese annuelle par mois</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-green-600 to-teal-700">
                <tr>
                  <th className="px-4 py-4 text-left text-sm font-semibold text-white">Mois</th>
                  <th className="px-4 py-4 text-left text-sm font-semibold text-white">Nb prevu</th>
                  <th className="px-4 py-4 text-left text-sm font-semibold text-white">Nb realise</th>
                  <th className="px-4 py-4 text-left text-sm font-semibold text-white">Montant prevu</th>
                  <th className="px-4 py-4 text-left text-sm font-semibold text-white">Montant ravitaille</th>
                  <th className="px-4 py-4 text-left text-sm font-semibold text-white">Reliquat</th>
                  <th className="px-4 py-4 text-left text-sm font-semibold text-white">Litres</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-600">
                      Chargement de la synthese...
                    </td>
                  </tr>
                ) : (
                  monthlyRows.map((row) => (
                    <tr key={row.month} className="hover:bg-blue-50/40 transition-colors duration-150">
                      <td className="px-4 py-3 font-medium text-gray-900">{row.month}</td>
                      <td className="px-4 py-3 text-gray-700">{formatCount(row.nbPrevu)}</td>
                      <td className="px-4 py-3 text-gray-700">{formatCount(row.nbRealise)}</td>
                      <td className="px-4 py-3 text-gray-700">{formatAmount(row.montantPrevu)}</td>
                      <td className="px-4 py-3 text-gray-700">{formatAmount(row.montantRavitaille)}</td>
                      <td className="px-4 py-3 text-gray-700">{formatAmount(row.reliquat)}</td>
                      <td className="px-4 py-3 text-gray-700">{formatLitres(row.litres)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot className="bg-amber-50 border-t-2 border-amber-200">
                <tr>
                  <td className="px-4 py-4 text-lg font-bold text-gray-900">Total</td>
                  <td className="px-4 py-4 text-lg font-bold text-blue-700">{formatCount(totals.nbPrevu)}</td>
                  <td className="px-4 py-4 text-lg font-bold text-blue-700">{formatCount(totals.nbRealise)}</td>
                  <td className="px-4 py-4 text-lg font-bold text-blue-700">{formatAmount(totals.montantPrevu)}</td>
                  <td className="px-4 py-4 text-lg font-bold text-blue-700">{formatAmount(totals.montantRavitaille)}</td>
                  <td className="px-4 py-4 text-lg font-bold text-blue-700">{formatAmount(totals.reliquat)}</td>
                  <td className="px-4 py-4 text-lg font-bold text-blue-700">{formatLitres(totals.litres)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
