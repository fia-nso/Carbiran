import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuthContext } from "@/context/AuthProvider";
import { useDemandes } from "@/hooks/useDemandes";
import type { StatutDemande } from "@/types";

const STATUT_CONFIG: Record<StatutDemande, { label: string; classes: string }> = {
  en_attente:      { label: "En attente d'approbation",    classes: "bg-orange-100 text-orange-800 border-orange-200" },
  validee_dept:    { label: "Approuvée",                   classes: "bg-blue-100 text-blue-800 border-blue-200" },
  validee_station: { label: "Ravitaillement effectué",     classes: "bg-purple-100 text-purple-800 border-purple-200" },
  validee_cellule: { label: "Validée",                     classes: "bg-green-100 text-green-800 border-green-200" },
  annulee:         { label: "Annulée",                     classes: "bg-red-100 text-red-800 border-red-200" },
};

function StatutBadge({ statut }: { statut: StatutDemande }) {
  const cfg = STATUT_CONFIG[statut];
  return (
    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium border ${cfg.classes}`}>
      {cfg.label}
    </span>
  );
}

export default function DemandesPage() {
  const { user } = useAuthContext();
  const { demandes, loading, error, fetchDemandes } = useDemandes();

  useEffect(() => { void fetchDemandes(); }, [fetchDemandes]);

  const canCreateDemande = user?.role === "chef_de_cours" || user?.role === "chef_departement";

  const total = demandes.length;

  const STATUT_ORDER: StatutDemande[] = [
    "en_attente",
    "validee_dept",
    "validee_station",
    "validee_cellule",
    "annulee",
  ];

  const statutCounts = STATUT_ORDER.reduce<Partial<Record<StatutDemande, number>>>(
    (acc, s) => {
      const n = demandes.filter((d) => d.statut === s).length;
      if (n > 0) acc[s] = n;
      return acc;
    },
    {}
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6 py-4 sm:py-6 px-4 sm:px-6 lg:px-0">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow border border-gray-200 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Demandes de ravitaillement</h1>
            <p className="text-gray-500 text-sm mt-1">Suivi des demandes selon votre rôle.</p>
          </div>
          {canCreateDemande && (
            <Link
              to="/demandes/nouvelle"
              className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-green-500 to-teal-600 text-white px-5 py-3 min-h-[44px] rounded-xl hover:from-green-600 hover:to-teal-700 transition-all shadow font-medium text-sm w-full sm:w-auto"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Nouvelle demande
            </Link>
          )}
        </div>

        <div className="flex flex-wrap gap-3 mt-6">
          <div className="flex-1 min-w-[120px] bg-gray-50 rounded-xl p-4 border border-gray-200">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Total</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{total}</p>
          </div>
          {STATUT_ORDER.map((statut) => {
            const n = statutCounts[statut];
            if (!n) return null;
            const cfg = STATUT_CONFIG[statut];
            return (
              <div key={statut} className={`flex-1 min-w-[140px] rounded-xl p-4 border ${cfg.classes}`}>
                <p className="text-xs font-medium uppercase tracking-wider opacity-80">{cfg.label}</p>
                <p className="text-2xl font-bold mt-1">{n}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl shadow border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-3">
            <div className="animate-spin w-7 h-7 border-4 border-gray-200 border-t-green-500 rounded-full" />
            <span className="text-gray-500">Chargement...</span>
          </div>
        ) : error ? (
          <p className="py-12 text-center text-red-600 px-6">{error}</p>
        ) : demandes.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-gray-400">Aucune demande disponible.</p>
            {canCreateDemande && (
              <Link to="/demandes/nouvelle" className="mt-4 inline-block text-sm text-teal-600 hover:underline font-medium">
                Créer la première demande →
              </Link>
            )}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-green-50 to-teal-50 border-b border-gray-200">
                  <tr>
                    {["Département", "Date", "Statut", "Véhicules", ""].map((h) => (
                      <th key={h} className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider last:text-right">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {demandes.map((d) => (
                    <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-gray-900">{d.departement}</td>
                      <td className="px-6 py-4 text-gray-600 text-sm">
                        {new Date(d.created_at).toLocaleDateString("fr-FR")}
                      </td>
                      <td className="px-6 py-4">
                        <StatutBadge statut={d.statut} />
                      </td>
                      <td className="px-6 py-4 text-gray-600 text-sm">
                        {d.demande_vehicules?.length ?? 0} véhicule(s)
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link
                          to={`/demandes/${d.id}`}
                          className="text-sm font-medium text-teal-700 hover:text-teal-900"
                        >
                          Voir →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-gray-100">
              {demandes.map((d) => (
                <Link
                  key={d.id}
                  to={`/demandes/${d.id}`}
                  className="flex items-start justify-between gap-3 p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">{d.departement}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {new Date(d.created_at).toLocaleDateString("fr-FR")}
                      {" · "}
                      {d.demande_vehicules?.length ?? 0} véhicule(s)
                    </p>
                  </div>
                  <StatutBadge statut={d.statut} />
                </Link>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="w-full h-1 bg-gradient-to-r from-amber-400 via-orange-500 to-green-600 rounded-full opacity-80" />
    </div>
  );
}
