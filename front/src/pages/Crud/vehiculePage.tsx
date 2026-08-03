import type { FormEvent } from "react";
import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useAuthContext } from "@/context/AuthProvider";
import { useVehicules } from "@/hooks/useVehicule";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import type { Vehicule } from "@/types";

interface VehiculeFormState {
  vehicule: string;
  matricule: string;
  utilisationAffectation: string;
  chauffeurResponsable: string;
  zone: string;
  zoneAutre: string;
  centre: string;
}

const normalizeZone = (zone: string) => zone?.trim().toLowerCase();

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const ZONES_FIXES = ["Zone A", "Zone B", "RX&SYS", "FO", "CPDE"] as const;

const initialFormState: VehiculeFormState = {
  vehicule: "",
  matricule: "",
  utilisationAffectation: "",
  chauffeurResponsable: "",
  zone: "Zone A",
  zoneAutre: "",
  centre: "",
};

export default function VehiculePage() {
  const { user } = useAuthContext();
  const {
    vehicules,
    loading,
    reload,
    search,
    setSearch,
    centreFilter,
    setCentreFilter,
    centresDisponibles,
    addVehicule,
    updateVehicule,
    deleteVehicule,
  } = useVehicules();
  useRealtimeSync({ onDemandesChange: reload });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVehicule, setEditingVehicule] = useState<Vehicule | null>(null);
  const [form, setForm] = useState<VehiculeFormState>(initialFormState);
  const isDG     = user?.role === "signataire" && user?.circuit_role === "directeur_general";
  const isViewer = user?.role === "viewer" || isDG;

  const stats = {
    total: vehicules.length,
    zones: new Set(vehicules.map((item) => item.zone).filter(Boolean)).size,
    chauffeurs: vehicules.filter((item) => item.chauffeurResponsable?.trim()).length,
  };

  function openAddModal() {
    setEditingVehicule(null);
    setForm(initialFormState);
    setIsModalOpen(true);
  }

  function openEditModal(item: Vehicule) {
    setEditingVehicule(item);
    const isKnownZone = (ZONES_FIXES as readonly string[]).map(normalizeZone).includes(normalizeZone(item.zone));
    setForm({
      vehicule: item.vehicule,
      matricule: item.matricule,
      utilisationAffectation: item.utilisationAffectation,
      chauffeurResponsable: item.chauffeurResponsable || "",
      zone: isKnownZone ? item.zone : "Autre",
      zoneAutre: isKnownZone ? "" : item.zone,
      centre: item.centre || "",
    });
    setIsModalOpen(true);
  }

  function updateForm<K extends keyof VehiculeFormState>(key: K, value: VehiculeFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const zoneValue = form.zone === "Autre" ? form.zoneAutre.trim() : form.zone.trim();
    const payload = {
      vehicule: form.vehicule.trim(),
      matricule: form.matricule.trim(),
      utilisationAffectation: form.utilisationAffectation.trim(),
      chauffeurResponsable: form.chauffeurResponsable.trim(),
      zone: zoneValue,
      centre: form.centre.trim() || null,
    };

    if (!payload.vehicule || !payload.matricule || !payload.utilisationAffectation || !payload.zone) {
      alert("Les champs vehicule, matricule, utilisation/affectation et zone sont obligatoires.");
      return;
    }

    try {
      if (editingVehicule) {
        await updateVehicule({
          ...editingVehicule,
          ...payload,
          chauffeurResponsable: payload.chauffeurResponsable || null,
        });
      } else {
        await addVehicule({
          ...payload,
          chauffeurResponsable: payload.chauffeurResponsable || null,
        });
      }

      setIsModalOpen(false);
      setForm(initialFormState);
      setEditingVehicule(null);
    } catch (error) {
      console.error(error);
      alert("Une erreur est survenue lors de l'enregistrement du vehicule.");
    }
  }

  // Impression / export PDF de la liste des vehicules telle qu'affichee
  // (recherche et filtre centre appliques).
  function handleDownloadPdf() {
    const printWindow = window.open("", "_blank", "width=1200,height=900");

    if (!printWindow) {
      alert("Impossible d'ouvrir la fenetre d'impression.");
      return;
    }

    const logoUrl = `${window.location.origin}/LOGO.webp`;

    const rowsHtml =
      vehicules.length === 0
        ? '<tr><td colspan="7" class="empty">Aucun vehicule ne correspond aux filtres.</td></tr>'
        : vehicules
            .map(
              (item, index) => `
                <tr>
                  <td>${index + 1}</td>
                  <td>${escapeHtml(item.vehicule)}</td>
                  <td>${escapeHtml(item.matricule)}</td>
                  <td>${escapeHtml(item.utilisationAffectation)}</td>
                  <td>${escapeHtml(item.chauffeurResponsable || "-")}</td>
                  <td>${escapeHtml(item.zone)}</td>
                  <td>${escapeHtml(item.centre || "-")}</td>
                </tr>
              `
            )
            .join("");

    printWindow.document.write(`
      <!doctype html>
      <html lang="fr">
        <head>
          <meta charset="utf-8" />
          <title>Liste des vehicules</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 24px;
              color: #1f2937;
            }
            .print-header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 24px;
              border-bottom: 3px solid #166534;
              padding-bottom: 16px;
              margin-bottom: 18px;
            }
            .print-header img {
              width: 80px;
              height: 80px;
              object-fit: contain;
              flex-shrink: 0;
            }
            .print-header-text {
              flex: 1;
              text-align: center;
            }
            .print-header-text h2,
            .print-header-text h3,
            .print-header-text h4 {
              margin: 0;
              font-weight: 700;
              color: #111827;
            }
            .print-header-text h2 {
              font-size: 20px;
              letter-spacing: 0.04em;
            }
            .print-header-text h3 {
              font-size: 16px;
              margin-top: 4px;
            }
            .print-header-text h4 {
              font-size: 15px;
              margin-top: 4px;
            }
            h1 {
              margin: 0 0 8px;
              font-size: 22px;
            }
            .date-line {
              margin: 0 0 16px;
              color: #4b5563;
              font-size: 13px;
            }
            .summary {
              margin-bottom: 20px;
              padding: 12px 16px;
              background: #ecfdf5;
              border: 1px solid #a7f3d0;
              border-radius: 12px;
              font-size: 13px;
              line-height: 1.7;
            }
            table {
              width: 100%;
              border-collapse: collapse;
            }
            th, td {
              border: 1px solid #d1d5db;
              padding: 10px 8px;
              text-align: left;
              vertical-align: top;
              font-size: 12px;
            }
            th {
              background: #166534;
              color: white;
            }
            .empty {
              text-align: center;
              color: #6b7280;
              font-style: italic;
              padding: 24px 8px;
            }
            tbody tr:nth-child(even) {
              background: #f9fafb;
            }
            @media print {
              @page {
                margin: 0;
                size: A4 landscape;
              }
              body {
                margin: 12px;
              }
            }
          </style>
        </head>
        <body>
          <div class="print-header">
            <img src="${logoUrl}" alt="Logo RIMATEL" />
            <div class="print-header-text">
              <h2>RIMATEL</h2>
              <h3>Direction Générale</h3>
              <h4>Cellule de Contrôle, Suivi &amp; Évaluation</h4>
            </div>
            <div style="width: 80px;"></div>
          </div>
          <h1>Liste des vehicules</h1>
          <p class="date-line">Edite le ${escapeHtml(new Date().toLocaleDateString("fr-FR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }))}</p>
          <div class="summary">
            <strong>Nombre de vehicules :</strong> ${vehicules.length}
            <br />
            <strong>Centre :</strong> ${escapeHtml(centreFilter || "Tous les centres")}
            <br />
            <strong>Recherche :</strong> ${escapeHtml(search.trim() || "Aucune")}
          </div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Vehicule</th>
                <th>Matricule</th>
                <th>Utilisation / Affectation</th>
                <th>Chauffeur</th>
                <th>Zone</th>
                <th>Centre</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  async function handleDelete(item: Vehicule) {
    const confirmed = window.confirm(
      `Supprimer le vehicule "${item.vehicule}" (${item.matricule}) ? Cette action est irreversible.`
    );

    if (!confirmed) {
      return;
    }

    try {
      await deleteVehicule(item.id);
    } catch (error) {
      console.error(error);
      alert("Erreur lors de la suppression du vehicule.");
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-teal-50 to-orange-50 p-3 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-r from-green-500 to-teal-600 rounded-xl shadow-lg">
                <span className="text-2xl">V</span>
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Parc vehicule</h1>
                <p className="text-gray-600 mt-1">
                  Creez et gerez les vehicules, matricules, affectations et zones.
                </p>
              </div>
            </div>

            {/* Barre d'actions — hauteur commune h-12 sur tous les elements
                (les bordures ne decalent pas la hauteur), pleine largeur sur
                mobile, alignes sur une meme ligne des sm. */}
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center lg:justify-end gap-3 w-full lg:w-auto">
              <div className="relative w-full sm:w-80">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Rechercher un vehicule..."
                  className="h-12 w-full pl-10 pr-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200 bg-white shadow-sm"
                />
              </div>

              <select
                value={centreFilter}
                onChange={(event) => setCentreFilter(event.target.value)}
                className="h-12 w-full sm:w-auto px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200 bg-white shadow-sm text-gray-700"
              >
                <option value="">Tous les centres</option>
                {centresDisponibles.map((centre) => (
                  <option key={centre} value={centre}>{centre}</option>
                ))}
              </select>

              <button
                onClick={handleDownloadPdf}
                className="h-12 w-full sm:w-auto px-6 inline-flex items-center justify-center gap-2 border border-green-300 text-green-700 bg-white rounded-xl hover:bg-green-50 transition-all duration-200 shadow-sm font-medium"
              >
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                </svg>
                Telecharger PDF
              </button>

              {!isViewer && (
                <button
                  onClick={openAddModal}
                  className="h-12 w-full sm:w-auto px-6 inline-flex items-center justify-center gap-2 bg-gradient-to-r from-green-500 to-teal-600 text-white rounded-xl hover:from-green-600 hover:to-teal-700 transition-all duration-200 shadow-lg hover:shadow-xl font-medium"
                >
                  <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Ajouter un vehicule
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
            <div className="bg-green-50 border border-green-200 rounded-2xl p-5">
              <p className="text-sm text-green-700 font-medium">Vehicules affiches</p>
              <p className="text-3xl font-bold text-green-900 mt-2">{stats.total}</p>
            </div>
            <div className="bg-teal-50 border border-teal-200 rounded-2xl p-5">
              <p className="text-sm text-teal-700 font-medium">Zones couvertes</p>
              <p className="text-3xl font-bold text-teal-900 mt-2">{stats.zones}</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
              <p className="text-sm text-amber-700 font-medium">Avec chauffeur renseigne</p>
              <p className="text-3xl font-bold text-amber-900 mt-2">{stats.chauffeurs}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-green-50 to-teal-100 border-b border-green-200">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-green-800 uppercase tracking-wider">
                    Vehicule
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-green-800 uppercase tracking-wider">
                    Matricule
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-green-800 uppercase tracking-wider">
                    Utilisation / Affectation
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-green-800 uppercase tracking-wider">
                    Chauffeur
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-green-800 uppercase tracking-wider">
                    Zone
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-green-800 uppercase tracking-wider">
                    Centre
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
                        <span className="ml-3 text-gray-600">Chargement des vehicules...</span>
                      </div>
                    </td>
                  </tr>
                ) : vehicules.length === 0 ? (
                  <tr>
                    <td colSpan={isViewer ? 6 : 7} className="px-6 py-12 text-center">
                      <div className="text-center">
                        <h3 className="text-lg font-medium text-gray-900">Aucun vehicule</h3>
                        <p className="mt-1 text-gray-500">
                          {isViewer
                            ? "Aucun vehicule disponible pour le moment."
                            : "Commencez par ajouter votre premier vehicule."}
                        </p>
                        {!isViewer && (
                          <button
                            onClick={openAddModal}
                            className="mt-4 inline-flex items-center px-4 py-2 text-sm font-medium rounded-md text-white bg-gradient-to-r from-green-500 to-teal-600 hover:from-green-600 hover:to-teal-700"
                          >
                            Ajouter un vehicule
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  vehicules.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50 transition-colors duration-150">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-gray-900">{item.vehicule}</div>
                      </td>
                      <td className="px-6 py-4 text-gray-700">{item.matricule}</td>
                      <td className="px-6 py-4 text-gray-700">{item.utilisationAffectation}</td>
                      <td className="px-6 py-4 text-gray-700">{item.chauffeurResponsable || "-"}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex px-3 py-1 rounded-full text-xs font-medium bg-teal-100 text-teal-800 border border-teal-200">
                          {item.zone}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-700">{item.centre || "-"}</td>
                      {!isViewer && (
                        <td className="px-6 py-4">
                          <div className="flex justify-center gap-2">
                            <button
                              onClick={() => openEditModal(item)}
                              className="px-3 py-2 text-sm font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-all duration-200"
                            >
                              Modifier
                            </button>
                            <button
                              onClick={() => handleDelete(item)}
                              className="px-3 py-2 text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-all duration-200"
                            >
                              Supprimer
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden">
            {loading ? (
              <div className="flex justify-center items-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500" />
                <span className="ml-3 text-gray-600">Chargement des vehicules...</span>
              </div>
            ) : vehicules.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <h3 className="text-lg font-medium text-gray-900">Aucun vehicule</h3>
                <p className="mt-1 text-gray-500 text-sm">
                  {isViewer
                    ? "Aucun vehicule disponible pour le moment."
                    : "Commencez par ajouter votre premier vehicule."}
                </p>
                {!isViewer && (
                  <button
                    onClick={openAddModal}
                    className="mt-4 inline-flex items-center px-4 py-2.5 text-sm font-medium rounded-xl text-white bg-gradient-to-r from-green-500 to-teal-600"
                  >
                    Ajouter un vehicule
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {vehicules.map((item) => (
                  <div key={item.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-gray-900 truncate">{item.vehicule}</p>
                        <p className="text-sm text-gray-500">{item.matricule}</p>
                      </div>
                      <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-teal-100 text-teal-800 border border-teal-200 flex-shrink-0">
                        {item.zone}
                      </span>
                    </div>
                    <div className="mt-2 space-y-1">
                      <p className="text-sm text-gray-600 truncate">
                        <span className="font-medium text-gray-700">Affectation : </span>
                        {item.utilisationAffectation}
                      </p>
                      {item.chauffeurResponsable && (
                        <p className="text-sm text-gray-600">
                          <span className="font-medium text-gray-700">Chauffeur : </span>
                          {item.chauffeurResponsable}
                        </p>
                      )}
                      {item.centre && (
                        <p className="text-sm text-gray-600">
                          <span className="font-medium text-gray-700">Centre : </span>
                          {item.centre}
                        </p>
                      )}
                    </div>
                    {!isViewer && (
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => openEditModal(item)}
                          className="flex-1 min-h-[44px] py-2.5 text-sm font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition-all"
                        >
                          Modifier
                        </button>
                        <button
                          onClick={() => handleDelete(item)}
                          className="flex-1 min-h-[44px] py-2.5 text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl transition-all"
                        >
                          Supprimer
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="w-full h-1 bg-gradient-to-r from-amber-400 via-orange-500 to-green-600 rounded-full opacity-80"></div>

        <Modal
          isOpen={!isViewer && isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={editingVehicule ? "Modifier le vehicule" : "Nouveau vehicule"}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="vehicule-nom" className="block text-sm font-medium text-gray-700 mb-2">
                Vehicule
              </label>
              <input
                id="vehicule-nom"
                type="text"
                value={form.vehicule}
                onChange={(event) => updateForm("vehicule", event.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200"
                placeholder="Ex: Toyota Hilux"
                autoFocus
              />
            </div>

            <div>
              <label htmlFor="vehicule-matricule" className="block text-sm font-medium text-gray-700 mb-2">
                Matricule
              </label>
              <input
                id="vehicule-matricule"
                type="text"
                value={form.matricule}
                onChange={(event) => updateForm("matricule", event.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200"
                placeholder="Ex: 1234-AB-01"
              />
            </div>

            <div>
              <label htmlFor="vehicule-affectation" className="block text-sm font-medium text-gray-700 mb-2">
                Utilisation / Affectation
              </label>
              <input
                id="vehicule-affectation"
                type="text"
                value={form.utilisationAffectation}
                onChange={(event) => updateForm("utilisationAffectation", event.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200"
                placeholder="Ex: Livraison, chantier, supervision..."
              />
            </div>

            <div>
              <label htmlFor="vehicule-chauffeur" className="block text-sm font-medium text-gray-700 mb-2">
                Chauffeur responsable
              </label>
              <input
                id="vehicule-chauffeur"
                type="text"
                value={form.chauffeurResponsable}
                onChange={(event) => updateForm("chauffeurResponsable", event.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200"
                placeholder="Optionnel"
              />
            </div>

            <div>
              <label htmlFor="vehicule-zone" className="block text-sm font-medium text-gray-700 mb-2">
                Zone
              </label>
              <select
                id="vehicule-zone"
                value={form.zone}
                onChange={(event) => updateForm("zone", event.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200 bg-white"
              >
                <option value="Zone A">Département Zone A (Zone A)</option>
                <option value="Zone B">Département Zone B (Zone B)</option>
                <option value="RX&SYS">Département Réseaux et Systèmes (RX&SYS)</option>
                <option value="FO">Département Fibre Optique (FO)</option>
                <option value="CPDE">Cellule de Pilotage de Déploiement et des Extensions (CPDE)</option>
                <option value="Autre">Autre</option>
              </select>
              {form.zone === "Autre" && (
                <input
                  type="text"
                  value={form.zoneAutre}
                  onChange={(event) => updateForm("zoneAutre", event.target.value)}
                  className="mt-2 w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200"
                  placeholder="Précisez la zone..."
                />
              )}
            </div>

            <div>
              <label htmlFor="vehicule-centre" className="block text-sm font-medium text-gray-700 mb-2">
                Centre
              </label>
              <input
                id="vehicule-centre"
                type="text"
                value={form.centre}
                onChange={(event) => updateForm("centre", event.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200"
                placeholder="Optionnel"
              />
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
                {editingVehicule ? "Enregistrer" : "Ajouter"}
              </button>
            </div>
          </form>
        </Modal>
      </div>
    </div>
  );
}
