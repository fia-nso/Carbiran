import type { FormEvent, ReactNode } from "react";
import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import ConfirmationCodeModal from "@/components/ui/ConfirmationCodeModal";
import SearchableVehiculeSelect from "@/components/ui/SearchableVehiculeSelect";
import { useAuthContext } from "@/context/AuthProvider";
import { useRavitaillementsVehicule } from "@/hooks/useRavitaillementVehicule";
import { useVehicules } from "@/hooks/useVehicule";
import type {
  RavitaillementVehicule,
  StatutRavitaillementVehicule,
} from "@/types";

type DateFilterField = "dateSituation" | "dateRavitaillement";
type StatutFilter = StatutRavitaillementVehicule | "ALL";
type RavitaillementDraft = {
  dateSituation: string | null;
  dateRavitaillement: string | null;
  vehiculeId: number;
  montantPrevu: number;
  montantRavitaille: number;
  statut: StatutRavitaillementVehicule;
  nLiter: number;
};

interface RavitaillementFormState {
  dateSituation: string;
  dateRavitaillement: string;
  vehiculeId: string;
  montantPrevu: string;
  montantRavitaille: string;
  statut: StatutRavitaillementVehicule;
  nLiter: string;
}

interface PendingConfirmation {
  title: string;
  description: string;
  confirmLabel: string;
  tone: "danger" | "warning";
  onConfirm: () => Promise<void>;
}

const initialFormState: RavitaillementFormState = {
  dateSituation: "",
  dateRavitaillement: "",
  vehiculeId: "",
  montantPrevu: "",
  montantRavitaille: "",
  statut: "EN_ATTEND_SITUATION",
  nLiter: "",
};

const statutOptions: Array<{
  value: StatutRavitaillementVehicule;
  label: string;
  tone: string;
}> = [
  {
    value: "EN_ATTEND_SITUATION",
    label: "En attente situation",
    tone: "bg-amber-100 text-amber-800 border border-amber-200",
  },
  {
    value: "VALIDE",
    label: "Valide",
    tone: "bg-green-100 text-green-800 border border-green-200",
  },
  {
    value: "EN_COURS",
    label: "En cours",
    tone: "bg-orange-100 text-orange-800 border border-orange-200",
  },
  {
    value: "BON_RETOUNREE",
    label: "Bon retournee",
    tone: "bg-blue-100 text-blue-800 border border-blue-200",
  },
  {
    value: "CASH",
    label: "Cash",
    tone: "bg-purple-100 text-purple-800 border border-purple-200",
  },
];

interface ActionIconButtonProps {
  label: string;
  onClick: () => void;
  children: ReactNode;
  className: string;
  disabled?: boolean;
}

function ActionIconButton({
  label,
  onClick,
  children,
  className,
  disabled = false,
}: ActionIconButtonProps) {
  return (
    <div className="relative group">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        title={label}
        className={`h-10 w-10 inline-flex items-center justify-center rounded-xl border transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      >
        {children}
      </button>
      <div className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-gray-900 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
        {label}
      </div>
    </div>
  );
}

function LoadingIcon() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

function normalizeDateValue(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    const [day, month, year] = value.split("/");
    return `${year}-${month}-${day}`;
  }

  return value;
}

function formatDateForDisplay(value: string | null | undefined) {
  const normalized = normalizeDateValue(value);
  const date = normalized ? new Date(`${normalized}T00:00:00`) : null;

  if (!date || Number.isNaN(date.getTime())) {
    return value || "-";
  }

  return date.toLocaleDateString("fr-FR");
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function validateRavitaillementDraft(payload: RavitaillementDraft) {
  const errors: string[] = [];

  if (!payload.dateSituation && !payload.dateRavitaillement) {
    errors.push("Renseignez au moins une date : date situation ou date ravitaillement.");
  }

  if (!payload.vehiculeId) {
    errors.push("Le vehicule est obligatoire.");
  }

  if (!payload.statut) {
    errors.push("Le statut est obligatoire.");
  }

  if (Number.isNaN(payload.montantPrevu) || payload.montantPrevu < 0) {
    errors.push("Le montant prevu doit etre un nombre positif ou nul.");
  }

  if (Number.isNaN(payload.montantRavitaille) || payload.montantRavitaille < 0) {
    errors.push("Le montant ravitaille doit etre un nombre positif ou nul.");
  }

  if (Number.isNaN(payload.nLiter) || payload.nLiter < 0) {
    errors.push("Le nombre de litres doit etre un nombre positif ou nul.");
  }

  return errors;
}

function getStatusForDateSituation(
  dateSituation: string | null,
  statut: StatutRavitaillementVehicule
) {
  if (!dateSituation) {
    return "EN_ATTEND_SITUATION";
  }

  if (statut === "EN_ATTEND_SITUATION") {
    return "EN_COURS";
  }

  return statut;
}

export default function RavitaillementVehiculePage() {
  const { user } = useAuthContext();
  const {
    ravitaillements,
    loading,
    addRavitaillementVehicule,
    updateRavitaillementVehicule,
    updateRavitaillementVehiculeStatut,
    deleteRavitaillementVehicule,
  } = useRavitaillementsVehicule();
  const { allVehicules, loading: vehiculesLoading } = useVehicules();

  const [search, setSearch] = useState("");
  const [dateFilterField, setDateFilterField] = useState<DateFilterField>("dateSituation");
  const [dateFilterFrom, setDateFilterFrom] = useState("");
  const [dateFilterTo, setDateFilterTo] = useState("");
  const [statutFilter, setStatutFilter] = useState<StatutFilter>("ALL");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRavitaillement, setEditingRavitaillement] = useState<RavitaillementVehicule | null>(null);
  const [form, setForm] = useState<RavitaillementFormState>(initialFormState);
  const [quickActionKey, setQuickActionKey] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const isViewer = user?.role === "viewer";

  const displayedRavitaillements = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return ravitaillements.filter((item) => {
      const matchesSearch =
        !normalizedSearch ||
        [
          item.vehicule?.vehicule || "",
          item.vehicule?.matricule || "",
          item.vehicule?.chauffeurResponsable || "",
          item.vehicule?.zone || "",
          item.statut,
        ].some((value) => value.toLowerCase().includes(normalizedSearch));

      const itemDate = normalizeDateValue(item[dateFilterField]);
      const matchesDateFrom = !dateFilterFrom || (!!itemDate && itemDate >= dateFilterFrom);
      const matchesDateTo = !dateFilterTo || (!!itemDate && itemDate <= dateFilterTo);
      const matchesDate = matchesDateFrom && matchesDateTo;

      const matchesStatut =
        statutFilter === "ALL" || item.statut === statutFilter;

      return matchesSearch && matchesDate && matchesStatut;
    });
  }, [dateFilterField, dateFilterFrom, dateFilterTo, ravitaillements, search, statutFilter]);

  const stats = {
    total: displayedRavitaillements.length,
    litres: displayedRavitaillements.reduce((sum, item) => sum + item.nLiter, 0),
    montantPrevu: displayedRavitaillements.reduce((sum, item) => sum + item.montantPrevu, 0),
    montantRavitaille: displayedRavitaillements.reduce((sum, item) => sum + item.montantRavitaille, 0),
  };
  const isDateSituationMissing = form.dateSituation.trim() === "";

  function updateForm<K extends keyof RavitaillementFormState>(
    key: K,
    value: RavitaillementFormState[K]
  ) {
    setForm((prev) => {
      const nextForm = { ...prev, [key]: value };

      if (key === "dateSituation") {
        nextForm.statut = getStatusForDateSituation(
          String(value).trim() || null,
          prev.statut
        );
      }

      return nextForm;
    });
  }

  function openAddModal() {
    setEditingRavitaillement(null);
    setForm(initialFormState);
    setIsModalOpen(true);
  }

  function openEditModal(item: RavitaillementVehicule) {
    const normalizedDateSituation = normalizeDateValue(item.dateSituation);

    setEditingRavitaillement(item);
    setForm({
      dateSituation: normalizedDateSituation,
      dateRavitaillement: normalizeDateValue(item.dateRavitaillement),
      vehiculeId: String(item.vehiculeId),
      montantPrevu: String(item.montantPrevu),
      montantRavitaille: String(item.montantRavitaille),
      statut: getStatusForDateSituation(normalizedDateSituation || null, item.statut),
      nLiter: String(item.nLiter),
    });
    setIsModalOpen(true);
  }

  function requestConfirmation(payload: PendingConfirmation) {
    setPendingConfirmation(payload);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedDateSituation = form.dateSituation.trim() || null;
    const normalizedDateRavitaillement = form.dateRavitaillement.trim() || null;

    const payload: RavitaillementDraft = {
      dateSituation: normalizedDateSituation,
      dateRavitaillement: normalizedDateRavitaillement,
      vehiculeId: Number(form.vehiculeId),
      montantPrevu: Number(form.montantPrevu),
      montantRavitaille: Number(form.montantRavitaille),
      statut: getStatusForDateSituation(normalizedDateSituation, form.statut),
      nLiter: Number(form.nLiter),
    };

    const validationErrors = validateRavitaillementDraft(payload);
    if (validationErrors.length > 0) {
      alert(validationErrors.join("\n"));
      return;
    }

    try {
      if (editingRavitaillement) {
        const currentItem = editingRavitaillement;
        requestConfirmation({
          title: "Confirmer la modification",
          description: `Vous allez modifier le ravitaillement du ${formatDateForDisplay(
            payload.dateRavitaillement || payload.dateSituation
          )} pour ${currentItem.vehicule?.vehicule || "ce vehicule"}.`,
          confirmLabel: "Confirmer la modification",
          tone: "warning",
          onConfirm: async () => {
            await updateRavitaillementVehicule({
              ...currentItem,
              ...payload,
            });
            setForm(initialFormState);
            setEditingRavitaillement(null);
            setIsModalOpen(false);
          },
        });
      } else {
        await addRavitaillementVehicule(payload);
        setForm(initialFormState);
        setEditingRavitaillement(null);
        setIsModalOpen(false);
      }
    } catch (error) {
      console.error(error);
      alert("Une erreur est survenue lors de l'enregistrement du ravitaillement.");
    }
  }

  async function handleQuickStatusChange(
    item: RavitaillementVehicule,
    statut: StatutRavitaillementVehicule
  ) {
    const normalizedDateSituation = normalizeDateValue(item.dateSituation) || null;

    if (!normalizedDateSituation && statut !== "EN_ATTEND_SITUATION") {
      alert("Sans date situation, le statut doit rester sur En attente situation.");
      return;
    }

    const payload: RavitaillementDraft = {
      dateSituation: normalizedDateSituation,
      dateRavitaillement: normalizeDateValue(item.dateRavitaillement) || null,
      vehiculeId: item.vehiculeId,
      montantPrevu: item.montantPrevu,
      montantRavitaille: item.montantRavitaille,
      statut,
      nLiter: item.nLiter,
    };

    const validationErrors = validateRavitaillementDraft(payload);
    if (validationErrors.length > 0) {
      alert(validationErrors.join("\n"));
      return;
    }

    const actionKey = `${item.id}-${statut}`;
    requestConfirmation({
      title: "Confirmer le changement de statut",
      description: `Vous allez passer le ravitaillement de ${item.vehicule?.vehicule || "ce vehicule"} au statut ${statut}.`,
      confirmLabel: "Confirmer le statut",
      tone: "warning",
      onConfirm: async () => {
        setQuickActionKey(actionKey);
        try {
          await updateRavitaillementVehiculeStatut(item.id, statut);
        } finally {
          setQuickActionKey(null);
        }
      },
    });
  }

  async function handleDelete(item: RavitaillementVehicule) {
    requestConfirmation({
      title: "Confirmer la suppression",
      description: `Vous allez supprimer le ravitaillement du ${formatDateForDisplay(
        item.dateRavitaillement || item.dateSituation
      )} pour ${item.vehicule?.vehicule || "ce vehicule"}. Cette action est sensible.`,
      confirmLabel: "Confirmer la suppression",
      tone: "danger",
      onConfirm: async () => {
        try {
          await deleteRavitaillementVehicule(item.id);
        } catch (error) {
          console.error(error);
          alert("Erreur lors de la suppression du ravitaillement.");
        }
      },
    });
  }

  function getStatutMeta(statut: StatutRavitaillementVehicule) {
    return (
      statutOptions.find((option) => option.value === statut) || statutOptions[0]
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-teal-50 to-orange-50 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-r from-green-500 to-teal-600 rounded-xl shadow-lg">
                <span className="text-2xl">R</span>
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Ravitaillements vehicules</h1>
                <p className="text-gray-600 mt-1">
                  Suivez les montants prevus, les montants reels et les statuts des ravitaillements.
                </p>
              </div>
            </div>

            {!isViewer && (
              <button
                onClick={openAddModal}
                className="bg-gradient-to-r from-green-500 to-teal-600 text-white px-6 py-3 rounded-xl hover:from-green-600 hover:to-teal-700 transition-all duration-200 shadow-lg hover:shadow-xl flex items-center gap-2 font-medium"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Ajouter un ravitaillement
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mt-8">
            <div className="bg-green-50 border border-green-200 rounded-2xl p-5">
              <p className="text-sm text-green-700 font-medium">Ravitaillements affiches</p>
              <p className="text-3xl font-bold text-green-900 mt-2">{stats.total}</p>
            </div>
            <div className="bg-teal-50 border border-teal-200 rounded-2xl p-5">
              <p className="text-sm text-teal-700 font-medium">Litres ravitailles</p>
              <p className="text-3xl font-bold text-teal-900 mt-2">{formatNumber(stats.litres)}</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
              <p className="text-sm text-amber-700 font-medium">Montant prevu</p>
              <p className="text-3xl font-bold text-amber-900 mt-2">{formatNumber(stats.montantPrevu)}</p>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5">
              <p className="text-sm text-orange-700 font-medium">Montant ravitaille</p>
              <p className="text-3xl font-bold text-orange-900 mt-2">{formatNumber(stats.montantRavitaille)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-2 relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Rechercher par vehicule, matricule, chauffeur ou zone..."
                className="pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200 w-full bg-white shadow-sm"
              />
            </div>

            <select
              value={dateFilterField}
              onChange={(event) => setDateFilterField(event.target.value as DateFilterField)}
              className="px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200 bg-white"
            >
              <option value="dateSituation">Date situation</option>
              <option value="dateRavitaillement">Date ravitaillement</option>
            </select>

            <input
              type="date"
              value={dateFilterFrom}
              onChange={(event) => setDateFilterFrom(event.target.value)}
              className="px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200 bg-white"
            />

            <input
              type="date"
              value={dateFilterTo}
              onChange={(event) => setDateFilterTo(event.target.value)}
              className="px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200 bg-white"
            />
          </div>

          <p className="mt-4 text-sm text-gray-500">
            Filtrez par intervalle de dates : de la premiere date jusqu'a la deuxieme.
          </p>

          <div className="flex flex-wrap gap-3 mt-4">
            <button
              onClick={() => setStatutFilter("ALL")}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                statutFilter === "ALL"
                  ? "bg-gradient-to-r from-green-500 to-teal-600 text-white shadow-lg"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Tous
            </button>
            {statutOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setStatutFilter(option.value)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                  statutFilter === option.value
                    ? "bg-gradient-to-r from-green-500 to-teal-600 text-white shadow-lg"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {!isViewer && (
            <p className="mt-4 text-sm text-gray-500">
              Actions rapides disponibles dans le tableau : En cours, Valider, Bon retournee et Cash.
            </p>
          )}
        </div>

        {!vehiculesLoading && allVehicules.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-amber-900">
            {isViewer
              ? "Aucun vehicule n'est disponible pour l'instant."
              : "Aucun vehicule n'est disponible pour l'instant. Creez d'abord un vehicule avant d'ajouter un ravitaillement."}
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-green-50 to-teal-100 border-b border-green-200">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-green-800 uppercase tracking-wider">
                    Dates
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-green-800 uppercase tracking-wider">
                    Vehicule
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-green-800 uppercase tracking-wider">
                    Zone
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-green-800 uppercase tracking-wider">
                    Montants
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-green-800 uppercase tracking-wider">
                    Litres
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-green-800 uppercase tracking-wider">
                    Statut
                  </th>
                  {!isViewer && (
                    <th className="px-6 py-4 text-center text-sm font-semibold text-green-800 uppercase tracking-wider">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={isViewer ? 6 : 7} className="px-6 py-12 text-center">
                      <div className="flex justify-center items-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
                        <span className="ml-3 text-gray-600">Chargement des ravitaillements...</span>
                      </div>
                    </td>
                  </tr>
                ) : displayedRavitaillements.length === 0 ? (
                  <tr>
                    <td colSpan={isViewer ? 6 : 7} className="px-6 py-12 text-center">
                      <div className="text-center">
                        <h3 className="text-lg font-medium text-gray-900">Aucun ravitaillement</h3>
                        <p className="mt-1 text-gray-500">
                          {isViewer
                            ? "Ajustez vos filtres pour afficher des resultats."
                            : "Ajoutez un ravitaillement ou ajustez vos filtres pour afficher des resultats."}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  displayedRavitaillements.map((item) => {
                    const statutMeta = getStatutMeta(item.statut);
                    const isRowDateSituationMissing =
                      normalizeDateValue(item.dateSituation) === "";

                    return (
                      <tr key={item.id} className="hover:bg-gray-50 transition-colors duration-150">
                        <td className="px-6 py-4 text-gray-700">
                          <div className="font-medium">
                            Sit.: {formatDateForDisplay(item.dateSituation)}
                          </div>
                          <div className="text-sm text-gray-500">
                            Rav.: {formatDateForDisplay(item.dateRavitaillement)}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-semibold text-gray-900">
                            {item.vehicule?.vehicule || "Vehicule indisponible"}
                          </div>
                          <div className="text-sm text-gray-500">
                            {item.vehicule?.matricule || "-"}
                          </div>
                          <div className="text-sm text-gray-500">
                            {item.vehicule?.chauffeurResponsable || "-"}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-gray-700">{item.vehicule?.zone || "-"}</td>
                        <td className="px-6 py-4 text-gray-700">
                          <div>Prevu: {formatNumber(item.montantPrevu)}</div>
                          <div>Rav.: {formatNumber(item.montantRavitaille)}</div>
                        </td>
                        <td className="px-6 py-4 text-gray-700">{formatNumber(item.nLiter)}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${statutMeta.tone}`}>
                            {statutMeta.label}
                          </span>
                        </td>
                        {!isViewer && (
                          <td className="px-6 py-4">
                            <div className="flex flex-wrap justify-center gap-2">
                              <ActionIconButton
                              label="Passer en cours"
                              onClick={() => handleQuickStatusChange(item, "EN_COURS")}
                              disabled={
                                item.statut === "EN_COURS" ||
                                quickActionKey !== null ||
                                isRowDateSituationMissing
                              }
                              className="text-orange-700 bg-orange-50 hover:bg-orange-100 border-orange-200"
                            >
                              {quickActionKey === `${item.id}-EN_COURS` ? (
                                <LoadingIcon />
                              ) : (
                                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                                  <circle cx="12" cy="12" r="9" strokeWidth="2" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 7v5l3 2" />
                                </svg>
                              )}
                              </ActionIconButton>
                              <ActionIconButton
                              label="Valider"
                              onClick={() => handleQuickStatusChange(item, "VALIDE")}
                              disabled={
                                item.statut === "VALIDE" ||
                                quickActionKey !== null ||
                                isRowDateSituationMissing
                              }
                              className="text-green-700 bg-green-50 hover:bg-green-100 border-green-200"
                            >
                              {quickActionKey === `${item.id}-VALIDE` ? (
                                <LoadingIcon />
                              ) : (
                                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 12l4 4L19 6" />
                                </svg>
                              )}
                              </ActionIconButton>
                              <ActionIconButton
                              label="Bon retournee"
                              onClick={() => handleQuickStatusChange(item, "BON_RETOUNREE")}
                              disabled={
                                item.statut === "BON_RETOUNREE" ||
                                quickActionKey !== null ||
                                isRowDateSituationMissing
                              }
                              className="text-blue-700 bg-blue-50 hover:bg-blue-100 border-blue-200"
                            >
                              {quickActionKey === `${item.id}-BON_RETOUNREE` ? (
                                <LoadingIcon />
                              ) : (
                                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 8H5v4" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12a7 7 0 101.9-4.8" />
                                </svg>
                              )}
                              </ActionIconButton>
                              <ActionIconButton
                              label="Passer cash"
                              onClick={() => handleQuickStatusChange(item, "CASH")}
                              disabled={
                                item.statut === "CASH" ||
                                quickActionKey !== null ||
                                isRowDateSituationMissing
                              }
                              className="text-purple-700 bg-purple-50 hover:bg-purple-100 border-purple-200"
                            >
                              {quickActionKey === `${item.id}-CASH` ? (
                                <LoadingIcon />
                              ) : (
                                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                                  <rect x="3" y="6" width="18" height="12" rx="2" strokeWidth="2" />
                                  <circle cx="12" cy="12" r="2.5" strokeWidth="2" />
                                </svg>
                              )}
                              </ActionIconButton>
                              <ActionIconButton
                              label="Modifier"
                              onClick={() => openEditModal(item)}
                              className="text-amber-700 bg-amber-50 hover:bg-amber-100 border-amber-200"
                            >
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 20h4l10-10-4-4L4 16v4z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l4 4" />
                              </svg>
                              </ActionIconButton>
                              <ActionIconButton
                              label="Supprimer"
                              onClick={() => handleDelete(item)}
                              className="text-red-700 bg-red-50 hover:bg-red-100 border-red-200"
                            >
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 7h12" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 7V5h6v2" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7l1 12h6l1-12" />
                              </svg>
                              </ActionIconButton>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="w-full h-1 bg-gradient-to-r from-amber-400 via-orange-500 to-green-600 rounded-full opacity-80"></div>

        <Modal
          isOpen={!isViewer && isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={editingRavitaillement ? "Modifier le ravitaillement" : "Nouveau ravitaillement"}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="date-situation" className="block text-sm font-medium text-gray-700 mb-2">
                  Date situation
                </label>
                <input
                  id="date-situation"
                  type="date"
                  value={form.dateSituation}
                  onChange={(event) => updateForm("dateSituation", event.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200"
                />
              </div>

              <div>
                <label htmlFor="date-ravitaillement" className="block text-sm font-medium text-gray-700 mb-2">
                  Date ravitaillement
                </label>
                <input
                  id="date-ravitaillement"
                  type="date"
                  value={form.dateRavitaillement}
                  onChange={(event) => updateForm("dateRavitaillement", event.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200"
                />
                <p className="mt-2 text-sm text-gray-500">
                  Au moins une des deux dates est obligatoire.
                </p>
              </div>
            </div>

            <div>
              <label htmlFor="vehicule-id" className="block text-sm font-medium text-gray-700 mb-2">
                Vehicule
              </label>
              <SearchableVehiculeSelect
                vehicules={allVehicules}
                value={form.vehiculeId}
                onChange={(nextValue) => updateForm("vehiculeId", nextValue)}
                disabled={allVehicules.length === 0}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="montant-prevu" className="block text-sm font-medium text-gray-700 mb-2">
                  Montant prevu
                </label>
                <input
                  id="montant-prevu"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.montantPrevu}
                  onChange={(event) => updateForm("montantPrevu", event.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200"
                  placeholder="0"
                />
              </div>

              <div>
                <label htmlFor="montant-ravitaille" className="block text-sm font-medium text-gray-700 mb-2">
                  Montant ravitaille
                </label>
                <input
                  id="montant-ravitaille"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.montantRavitaille}
                  onChange={(event) => updateForm("montantRavitaille", event.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200"
                  placeholder="0"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="n-liter" className="block text-sm font-medium text-gray-700 mb-2">
                  Nombre de litres
                </label>
                <input
                  id="n-liter"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.nLiter}
                  onChange={(event) => updateForm("nLiter", event.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200"
                  placeholder="0"
                />
              </div>

              <div>
                <label htmlFor="statut" className="block text-sm font-medium text-gray-700 mb-2">
                  Statut
                </label>
                <select
                  id="statut"
                  value={form.statut}
                  onChange={(event) =>
                    updateForm("statut", event.target.value as StatutRavitaillementVehicule)
                  }
                  disabled={isDateSituationMissing}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200 bg-white disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                >
                  {statutOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {isDateSituationMissing && (
                  <p className="mt-2 text-sm text-amber-700">
                    Sans date situation, le statut est force sur En attente situation.
                  </p>
                )}
                {!isDateSituationMissing && form.statut === "EN_COURS" && (
                  <p className="mt-2 text-sm text-teal-700">
                    Avec une date situation, le statut passe automatiquement a En cours.
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-6 py-3 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all duration-200 font-medium"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="px-6 py-3 bg-gradient-to-r from-green-500 to-teal-600 text-white rounded-xl hover:from-green-600 hover:to-teal-700 transition-all duration-200 shadow-lg font-medium"
              >
                {editingRavitaillement ? "Enregistrer" : "Ajouter"}
              </button>
            </div>
          </form>
        </Modal>

        <ConfirmationCodeModal
          isOpen={!isViewer && pendingConfirmation !== null}
          onClose={() => setPendingConfirmation(null)}
          onConfirm={async () => {
            if (pendingConfirmation) {
              await pendingConfirmation.onConfirm();
            }
          }}
          title={pendingConfirmation?.title || ""}
          description={pendingConfirmation?.description || ""}
          confirmLabel={pendingConfirmation?.confirmLabel || "Confirmer"}
          tone={pendingConfirmation?.tone || "danger"}
        />
      </div>
    </div>
  );
}
