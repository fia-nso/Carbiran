import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthContext } from "@/context/AuthProvider";
import { useDemandes } from "@/hooks/useDemandes";
import { useVehicules } from "@/hooks/useVehicule";

const DEPARTEMENTS = ["Zone A", "Zone B", "RX&SYS", "FO", "CPDE", "DC", "Autre"] as const;
type Departement = typeof DEPARTEMENTS[number];

const DEPT_LABELS: Partial<Record<Departement, string>> = {
  "DC":    "Direction Commerciale (DC)",
  "Autre": "Autre département",
};

const normalizeZone = (zone: string) => zone?.trim().toLowerCase();

const KNOWN_ZONES: readonly string[] = ["zone a", "zone b", "rx&sys", "fo", "cpde", "dc"];

function matchDept(raw: string | null | undefined): Departement {
  if (!raw) return "Zone A";
  const norm = raw.trim().toLowerCase();
  return DEPARTEMENTS.find((d) => d.toLowerCase() === norm) ?? "Zone A";
}

export default function NouvelleDemandePage() {
  const { user } = useAuthContext();
  const navigate = useNavigate();
  const { createDemande } = useDemandes();
  const { allVehicules, loading: vLoading } = useVehicules();

  const isChefDept = user?.role === "chef_departement";

  const [departement, setDepartement] = useState<Departement>("Zone A");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [matriculeSearch, setMatriculeSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user && user.role !== "chef_de_cours" && user.role !== "chef_departement") {
      navigate("/demandes", { replace: true });
    }
  }, [user, navigate]);

  // Pour chef_departement : verrouille le département sur user.departement
  useEffect(() => {
    if (isChefDept && user?.departement) {
      setDepartement(matchDept(user.departement));
    }
  }, [isChefDept, user?.departement]);

  useEffect(() => {
    setSelected(new Set());
    setMatriculeSearch("");
  }, [departement]);

  const vehiculesDept = useMemo(
    () =>
      allVehicules.filter((v) => {
        if (isChefDept) {
          // Zone doit correspondre exactement au département de l'utilisateur + centre NKTT
          if (!user?.departement) return false;
          if (normalizeZone(v.zone) !== normalizeZone(user.departement)) return false;
          if (v.centre !== "NKTT") return false;
          return true;
        }
        const zoneMatch =
          departement === "Autre"
            ? !KNOWN_ZONES.includes(normalizeZone(v.zone))
            : normalizeZone(v.zone) === normalizeZone(departement);
        if (!zoneMatch) return false;
        if (user?.role === "chef_de_cours" && v.centre !== "NKTT") return false;
        return true;
      }),
    [allVehicules, departement, isChefDept, user?.role, user?.departement]
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
      await createDemande(departement, [...selected], user?.role);
      navigate("/demandes");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur lors de la création.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-4 sm:py-6 px-4 sm:px-0 pb-28 sm:pb-6 space-y-6">
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
        {/* Département selector — masqué pour chef_departement (dept verrouillé) */}
        {isChefDept ? (
          <div className="bg-teal-50 rounded-2xl border border-teal-200 p-4 flex items-center gap-3">
            <span className="text-teal-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </span>
            <div>
              <p className="text-xs text-teal-600 font-medium">Département</p>
              <p className="text-sm font-semibold text-teal-900">{DEPT_LABELS[departement] ?? departement}</p>
            </div>
          </div>
        ) : (
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
                  {DEPT_LABELS[dept] ?? dept}
                </button>
              ))}
            </div>
          </div>
        )}

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
                  className={`flex items-center gap-4 px-4 sm:px-6 min-h-[44px] py-3 cursor-pointer transition-colors ${
                    selected.has(v.id) ? "bg-teal-50" : "hover:bg-gray-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(v.id)}
                    onChange={() => toggleVehicule(v.id)}
                    className="w-5 h-5 rounded text-teal-600 border-gray-300 focus:ring-teal-500 flex-shrink-0"
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

        <div className="fixed bottom-0 left-0 right-0 z-10 bg-white/95 backdrop-blur-sm border-t border-gray-200 p-4 sm:static sm:bg-transparent sm:border-0 sm:p-0 sm:backdrop-blur-none">
          <div className="max-w-2xl mx-auto flex gap-3">
            <Link
              to="/demandes"
              className="flex-1 text-center px-5 py-3 min-h-[44px] flex items-center justify-center border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors font-medium text-sm"
            >
              Annuler
            </Link>
            <button
              type="submit"
              disabled={submitting || selected.size === 0}
              className="flex-1 px-5 py-3 min-h-[44px] bg-gradient-to-r from-green-500 to-teal-600 text-white rounded-xl hover:from-green-600 hover:to-teal-700 transition-all shadow font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting
                ? "Envoi en cours..."
                : `Envoyer la demande${selected.size > 0 ? ` (${selected.size})` : ""}`}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
