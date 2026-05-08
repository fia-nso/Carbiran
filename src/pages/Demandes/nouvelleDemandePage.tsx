import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthContext } from "@/context/AuthProvider";
import { useDemandes } from "@/hooks/useDemandes";
import { useVehicules } from "@/hooks/useVehicule";

const DEPARTEMENTS = ["Zone A", "Zone B", "RS", "FO", "CDPE"] as const;
type Departement = typeof DEPARTEMENTS[number];

export default function NouvelleDemandePage() {
  const { user } = useAuthContext();
  const navigate = useNavigate();
  const { createDemande } = useDemandes();
  const { allVehicules, loading: vLoading } = useVehicules();

  const [departement, setDepartement] = useState<Departement>("Zone A");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [matriculeSearch, setMatriculeSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user && user.role !== "chef_de_cours") {
      navigate("/demandes", { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    setSelected(new Set());
    setMatriculeSearch("");
  }, [departement]);

  const vehiculesDept = useMemo(
    () => allVehicules.filter((v) => v.zone === departement),
    [allVehicules, departement]
  );

  const vehiculesFiltres = useMemo(
    () =>
      matriculeSearch === ""
        ? vehiculesDept
        : vehiculesDept.filter((v) =>
            v.matricule.toLowerCase().includes(matriculeSearch.toLowerCase())
          ),
    [vehiculesDept, matriculeSearch]
  );

  const allSelected =
    vehiculesFiltres.length > 0 &&
    vehiculesFiltres.every((v) => selected.has(v.id));

  function toggleVehicule(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        vehiculesFiltres.forEach((v) => next.delete(v.id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        vehiculesFiltres.forEach((v) => next.add(v.id));
        return next;
      });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selected.size === 0) {
      setError("Sélectionnez au moins un véhicule.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await createDemande(departement, [...selected]);
      navigate("/demandes");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur lors de la création.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          to="/demandes"
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
          aria-label="Retour"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nouvelle demande</h1>
          <p className="text-sm text-gray-500">Sélectionnez un département et les véhicules concernés.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Département selector */}
        <div className="bg-white rounded-2xl shadow border border-gray-200 p-6">
          <p className="text-sm font-semibold text-gray-700 mb-4">Département</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {DEPARTEMENTS.map((dept) => (
              <button
                key={dept}
                type="button"
                onClick={() => setDepartement(dept)}
                className={`px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                  departement === dept
                    ? "border-teal-500 bg-teal-50 text-teal-800"
                    : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                {dept}
              </button>
            ))}
          </div>
        </div>

        {/* Véhicules */}
        <div className="bg-white rounded-2xl shadow border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <div>
              <p className="text-sm font-semibold text-gray-700">Véhicules — {departement}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {selected.size} sélectionné(s)
              </p>
            </div>
            {vehiculesDept.length > 0 && (
              <button
                type="button"
                onClick={toggleAll}
                className="text-xs font-medium text-teal-600 hover:text-teal-800 transition-colors"
              >
                {allSelected ? "Tout désélectionner" : "Tout sélectionner"}
              </button>
            )}
          </div>

          {!vLoading && vehiculesDept.length > 0 && (
            <div className="px-6 py-3 border-b border-gray-100">
              <input
                type="text"
                value={matriculeSearch}
                onChange={(e) => setMatriculeSearch(e.target.value)}
                placeholder="Rechercher par matricule..."
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent placeholder-gray-400"
              />
            </div>
          )}

          {vLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin w-6 h-6 border-4 border-gray-200 border-t-teal-500 rounded-full" />
            </div>
          ) : vehiculesDept.length === 0 ? (
            <p className="text-center text-gray-400 py-12 text-sm">
              Aucun véhicule dans ce département.
            </p>
          ) : vehiculesFiltres.length === 0 ? (
            <p className="text-center text-gray-400 py-10 text-sm">
              Aucun véhicule ne correspond à cette matricule.
            </p>
          ) : (
            <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
              {vehiculesFiltres.map((v) => (
                <label
                  key={v.id}
                  className={`flex items-center gap-4 px-6 py-4 cursor-pointer transition-colors ${
                    selected.has(v.id) ? "bg-teal-50" : "hover:bg-gray-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(v.id)}
                    onChange={() => toggleVehicule(v.id)}
                    className="w-4 h-4 rounded text-teal-600 border-gray-300 focus:ring-teal-500"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 truncate">{v.vehicule}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {v.matricule}
                      {v.chauffeurResponsable ? ` · ${v.chauffeurResponsable}` : ""}
                    </p>
                  </div>
                  {selected.has(v.id) && (
                    <svg className="w-4 h-4 text-teal-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </label>
              ))}
            </div>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <Link
            to="/demandes"
            className="flex-1 text-center px-5 py-3 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors font-medium text-sm"
          >
            Annuler
          </Link>
          <button
            type="submit"
            disabled={submitting || selected.size === 0}
            className="flex-1 px-5 py-3 bg-gradient-to-r from-green-500 to-teal-600 text-white rounded-xl hover:from-green-600 hover:to-teal-700 transition-all shadow font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting
              ? "Envoi en cours..."
              : `Envoyer la demande${selected.size > 0 ? ` (${selected.size})` : ""}`}
          </button>
        </div>
      </form>
    </div>
  );
}
