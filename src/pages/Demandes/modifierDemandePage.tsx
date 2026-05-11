import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuthContext } from "@/context/AuthProvider";
import { useDemandes } from "@/hooks/useDemandes";
import { useVehicules } from "@/hooks/useVehicule";
import { supabase } from "@/supabaseClient";

const normalizeZone = (zone: string) => zone?.trim().toLowerCase();
const KNOWN_ZONES: readonly string[] = ["zone a", "zone b", "rx&sys", "fo", "cpde", "dc"];

export default function ModifierDemandePage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthContext();
  const navigate = useNavigate();
  const { updateDemandeVehicules } = useDemandes();
  const { allVehicules, loading: vLoading } = useVehicules();

  const [departement, setDepartement] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [matriculeSearch, setMatriculeSearch] = useState("");
  const [loadingDemande, setLoadingDemande] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    supabase
      .from("demandes_ravitaillement")
      .select("departement, demande_vehicules(vehicule_id)")
      .eq("id", id)
      .single()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(({ data, error }: { data: any; error: any }) => {
        if (error || !data) {
          setLoadError("Demande introuvable.");
        } else {
          setDepartement(data.departement as string);
          const ids = ((data.demande_vehicules ?? []) as { vehicule_id: number }[]).map(
            (dv) => dv.vehicule_id
          );
          setSelected(new Set(ids));
        }
        setLoadingDemande(false);
      });
  }, [id]);

  useEffect(() => {
    if (user && user.role !== "chef_de_cours" && user.role !== "chef_departement") {
      navigate("/demandes", { replace: true });
    }
  }, [user, navigate]);

  const vehiculesDept = useMemo(() => {
    if (!departement) return [];
    return allVehicules.filter((v) => {
      const zoneMatch =
        departement === "Autre"
          ? !KNOWN_ZONES.includes(normalizeZone(v.zone))
          : normalizeZone(v.zone) === normalizeZone(departement);
      if (!zoneMatch) return false;
      if (v.centre?.trim().toUpperCase() !== "NKTT") return false;
      return true;
    });
  }, [allVehicules, departement]);

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
    vehiculesFiltres.length > 0 && vehiculesFiltres.every((v) => selected.has(v.id));

  function toggleVehicule(vid: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(vid)) next.delete(vid);
      else next.add(vid);
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
      setSubmitError("Sélectionnez au moins un véhicule.");
      return;
    }
    setSubmitError(null);
    setSubmitting(true);
    try {
      await updateDemandeVehicules(id!, [...selected]);
      navigate(`/demandes/${id}`);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Erreur lors de la modification.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!user || loadingDemande) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin w-7 h-7 border-4 border-gray-200 border-t-teal-500 rounded-full" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center">
        <p className="text-red-600 mb-4">{loadError}</p>
        <Link to="/demandes" className="text-sm text-teal-600 hover:underline">
          ← Retour aux demandes
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-4 sm:py-6 px-4 sm:px-0 pb-28 sm:pb-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          to={`/demandes/${id}`}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
          aria-label="Retour"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Modifier la demande</h1>
          <p className="text-sm text-gray-500">Modifiez les véhicules inclus dans la demande.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Département badge */}
        <div className="bg-teal-50 rounded-2xl border border-teal-200 p-4 flex items-center gap-3">
          <span className="text-teal-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </span>
          <div>
            <p className="text-xs text-teal-600 font-medium">Département</p>
            <p className="text-sm font-semibold text-teal-900">{departement ?? "—"}</p>
          </div>
        </div>

        {/* Véhicules */}
        <div className="bg-white rounded-2xl shadow border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <div>
              <p className="text-sm font-semibold text-gray-700">
                Véhicules — {departement ?? "—"}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">{selected.size} sélectionné(s)</p>
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
                    <svg
                      className="w-4 h-4 text-teal-600 flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2.5}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                </label>
              ))}
            </div>
          )}
        </div>

        {submitError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            {submitError}
          </p>
        )}

        <div className="fixed bottom-0 left-0 right-0 z-10 bg-white/95 backdrop-blur-sm border-t border-gray-200 p-4 sm:static sm:bg-transparent sm:border-0 sm:p-0 sm:backdrop-blur-none">
          <div className="max-w-2xl mx-auto flex gap-3">
            <Link
              to={`/demandes/${id}`}
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
                ? "Enregistrement..."
                : `Enregistrer (${selected.size} véhicule${selected.size > 1 ? "s" : ""})`}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
