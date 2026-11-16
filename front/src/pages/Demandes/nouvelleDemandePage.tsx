import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthContext } from "@/context/AuthProvider";
import { useDemandes } from "@/hooks/useDemandes";
import { useVehicules } from "@/hooks/useVehicule";
import { normCentre, useCentres } from "@/hooks/useCentres";
import { apiErrorMessage } from "@/lib/api";
import { DEPARTEMENTS, DEPT_LABELS, vehiculeDansDepartement } from "@/lib/departements";

function BackHeader({ subtitle }: { subtitle?: string }) {
  return (
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
        {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
      </div>
    </div>
  );
}

function ConfigError({ title, message }: { title: string; message: string }) {
  return (
    <div className="max-w-2xl mx-auto py-4 sm:py-6 px-4 sm:px-0 space-y-6">
      <BackHeader />
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
        <p className="text-sm font-semibold text-red-800">{title}</p>
        <p className="text-sm text-red-600 mt-1">{message}</p>
      </div>
    </div>
  );
}

/** Bandeau « valeur imposée » (centre du chef de centre, département du chef de département). */
function LockedBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-teal-50 rounded-2xl border border-teal-200 p-4 flex items-center gap-3">
      <span className="text-teal-600">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      </span>
      <div>
        <p className="text-xs text-teal-600 font-medium">{label}</p>
        <p className="text-sm font-semibold text-teal-900">{value}</p>
      </div>
    </div>
  );
}

const CHOICE_BTN = (active: boolean) =>
  `h-12 px-4 rounded-xl border-2 text-sm font-medium transition-all ${
    active
      ? "border-teal-500 bg-teal-50 text-teal-800"
      : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50"
  }`;

export default function NouvelleDemandePage() {
  const { user } = useAuthContext();
  const navigate = useNavigate();
  const { createDemande } = useDemandes();
  const { allVehicules, loading: vLoading } = useVehicules();
  const { centres, libelle, loading: cLoading } = useCentres(true);

  const isChefDept = user?.role === "chef_departement";
  const isChefCentre = user?.role === "chef_de_cours";

  // Chef de centre : centre imposé (compte). Chef de département : centre choisi.
  const centreImpose = isChefCentre ? normCentre(user?.centre) : "";
  // Chef de département, ou chef de centre avec département (DC) : département imposé.
  const deptImpose = isChefDept || (isChefCentre && !!user?.departement) ? (user?.departement ?? "") : "";

  const [departement, setDepartement] = useState<string>("");
  const [centreChoisi, setCentreChoisi] = useState<string>("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [matriculeSearch, setMatriculeSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user && !isChefCentre && !isChefDept) navigate("/demandes", { replace: true });
  }, [user, isChefCentre, isChefDept, navigate]);

  const deptEffectif = deptImpose || departement;
  const centreEffectif = isChefCentre ? centreImpose : centreChoisi;

  // Chef de centre sans département : tous les départements ayant des véhicules dans son centre (DC compris).
  const departementsDisponibles = useMemo(() => {
    if (!isChefCentre || deptImpose || !centreImpose) return [];
    const vehiculesCentre = allVehicules.filter((v) => normCentre(v.centre) === centreImpose);
    return DEPARTEMENTS.filter(
      (d) => vehiculesCentre.some((v) => vehiculeDansDepartement(v.zone, d))
    );
  }, [isChefCentre, deptImpose, centreImpose, allVehicules]);

  // Chef de département : centres actifs où son département a des véhicules.
  const centresDisponibles = useMemo(() => {
    if (!isChefDept || !deptImpose) return [];
    const presents = new Set(
      allVehicules
        .filter((v) => vehiculeDansDepartement(v.zone, deptImpose))
        .map((v) => normCentre(v.centre))
        .filter(Boolean)
    );
    return centres.filter((c) => presents.has(c.code));
  }, [isChefDept, deptImpose, allVehicules, centres]);

  // Présélection quand il n'y a qu'un seul choix possible.
  useEffect(() => {
    if (departementsDisponibles.length === 1 && !departement) setDepartement(departementsDisponibles[0]);
  }, [departementsDisponibles, departement]);
  useEffect(() => {
    if (centresDisponibles.length === 1 && !centreChoisi) setCentreChoisi(centresDisponibles[0].code);
  }, [centresDisponibles, centreChoisi]);

  // Réinitialise la sélection quand le département ou le centre change.
  useEffect(() => {
    setSelected(new Set());
    setMatriculeSearch("");
  }, [deptEffectif, centreEffectif]);

  const vehiculesDept = useMemo(() => {
    if (!deptEffectif || !centreEffectif) return [];
    return allVehicules.filter(
      (v) => vehiculeDansDepartement(v.zone, deptEffectif) && normCentre(v.centre) === centreEffectif
    );
  }, [allVehicules, deptEffectif, centreEffectif]);

  const vehiculesFiltres = useMemo(
    () =>
      matriculeSearch === ""
        ? vehiculesDept
        : vehiculesDept.filter((v) => v.matricule.toLowerCase().includes(matriculeSearch.toLowerCase())),
    [vehiculesDept, matriculeSearch]
  );

  const allSelected = vehiculesFiltres.length > 0 && vehiculesFiltres.every((v) => selected.has(v.id));

  function toggleVehicule(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      vehiculesFiltres.forEach((v) => (allSelected ? next.delete(v.id) : next.add(v.id)));
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!deptEffectif) { setError("Choisissez un département."); return; }
    if (!centreEffectif) { setError("Choisissez un centre."); return; }
    if (selected.size === 0) { setError("Sélectionnez au moins un véhicule."); return; }
    setError(null);
    setSubmitting(true);
    try {
      // Le centre n'est envoyé que par le chef de département.
      await createDemande(deptEffectif, [...selected], isChefDept ? centreEffectif : null);
      navigate("/demandes");
    } catch (err: unknown) {
      setError(apiErrorMessage(err, "Erreur lors de la création."));
    } finally {
      setSubmitting(false);
    }
  }

  // Profil pas encore chargé → spinner
  if (!user || user.departement === undefined) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin w-7 h-7 border-4 border-gray-200 border-t-teal-500 rounded-full" />
      </div>
    );
  }

  if (isChefDept && !user.departement) {
    return (
      <ConfigError
        title="Département non configuré"
        message="Votre compte n'a pas de département assigné. Contactez un administrateur."
      />
    );
  }

  if (isChefCentre && !centreImpose) {
    return (
      <ConfigError
        title="Centre non configuré"
        message="Votre compte n'est rattaché à aucun centre. Contactez un administrateur."
      />
    );
  }

  const loadingChoix = vLoading || (isChefDept && cLoading);

  return (
    <div className="max-w-2xl mx-auto py-4 sm:py-6 px-4 sm:px-0 pb-28 sm:pb-6 space-y-6">
      <BackHeader
        subtitle={
          isChefDept
            ? "Choisissez un centre puis les véhicules concernés."
            : deptImpose
            ? "Sélectionnez les véhicules concernés."
            : "Choisissez un département puis les véhicules concernés."
        }
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {isChefCentre && <LockedBadge label="Centre" value={libelle(centreImpose)} />}
          {deptImpose && (
            <LockedBadge label="Département" value={DEPT_LABELS[deptImpose as keyof typeof DEPT_LABELS] ?? deptImpose} />
          )}
        </div>

        {/* Chef de centre sans département : choix du département */}
        {isChefCentre && !deptImpose && (
          <div className="bg-white rounded-2xl shadow border border-gray-200 p-6">
            <p className="text-sm font-semibold text-gray-700 mb-4">Département</p>
            {vLoading ? (
              <div className="flex justify-center py-4">
                <div className="animate-spin w-6 h-6 border-4 border-gray-200 border-t-teal-500 rounded-full" />
              </div>
            ) : departementsDisponibles.length === 0 ? (
              <p className="text-sm text-gray-500">Aucun véhicule n'est rattaché à votre centre.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {departementsDisponibles.map((dept) => (
                  <button key={dept} type="button" onClick={() => setDepartement(dept)} className={CHOICE_BTN(departement === dept)}>
                    {DEPT_LABELS[dept] ?? dept}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Chef de département : choix du centre */}
        {isChefDept && (
          <div className="bg-white rounded-2xl shadow border border-gray-200 p-6">
            <label htmlFor="demande-centre" className="block text-sm font-semibold text-gray-700 mb-4">
              Centre
            </label>
            {loadingChoix ? (
              <div className="flex justify-center py-4">
                <div className="animate-spin w-6 h-6 border-4 border-gray-200 border-t-teal-500 rounded-full" />
              </div>
            ) : centresDisponibles.length === 0 ? (
              <p className="text-sm text-gray-500">Aucun centre actif n'a de véhicule de votre département.</p>
            ) : (
              <select
                id="demande-centre"
                value={centreChoisi}
                onChange={(e) => setCentreChoisi(e.target.value)}
                className="w-full h-12 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all bg-white"
              >
                <option value="">— Choisir un centre —</option>
                {centresDisponibles.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.zone} — {c.code} ({c.nom})
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* Véhicules */}
        <div className="bg-white rounded-2xl shadow border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <div>
              <p className="text-sm font-semibold text-gray-700">
                Véhicules — {deptEffectif || "—"}
                {centreEffectif ? ` · ${centreEffectif}` : ""}
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
                className="w-full h-12 text-sm border border-gray-200 rounded-xl px-4 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent placeholder-gray-400"
              />
            </div>
          )}

          {vLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin w-6 h-6 border-4 border-gray-200 border-t-teal-500 rounded-full" />
            </div>
          ) : !deptEffectif || !centreEffectif ? (
            <p className="text-center text-gray-400 py-12 text-sm">
              {isChefDept ? "Choisissez d'abord un centre." : "Choisissez d'abord un département."}
            </p>
          ) : vehiculesDept.length === 0 ? (
            <p className="text-center text-gray-400 py-12 text-sm">Aucun véhicule de ce département dans ce centre.</p>
          ) : vehiculesFiltres.length === 0 ? (
            <p className="text-center text-gray-400 py-10 text-sm">Aucun véhicule ne correspond à cette matricule.</p>
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
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>
        )}

        <div className="fixed bottom-0 left-0 right-0 z-10 bg-white/95 backdrop-blur-sm border-t border-gray-200 p-4 sm:static sm:bg-transparent sm:border-0 sm:p-0 sm:backdrop-blur-none">
          <div className="max-w-2xl mx-auto flex gap-3">
            <Link
              to="/demandes"
              className="flex-1 text-center px-5 h-12 flex items-center justify-center border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors font-medium text-sm"
            >
              Annuler
            </Link>
            <button
              type="submit"
              disabled={submitting || selected.size === 0}
              className="flex-1 px-5 h-12 bg-gradient-to-r from-green-500 to-teal-600 text-white rounded-xl hover:from-green-600 hover:to-teal-700 transition-all shadow font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Envoi en cours..." : `Envoyer la demande${selected.size > 0 ? ` (${selected.size})` : ""}`}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
