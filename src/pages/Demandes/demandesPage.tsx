import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuthContext } from "@/context/AuthProvider";
import { useDemandes } from "@/hooks/useDemandes";
import type { StatutDemande } from "@/types";

const STATUT_CONFIG: Record<StatutDemande, { label: string; classes: string }> = {
  en_attente:      { label: "En attente",        classes: "bg-orange-100 text-orange-800 border-orange-200" },
  validee_dept:    { label: "Validée (Dept.)",    classes: "bg-blue-100 text-blue-800 border-blue-200" },
  validee_station: { label: "Validée (Station)",  classes: "bg-purple-100 text-purple-800 border-purple-200" },
  validee_cellule: { label: "Validée (Cellule)",  classes: "bg-green-100 text-green-800 border-green-200" },
  annulee:         { label: "Annulée",            classes: "bg-red-100 text-red-800 border-red-200" },
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

  const isChefDeCours = user?.role === "chef_de_cours";

  const total       = demandes.length;
  const enAttente   = demandes.filter((d) => d.statut === "en_attente").length;
  const validees    = demandes.filter((d) => d.statut === "validee_cellule").length;

  return (
    <div className="max-w-7xl mx-auto space-y-6 py-6">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow border border-gray-200 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Demandes de ravitaillement</h1>
            <p className="text-gray-500 text-sm mt-1">Suivi des demandes selon votre rôle.</p>
          </div>
          {isChefDeCours && (
            <Link
              to="/demandes/nouvelle"
              className="inline-flex items-center gap-2 bg-gradient-to-r from-green-500 to-teal-600 text-white px-5 py-2.5 rounded-xl hover:from-green-600 hover:to-teal-700 transition-all shadow font-medium text-sm whitespace-nowrap"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Nouvelle demande
            </Link>
          )}
        </div>

        <div className="grid grid-cols-3 gap-4 mt-6">
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Total</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{total}</p>
          </div>
          <div className="bg-orange-50 rounded-xl p-4 border border-orange-200">
            <p className="text-xs text-orange-600 font-medium uppercase tracking-wider">En attente</p>
            <p className="text-2xl font-bold text-orange-900 mt-1">{enAttente}</p>
          </div>
          <div className="bg-green-50 rounded-xl p-4 border border-green-200">
            <p className="text-xs text-green-600 font-medium uppercase tracking-wider">Validées</p>
            <p className="text-2xl font-bold text-green-900 mt-1">{validees}</p>
          </div>
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
            {isChefDeCours && (
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
