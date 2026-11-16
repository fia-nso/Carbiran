import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuthContext } from "@/context/AuthProvider";
import { useDemandes } from "@/hooks/useDemandes";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { useWebNotifications } from "@/hooks/useWebNotifications";
import { normCentre, useCentres } from "@/hooks/useCentres";
import {
  getCircuitRole,
  getEtatSignature,
} from "@/hooks/useSignatures";
import type {
  DemandeRavitaillement,
  DemandeVehicule,
  User,
} from "@/types";


const VEHICULE_STATUT_CARDS = [
  { key: "en_attente_demande", label: "En attente d'approbation", classes: "bg-orange-100 text-orange-800 border-orange-200" },
  { key: "approuvee",          label: "Approuvée",                 classes: "bg-blue-100 text-blue-800 border-blue-200" },
  { key: "ravitaille",         label: "Ravitaillement effectué",   classes: "bg-purple-100 text-purple-800 border-purple-200" },
  { key: "valide",             label: "Validée",                   classes: "bg-green-100 text-green-800 border-green-200" },
  { key: "refuse",             label: "Retournée",                 classes: "bg-red-100 text-red-800 border-red-200" },
] as const;

function getDvStats(dvs: DemandeVehicule[] | undefined) {
  const list = dvs ?? [];
  return {
    total:      list.length,
    enAttente:  list.filter((v) => v.statut === "en_attente" || v.statut === "refuse").length,
    ravitaille: list.filter((v) => v.statut === "ravitaille").length,
    valide:     list.filter((v) => v.statut === "valide").length,
  };
}

function CentreBadge({ code }: { code?: string | null }) {
  if (!code) return null;
  return (
    <span className="inline-flex px-2 py-0.5 rounded-md text-xs font-semibold font-mono bg-teal-50 text-teal-800 border border-teal-200">
      {code}
    </span>
  );
}

function SmartStatutBadge({ d }: { d: DemandeRavitaillement }) {
  const { total, ravitaille, valide } = getDvStats(d.demande_vehicules);

  let label: string;
  let classes: string;

  if (d.statut === "annulee") {
    label = "Annulée";
    classes = "bg-red-100 text-red-800 border-red-200";
  } else if (valide > 0) {
    label = `Validée (${valide}/${total})`;
    classes = "bg-green-100 text-green-800 border-green-200";
  } else if (ravitaille > 0) {
    label = `Ravitaillement effectué (${ravitaille}/${total})`;
    classes = "bg-purple-100 text-purple-800 border-purple-200";
  } else if (d.statut === "validee_dept" || d.statut === "validee_station") {
    label = "Approuvée";
    classes = "bg-blue-100 text-blue-800 border-blue-200";
  } else {
    label = "En attente d'approbation";
    classes = "bg-orange-100 text-orange-800 border-orange-200";
  }

  return (
    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium border ${classes}`}>
      {label}
    </span>
  );
}

function DvDetailLine({ dvs }: { dvs: DemandeVehicule[] | undefined }) {
  const { enAttente, ravitaille, valide } = getDvStats(dvs);
  const parts: string[] = [];
  if (enAttente > 0)  parts.push(`⏳ ${enAttente} en attente de ravitaillement`);
  if (ravitaille > 0) parts.push(`🔄 ${ravitaille} ravitaillement${ravitaille > 1 ? "s" : ""} effectué${ravitaille > 1 ? "s" : ""}`);
  if (valide > 0)     parts.push(`✅ ${valide} validé${valide > 1 ? "s" : ""}`);
  if (parts.length === 0) return null;
  return <p className="text-xs text-gray-500 mt-0.5">{parts.join(" · ")}</p>;
}

// ---------------------------------------------------------------------------
// Statut de signature de l'utilisateur connecté pour une demande
// ---------------------------------------------------------------------------

type MySignatureState = "signed" | "to_sign" | null;

/**
 * Détermine, pour la demande donnée, si l'utilisateur connecté :
 *  - a déjà signé            → "signed"   (une entrée avec son user_id existe)
 *  - doit signer maintenant  → "to_sign"  (c'est son tour sur au moins un circuit)
 *  - n'est pas concerné      → null
 * La priorité va à "to_sign" (action attendue) pour faire ressortir le travail en attente.
 */
function getMySignatureState(demande: DemandeRavitaillement, user: User | null): MySignatureState {
  if (!user) return null;
  const myRole = getCircuitRole(user.role, user.circuit_role);
  if (!myRole) return null;

  const sigs = demande.signatures ?? [];
  const signedByMe = sigs.some((s) => s.user_id === user.id);

  // Le circuit de signature ne démarre qu'une fois au moins un véhicule validé par la cellule.
  const circuitActive = (demande.demande_vehicules ?? []).some((dv) => dv.statut === "valide");
  if (!circuitActive) return signedByMe ? "signed" : null;

  // Même règle que le bouton de signature de la page de détail.
  const etat = getEtatSignature(sigs, demande.departement, myRole);
  if (demande.situation_soumise === true && demande.statut !== "annulee" && etat.peutSigner) return "to_sign";
  return signedByMe && etat.manquants.length === 0 ? "signed" : null;
}

function MySignatureBadge({ state }: { state: MySignatureState }) {
  if (!state) return null;
  const cfg =
    state === "signed"
      ? { label: "✅ Signé", classes: "bg-green-100 text-green-800 border-green-200" }
      : { label: "⏳ À signer", classes: "bg-amber-100 text-amber-800 border-amber-200" };
  return (
    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium border ${cfg.classes}`}>
      {cfg.label}
    </span>
  );
}

export default function DemandesPage() {
  const { user } = useAuthContext();
  const { demandes, loading, error, fetchDemandes } = useDemandes();
  const { showNotification } = useWebNotifications();
  const isAdminOrManager = user?.role === "Admin" || user?.role === "MENAGER";

  useEffect(() => { void fetchDemandes(); }, [fetchDemandes]);

  useRealtimeSync({
    onDemandesChange: fetchDemandes,
    onDvChange: fetchDemandes,
    showWebNotification: isAdminOrManager ? showNotification : undefined,
  });

  const canCreateDemande = user?.role === "chef_de_cours" || user?.role === "chef_departement";

  const isDCDirector  = user?.role === "signataire" && user?.circuit_role === "directeur_commercial";

  // Filtre par centre : Cellule et Chef Département Achat (qui voient tous les centres).
  const canFilterCentre = isAdminOrManager || user?.role === "responsable_station_viewer";
  const [centreFilter, setCentreFilter] = useState("");
  const { centres } = useCentres(false);
  const centresPresents = useMemo(() => {
    const presents = new Set(demandes.map((d) => normCentre(d.centre)).filter(Boolean));
    return centres.filter((c) => presents.has(c.code));
  }, [demandes, centres]);

  const filteredDemandes = demandes.filter((d) => {
    if (isDCDirector && d.departement !== "DC") return false;
    if (canFilterCentre && centreFilter && normCentre(d.centre) !== centreFilter) return false;
    return true;
  });

  const allVehicules = filteredDemandes.flatMap((d) => d.demande_vehicules ?? []);
  const totalVehicules = allVehicules.length;

  const vehiculeCounts: Record<(typeof VEHICULE_STATUT_CARDS)[number]["key"], number> = {
    en_attente_demande: filteredDemandes
      .filter((d) => d.statut === "en_attente")
      .flatMap((d) => d.demande_vehicules ?? [])
      .length,
    approuvee: filteredDemandes
      .filter((d) => d.statut === "validee_dept")
      .flatMap((d) => d.demande_vehicules ?? [])
      .length,
    ravitaille: allVehicules.filter((v) => v.statut === "ravitaille").length,
    valide:     allVehicules.filter((v) => v.statut === "valide").length,
    refuse:     allVehicules.filter((v) => v.statut === "refuse").length,
  };

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

        {canFilterCentre && (
          <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-3">
            <label htmlFor="filtre-centre" className="text-sm font-medium text-gray-700">Centre</label>
            <select
              id="filtre-centre"
              value={centreFilter}
              onChange={(e) => setCentreFilter(e.target.value)}
              className="h-12 w-full sm:w-72 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all bg-white text-gray-700"
            >
              <option value="">Tous les centres</option>
              {centresPresents.map((c) => (
                <option key={c.code} value={c.code}>{c.zone} — {c.code}</option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-wrap gap-3 mt-6">
          <div className="flex-1 min-w-[120px] bg-gray-50 rounded-xl p-4 border border-gray-200">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Total véhicules</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{totalVehicules}</p>
          </div>
          {VEHICULE_STATUT_CARDS.map(({ key, label, classes }) => {
            const n = vehiculeCounts[key];
            if (!n) return null;
            return (
              <div key={key} className={`flex-1 min-w-[140px] rounded-xl p-4 border ${classes}`}>
                <p className="text-xs font-medium uppercase tracking-wider opacity-80">{label}</p>
                <p className="text-2xl font-bold mt-1">{n}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl shadow border border-gray-200 overflow-hidden">
        {loading && filteredDemandes.length === 0 ? (
          <div className="flex items-center justify-center py-16 gap-3">
            <div className="animate-spin w-7 h-7 border-4 border-gray-200 border-t-green-500 rounded-full" />
            <span className="text-gray-500">Chargement...</span>
          </div>
        ) : error ? (
          <p className="py-12 text-center text-red-600 px-6">{error}</p>
        ) : filteredDemandes.length === 0 ? (
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
                    {["Département", "Centre", "Date", "Statut", "Ma signature", "Détail véhicules", ""].map((h) => (
                      <th key={h} className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider last:text-right">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredDemandes.map((demande) => (
                    <tr key={demande.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-gray-900">{demande.departement}</td>
                      <td className="px-6 py-4"><CentreBadge code={demande.centre} /></td>
                      <td className="px-6 py-4 text-gray-600 text-sm">
                        {new Date(demande.created_at).toLocaleDateString("fr-FR")}
                      </td>
                      <td className="px-6 py-4">
                        <SmartStatutBadge d={demande} />
                      </td>
                      <td className="px-6 py-4">
                        <MySignatureBadge state={getMySignatureState(demande, user)} />
                      </td>
                      <td className="px-6 py-4">
                        <DvDetailLine dvs={demande.demande_vehicules} />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link
                          to={`/demandes/${demande.id}`}
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
              {filteredDemandes.map((demande) => (
                <Link
                  key={demande.id}
                  to={`/demandes/${demande.id}`}
                  className="flex items-start justify-between gap-3 p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 flex items-center gap-2">
                      {demande.departement}
                      <CentreBadge code={demande.centre} />
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {new Date(demande.created_at).toLocaleDateString("fr-FR")}
                      {" · "}
                      {demande.demande_vehicules?.length ?? 0} véhicule(s)
                    </p>
                    <DvDetailLine dvs={demande.demande_vehicules} />
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <SmartStatutBadge d={demande} />
                    <MySignatureBadge state={getMySignatureState(demande, user)} />
                  </div>
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
