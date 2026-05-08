import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/supabaseClient";
import { useAuthContext } from "@/context/AuthProvider";
import { useDemandes } from "@/hooks/useDemandes";
import { uploadPhoto } from "@/lib/uploadPhoto";
import type {
  DemandeRavitaillement,
  DemandeVehicule,
  PhotoJustification,
  StatutDemande,
  TypePhoto,
} from "@/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RavForm {
  montant: string;
  n_liter: string;
  kilometrage: string;
  photos: Partial<Record<TypePhoto, File>>;
}

interface VehiculeInfo {
  vehicule: string;
  matricule: string;
  chauffeur_responsable: string | null;
  zone: string;
}

// ---------------------------------------------------------------------------
// DB row → domain mapper
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any): DemandeRavitaillement {
  return {
    id: row.id,
    departement: row.departement,
    statut: row.statut as StatutDemande,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    demande_vehicules: (row.demande_vehicules ?? []).map((dv: any): DemandeVehicule => ({
      id: dv.id,
      demande_id: dv.demande_id,
      vehicule_id: dv.vehicule_id,
      montant: dv.montant ?? undefined,
      n_liter: dv.n_liter ?? undefined,
      kilometrage: dv.kilometrage ?? undefined,
      statut: dv.statut,
    })),
  };
}

const DETAIL_SELECT = `
  id,
  departement,
  statut,
  created_by,
  created_at,
  updated_at,
  demande_vehicules (
    id,
    demande_id,
    vehicule_id,
    montant,
    n_liter,
    kilometrage,
    statut
  )
`.trim();

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const STATUT_CONFIG: Record<StatutDemande, { label: string; classes: string }> = {
  en_attente:      { label: "En attente",        classes: "bg-orange-100 text-orange-800 border-orange-200" },
  validee_dept:    { label: "Validée (Dept.)",    classes: "bg-blue-100 text-blue-800 border-blue-200" },
  validee_station: { label: "Validée (Station)",  classes: "bg-purple-100 text-purple-800 border-purple-200" },
  validee_cellule: { label: "Validée (Cellule)",  classes: "bg-green-100 text-green-800 border-green-200" },
  annulee:         { label: "Annulée",            classes: "bg-red-100 text-red-800 border-red-200" },
};

const DV_STATUT: Record<string, { label: string; classes: string }> = {
  en_attente: { label: "En attente", classes: "bg-orange-100 text-orange-700" },
  ravitaille: { label: "Ravitaillé", classes: "bg-blue-100 text-blue-700" },
  valide:     { label: "Validé",     classes: "bg-green-100 text-green-700" },
  refuse:     { label: "Refusé",     classes: "bg-red-100 text-red-700" },
};

function StatutBadge({ statut }: { statut: StatutDemande }) {
  const cfg = STATUT_CONFIG[statut];
  return (
    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cfg.classes}`}>
      {cfg.label}
    </span>
  );
}

function DvStatutBadge({ statut }: { statut: string }) {
  const cfg = DV_STATUT[statut] ?? { label: statut, classes: "bg-gray-100 text-gray-700" };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${cfg.classes}`}>
      {cfg.label}
    </span>
  );
}

const PHOTO_LABELS: Record<TypePhoto, string> = {
  vehicule_avant: "Véhicule avant",
  vehicule_apres: "Véhicule après",
  pompe:          "Pompe",
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DetailDemandePage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthContext();
  const {
    validerDemandeDept,
    annulerDemande,
    saisirRavitaillement,
    validerDemandeStation,
    validerDemandeCellule,
  } = useDemandes();

  const [demande, setDemande] = useState<DemandeRavitaillement | null>(null);
  const [vehiculeInfoMap, setVehiculeInfoMap] = useState<Record<number, VehiculeInfo>>({});
  const [photosMap, setPhotosMap] = useState<Record<string, PhotoJustification[]>>({});
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [ravForms, setRavForms] = useState<Record<string, RavForm>>({});

  const isChefDept = user?.role === "chef_departement";
  const isStation  = user?.role === "responsable_station";
  const isCellule  = user?.role === "Admin" || user?.role === "MENAGER";

  // -------------------------------------------------------------------------
  // Fetch demande + vehicule info + photos (parallel after demande loads)
  // -------------------------------------------------------------------------

  const fetchDemande = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setFetchError(null);
    try {
      const { data, error } = await supabase
        .from("demandes_ravitaillement")
        .select(DETAIL_SELECT)
        .eq("id", id)
        .single();
      if (error) throw error;

      const mapped = mapRow(data);
      setDemande(mapped);

      const dvs = mapped.demande_vehicules ?? [];
      const vehiculeIds = dvs.map((dv) => dv.vehicule_id);
      const dvIds       = dvs.map((dv) => dv.id);
      const needPhotos  = ["validee_station", "validee_cellule"].includes(mapped.statut);

      const [vResult, pResult] = await Promise.all([
        vehiculeIds.length > 0
          ? supabase
              .from("vehicules")
              .select("id, vehicule, matricule, chauffeur_responsable, zone")
              .in("id", vehiculeIds)
          : Promise.resolve({ data: [] as VehiculeInfo[], error: null }),

        needPhotos && dvIds.length > 0
          ? supabase
              .from("photos_justification")
              .select("id, demande_vehicule_id, url, type, uploaded_at")
              .in("demande_vehicule_id", dvIds)
          : Promise.resolve({ data: [] as PhotoJustification[], error: null }),
      ]);

      // Vehicule info map
      const vMap: Record<number, VehiculeInfo> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vResult.data ?? []).forEach((v: any) => { vMap[v.id] = v; });
      setVehiculeInfoMap(vMap);

      // Photos map keyed by demande_vehicule_id
      const pMap: Record<string, PhotoJustification[]> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (pResult.data ?? []).forEach((p: any) => {
        if (!pMap[p.demande_vehicule_id]) pMap[p.demande_vehicule_id] = [];
        pMap[p.demande_vehicule_id].push(p as PhotoJustification);
      });
      setPhotosMap(pMap);

    } catch (e: unknown) {
      setFetchError(e instanceof Error ? e.message : "Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void fetchDemande(); }, [fetchDemande]);

  // Init ravForms when demande loads for responsable_station
  useEffect(() => {
    if (!demande || !isStation) return;
    setRavForms((prev) => {
      const next = { ...prev };
      demande.demande_vehicules?.forEach((dv) => {
        if (dv.statut === "en_attente" && !next[dv.id]) {
          next[dv.id] = { montant: "", n_liter: "", kilometrage: "", photos: {} };
        }
      });
      return next;
    });
  }, [demande, isStation]);

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------

  const allRavitaille =
    (demande?.demande_vehicules?.length ?? 0) > 0 &&
    demande?.demande_vehicules?.every((dv) => dv.statut !== "en_attente");

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  async function handleValiderDept() {
    if (!demande) return;
    setProcessing("valider_dept");
    try {
      await validerDemandeDept(id!, demande.departement);
      await fetchDemande();
    } finally {
      setProcessing(null);
    }
  }

  async function handleAnnuler() {
    if (!window.confirm("Annuler cette demande ? Cette action est irréversible.")) return;
    setProcessing("annuler");
    try {
      await annulerDemande(id!);
      await fetchDemande();
    } finally {
      setProcessing(null);
    }
  }

  async function handleValiderStation() {
    if (!demande) return;
    setProcessing("valider_station");
    try {
      await validerDemandeStation(id!, demande.departement);
      await fetchDemande();
    } finally {
      setProcessing(null);
    }
  }

  async function handleValiderCellule() {
    if (!demande) return;
    setProcessing("valider_cellule");
    try {
      await validerDemandeCellule(id!, demande.departement);
      await fetchDemande();
    } finally {
      setProcessing(null);
    }
  }

  async function handleSaisirRavitaillement(dvId: string) {
    const form = ravForms[dvId];
    if (!form) return;
    setProcessing(`rav_${dvId}`);
    setSubmitError(null);
    try {
      await saisirRavitaillement(dvId, {
        montant:     form.montant     ? parseFloat(form.montant)     : undefined,
        n_liter:     form.n_liter     ? parseFloat(form.n_liter)     : undefined,
        kilometrage: form.kilometrage ? parseFloat(form.kilometrage) : undefined,
      });

      const photoEntries = (Object.entries(form.photos) as [TypePhoto, File | undefined][])
        .filter((entry): entry is [TypePhoto, File] => entry[1] != null);

      if (photoEntries.length > 0) {
        await Promise.all(
          photoEntries.map(([type, file]) => uploadPhoto(file, dvId, type))
        );
      }

      await fetchDemande();
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : "Erreur lors de la saisie.");
    } finally {
      setProcessing(null);
    }
  }

  function updateRavForm(dvId: string, patch: Partial<Omit<RavForm, "photos">>) {
    setRavForms((prev) => ({ ...prev, [dvId]: { ...prev[dvId], ...patch } }));
  }

  function updateRavPhoto(dvId: string, type: TypePhoto, file: File | null) {
    setRavForms((prev) => ({
      ...prev,
      [dvId]: {
        ...prev[dvId],
        photos: { ...prev[dvId]?.photos, [type]: file ?? undefined },
      },
    }));
  }

  // -------------------------------------------------------------------------
  // Loading / error states
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] gap-3">
        <div className="animate-spin w-8 h-8 border-4 border-gray-200 border-t-green-500 rounded-full" />
        <span className="text-gray-500">Chargement...</span>
      </div>
    );
  }

  if (fetchError || !demande) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center">
        <p className="text-red-600 mb-4">{fetchError ?? "Demande introuvable."}</p>
        <Link to="/demandes" className="text-sm text-teal-600 hover:underline">
          ← Retour aux demandes
        </Link>
      </div>
    );
  }

  const statutCfg = STATUT_CONFIG[demande.statut];

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="max-w-4xl mx-auto py-6 space-y-6">
      {/* Back + header */}
      <div className="bg-white rounded-2xl shadow border border-gray-200 p-6">
        <div className="flex items-start gap-3 mb-4">
          <Link
            to="/demandes"
            className="mt-0.5 p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors flex-shrink-0"
            aria-label="Retour"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{demande.departement}</h1>
              <StatutBadge statut={demande.statut} />
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Créée le {new Date(demande.created_at).toLocaleDateString("fr-FR")}
              {" · "}
              {demande.demande_vehicules?.length ?? 0} véhicule(s)
            </p>
          </div>
        </div>

        {/* Action bar */}
        <div className="flex flex-wrap gap-3 pt-4 border-t border-gray-100">
          {isChefDept && demande.statut === "en_attente" && (
            <>
              <button
                onClick={handleValiderDept}
                disabled={processing === "valider_dept"}
                className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all shadow text-sm font-medium disabled:opacity-50"
              >
                {processing === "valider_dept" ? "Validation…" : "Valider la demande"}
              </button>
              <button
                onClick={handleAnnuler}
                disabled={processing === "annuler"}
                className="px-5 py-2.5 bg-white border border-red-300 text-red-700 rounded-xl hover:bg-red-50 transition-colors text-sm font-medium disabled:opacity-50"
              >
                {processing === "annuler" ? "Annulation…" : "Annuler la demande"}
              </button>
            </>
          )}

          {isStation && demande.statut === "validee_dept" && allRavitaille && (
            <button
              onClick={handleValiderStation}
              disabled={processing === "valider_station"}
              className="px-5 py-2.5 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-xl hover:from-purple-600 hover:to-purple-700 transition-all shadow text-sm font-medium disabled:opacity-50"
            >
              {processing === "valider_station" ? "Soumission…" : "Soumettre à la cellule"}
            </button>
          )}

          {isCellule && demande.statut === "validee_station" && (
            <button
              onClick={handleValiderCellule}
              disabled={processing === "valider_cellule"}
              className="px-5 py-2.5 bg-gradient-to-r from-green-500 to-teal-600 text-white rounded-xl hover:from-green-600 hover:to-teal-700 transition-all shadow text-sm font-medium disabled:opacity-50"
            >
              {processing === "valider_cellule" ? "Validation…" : "Valider la demande"}
            </button>
          )}

          {isChefDept && demande.statut === "validee_cellule" && (
            <>
              <button
                onClick={() => window.print()}
                className="px-5 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors text-sm font-medium flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Imprimer situation
              </button>
              <button
                onClick={() => window.print()}
                className="px-5 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors text-sm font-medium flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Imprimer les bons
              </button>
            </>
          )}

          {demande.statut === "annulee" && (
            <span className={`px-4 py-2 rounded-xl text-sm font-medium border ${statutCfg.classes}`}>
              Demande annulée
            </span>
          )}
        </div>
      </div>

      {submitError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          {submitError}
        </p>
      )}

      {/* Vehicles list */}
      <div className="space-y-4">
        {(demande.demande_vehicules ?? []).map((dv) => (
          <VehiculeCard
            key={dv.id}
            dv={dv}
            demande={demande}
            isStation={isStation}
            isCellule={isCellule}
            isChefDept={isChefDept}
            vehiculeInfo={vehiculeInfoMap[dv.vehicule_id]}
            photos={photosMap[dv.id]}
            ravForm={ravForms[dv.id]}
            processing={processing}
            onUpdateForm={(patch) => updateRavForm(dv.id, patch)}
            onUpdatePhoto={(type, file) => updateRavPhoto(dv.id, type, file)}
            onSubmit={() => handleSaisirRavitaillement(dv.id)}
          />
        ))}
      </div>

      <div className="w-full h-1 bg-gradient-to-r from-amber-400 via-orange-500 to-green-600 rounded-full opacity-80" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// VehiculeCard
// ---------------------------------------------------------------------------

interface VehiculeCardProps {
  dv: DemandeVehicule;
  demande: DemandeRavitaillement;
  isStation: boolean;
  isCellule: boolean;
  isChefDept: boolean;
  vehiculeInfo?: VehiculeInfo;
  photos?: PhotoJustification[];
  ravForm: RavForm | undefined;
  processing: string | null;
  onUpdateForm: (patch: Partial<Omit<RavForm, "photos">>) => void;
  onUpdatePhoto: (type: TypePhoto, file: File | null) => void;
  onSubmit: () => void;
}

function VehiculeCard({
  dv,
  demande,
  isStation,
  isCellule,
  isChefDept,
  vehiculeInfo,
  photos,
  ravForm,
  processing,
  onUpdateForm,
  onUpdatePhoto,
  onSubmit,
}: VehiculeCardProps) {
  const showForm    = isStation && demande.statut === "validee_dept" && dv.statut === "en_attente";
  const showAmounts = (isCellule || isChefDept) && dv.statut !== "en_attente";
  const showPhotos  = isCellule && (photos?.length ?? 0) > 0;
  const isSaving    = processing === `rav_${dv.id}`;

  const vehiculeLabel = vehiculeInfo
    ? `${vehiculeInfo.matricule} · ${vehiculeInfo.vehicule}`
    : `Véhicule #${dv.vehicule_id}`;

  const vehiculeSubLabel = vehiculeInfo
    ? [vehiculeInfo.chauffeur_responsable, vehiculeInfo.zone].filter(Boolean).join(" · ")
    : "";

  return (
    <div className="bg-white rounded-2xl shadow border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 truncate">{vehiculeLabel}</p>
          {vehiculeSubLabel && (
            <p className="text-xs text-gray-500 mt-0.5">{vehiculeSubLabel}</p>
          )}
        </div>
        <DvStatutBadge statut={dv.statut} />
      </div>

      {/* Amounts (cellule / chef after ravitaillement) */}
      {showAmounts && (dv.montant != null || dv.n_liter != null || dv.kilometrage != null) && (
        <div className="px-6 py-4 grid grid-cols-3 gap-4 bg-gray-50 border-b border-gray-100">
          <AmountCell label="Montant" value={dv.montant} unit="MRU" />
          <AmountCell label="Litres"  value={dv.n_liter}  unit="L" />
          <AmountCell label="Kilométrage" value={dv.kilometrage} unit="km" />
        </div>
      )}

      {/* Photos (cellule only — fetched when status ≥ validee_station) */}
      {showPhotos && (
        <div className="px-6 py-4 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Photos justificatives
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {(["vehicule_avant", "vehicule_apres", "pompe"] as TypePhoto[]).map((type) => {
              const photo = photos?.find((p) => p.type === type);
              return (
                <div key={type} className="space-y-1">
                  {photo ? (
                    <a
                      href={photo.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-xl overflow-hidden border border-gray-200 hover:opacity-90 transition-opacity"
                    >
                      <img
                        src={photo.url}
                        alt={PHOTO_LABELS[type]}
                        className="w-full h-32 object-cover"
                      />
                    </a>
                  ) : (
                    <div className="w-full h-32 rounded-xl border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center">
                      <span className="text-xs text-gray-400">Pas de photo</span>
                    </div>
                  )}
                  <p className="text-xs text-center text-gray-500">{PHOTO_LABELS[type]}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Saisie form (responsable station) */}
      {showForm && ravForm && (
        <div className="px-6 py-5 space-y-5">
          <p className="text-sm font-semibold text-gray-700">Saisir le ravitaillement</p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <NumericField
              id={`montant-${dv.id}`}
              label="Montant (MRU)"
              value={ravForm.montant}
              onChange={(v) => onUpdateForm({ montant: v })}
            />
            <NumericField
              id={`n_liter-${dv.id}`}
              label="Litres (L)"
              value={ravForm.n_liter}
              onChange={(v) => onUpdateForm({ n_liter: v })}
            />
            <NumericField
              id={`kilometrage-${dv.id}`}
              label="Kilométrage (km)"
              value={ravForm.kilometrage}
              onChange={(v) => onUpdateForm({ kilometrage: v })}
            />
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Photos ({(["vehicule_avant", "vehicule_apres", "pompe"] as TypePhoto[]).filter((t) => ravForm.photos[t]).length}/3)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {(["vehicule_avant", "vehicule_apres", "pompe"] as TypePhoto[]).map((type) => (
                <PhotoInput
                  key={type}
                  type={type}
                  file={ravForm.photos[type] ?? null}
                  onChange={(file) => onUpdatePhoto(type, file)}
                />
              ))}
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={onSubmit}
              disabled={isSaving}
              className="px-6 py-2.5 bg-gradient-to-r from-green-500 to-teal-600 text-white rounded-xl hover:from-green-600 hover:to-teal-700 transition-all shadow text-sm font-medium disabled:opacity-50"
            >
              {isSaving ? "Enregistrement…" : "Valider ce véhicule"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

function AmountCell({ label, value, unit }: { label: string; value?: number; unit: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="font-semibold text-gray-900">
        {value != null ? `${value.toLocaleString("fr-FR")} ${unit}` : "—"}
      </p>
    </div>
  );
}

function NumericField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-gray-600 mb-1">
        {label}
      </label>
      <input
        id={id}
        type="number"
        min="0"
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all"
      />
    </div>
  );
}

function PhotoInput({
  type,
  file,
  onChange,
}: {
  type: TypePhoto;
  file: File | null;
  onChange: (f: File | null) => void;
}) {
  const label = PHOTO_LABELS[type];
  const previewUrl = file ? URL.createObjectURL(file) : null;

  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <label
        className={`flex flex-col items-center justify-center w-full h-28 rounded-xl border-2 border-dashed cursor-pointer transition-colors overflow-hidden ${
          file
            ? "border-teal-400 bg-teal-50"
            : "border-gray-300 bg-gray-50 hover:border-teal-400 hover:bg-teal-50"
        }`}
      >
        {previewUrl ? (
          <img src={previewUrl} alt={label} className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-1 text-gray-400">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-xs">Ajouter</span>
          </div>
        )}
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        />
      </label>
      {file && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="mt-1 text-xs text-red-500 hover:text-red-700 w-full text-center"
        >
          Supprimer
        </button>
      )}
    </div>
  );
}
