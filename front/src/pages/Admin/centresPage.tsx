import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useCentres } from "@/hooks/useCentres";
import { apiErrorMessage } from "@/lib/api";
import type { Centre, ZoneCentre } from "@/types";

const ZONES: ZoneCentre[] = ["Zone A", "Zone B"];
const CODE_REGEX = /^[A-Z0-9_-]+$/;

const INPUT =
  "w-full h-12 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200 bg-white";

interface FormState {
  code: string;
  nom: string;
  zone: ZoneCentre;
  actif: boolean;
}

const initialForm: FormState = { code: "", nom: "", zone: "Zone A", actif: true };

export default function CentresPage() {
  const { centres, loading, error, createCentre, updateCentre } = useCentres(false);

  const [search, setSearch] = useState("");
  const [zoneFilter, setZoneFilter] = useState<"" | ZoneCentre>("");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<FormState>(initialForm);
  const [editTarget, setEditTarget] = useState<Centre | null>(null);
  const [editForm, setEditForm] = useState<Omit<FormState, "code">>({ nom: "", zone: "Zone A", actif: true });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return centres.filter((c) => {
      if (zoneFilter && c.zone !== zoneFilter) return false;
      if (!q) return true;
      return c.code.toLowerCase().includes(q) || c.nom.toLowerCase().includes(q);
    });
  }, [centres, search, zoneFilter]);

  const stats = {
    total: centres.length,
    actifs: centres.filter((c) => c.actif).length,
    zoneA: centres.filter((c) => c.zone === "Zone A").length,
    zoneB: centres.filter((c) => c.zone === "Zone B").length,
  };

  function openCreate() {
    setForm(initialForm);
    setFormError(null);
    setCreateOpen(true);
  }

  function openEdit(c: Centre) {
    setEditTarget(c);
    setEditForm({ nom: c.nom, zone: c.zone, actif: c.actif });
    setFormError(null);
  }

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = form.code.trim().toUpperCase();
    if (!code || !CODE_REGEX.test(code)) {
      setFormError('Code invalide : majuscules, chiffres, "_" ou "-" uniquement, sans espaces.');
      return;
    }
    if (!form.nom.trim()) {
      setFormError("Le nom est obligatoire.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await createCentre({ code, nom: form.nom.trim(), zone: form.zone, actif: form.actif });
      setCreateOpen(false);
    } catch (err) {
      setFormError(apiErrorMessage(err, "Erreur lors de la création du centre."));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editTarget) return;
    if (!editForm.nom.trim()) {
      setFormError("Le nom est obligatoire.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await updateCentre(editTarget.code, { nom: editForm.nom.trim(), zone: editForm.zone, actif: editForm.actif });
      setEditTarget(null);
    } catch (err) {
      setFormError(apiErrorMessage(err, "Erreur lors de la modification du centre."));
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActif(c: Centre) {
    const action = c.actif ? "désactiver" : "réactiver";
    if (!window.confirm(`Voulez-vous ${action} le centre ${c.code} ?`)) return;
    try {
      await updateCentre(c.code, { actif: !c.actif });
    } catch (err) {
      alert(apiErrorMessage(err, "Erreur lors de la mise à jour."));
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-teal-50 to-orange-50 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* En-tête */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-r from-green-500 to-teal-600 rounded-xl shadow-lg">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Centres</h1>
                <p className="text-gray-600 mt-1">
                  Centres RIMATEL utilisés pour les véhicules, les demandes et les comptes (chef de centre, station).
                </p>
              </div>
            </div>
            <button
              onClick={openCreate}
              className="h-12 bg-gradient-to-r from-green-500 to-teal-600 text-white px-6 rounded-xl hover:from-green-600 hover:to-teal-700 transition-all duration-200 shadow-lg hover:shadow-xl flex items-center gap-2 font-medium"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Ajouter un centre
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
            <div className="bg-green-50 border border-green-200 rounded-2xl p-5">
              <p className="text-sm text-green-700 font-medium">Centres</p>
              <p className="text-3xl font-bold text-green-900 mt-2">{stats.total}</p>
            </div>
            <div className="bg-teal-50 border border-teal-200 rounded-2xl p-5">
              <p className="text-sm text-teal-700 font-medium">Actifs</p>
              <p className="text-3xl font-bold text-teal-900 mt-2">{stats.actifs}</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
              <p className="text-sm text-emerald-700 font-medium">Zone A</p>
              <p className="text-3xl font-bold text-emerald-900 mt-2">{stats.zoneA}</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
              <p className="text-sm text-amber-700 font-medium">Zone B</p>
              <p className="text-3xl font-bold text-amber-900 mt-2">{stats.zoneB}</p>
            </div>
          </div>
        </div>

        {/* Filtres */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par code ou nom..."
            className={`${INPUT} md:col-span-2`}
          />
          <select
            value={zoneFilter}
            onChange={(e) => setZoneFilter(e.target.value as "" | ZoneCentre)}
            className={INPUT}
          >
            <option value="">Toutes les zones</option>
            {ZONES.map((z) => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>
        </div>

        {/* Tableau */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-green-50 to-teal-100 border-b border-green-200">
                <tr>
                  {["Code", "Nom", "Zone", "Statut"].map((h) => (
                    <th key={h} className="px-6 py-4 text-left text-sm font-semibold text-green-800 uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                  <th className="px-6 py-4 text-center text-sm font-semibold text-green-800 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center">
                      <div className="flex justify-center items-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500" />
                        <span className="ml-3 text-gray-600">Chargement des centres...</span>
                      </div>
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-red-600">{error}</td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500">Aucun centre.</td>
                  </tr>
                ) : (
                  filtered.map((c) => (
                    <tr key={c.code} className={`hover:bg-gray-50 transition-colors ${c.actif ? "" : "opacity-60"}`}>
                      <td className="px-6 py-4 font-mono font-semibold text-gray-900">{c.code}</td>
                      <td className="px-6 py-4 text-gray-700">{c.nom}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex px-3 py-1 rounded-full text-xs font-medium border ${
                            c.zone === "Zone A"
                              ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                              : "bg-amber-100 text-amber-800 border-amber-200"
                          }`}
                        >
                          {c.zone}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex px-3 py-1 rounded-full text-xs font-medium border ${
                            c.actif
                              ? "bg-green-100 text-green-800 border-green-200"
                              : "bg-gray-100 text-gray-600 border-gray-200"
                          }`}
                        >
                          {c.actif ? "Actif" : "Inactif"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap justify-center gap-2">
                          <button
                            onClick={() => openEdit(c)}
                            className="px-3 py-2 text-sm font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-all"
                          >
                            Modifier
                          </button>
                          <button
                            onClick={() => void toggleActif(c)}
                            className={`px-3 py-2 text-sm font-medium border rounded-lg transition-all ${
                              c.actif
                                ? "text-gray-700 bg-gray-100 hover:bg-gray-200 border-gray-200"
                                : "text-green-700 bg-green-50 hover:bg-green-100 border-green-200"
                            }`}
                          >
                            {c.actif ? "Désactiver" : "Réactiver"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="w-full h-1 bg-gradient-to-r from-amber-400 via-orange-500 to-green-600 rounded-full opacity-80" />

        {/* Création */}
        <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Nouveau centre">
          <form onSubmit={handleCreate} className="space-y-4">
            {formError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{formError}</div>
            )}
            <div>
              <label htmlFor="centre-code" className="block text-sm font-medium text-gray-700 mb-2">Code</label>
              <input
                id="centre-code"
                type="text"
                value={form.code}
                onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toUpperCase().replace(/\s+/g, "") }))}
                className={`${INPUT} font-mono`}
                placeholder="ex : TIDJIKJA"
                autoFocus
              />
              <p className="text-xs text-gray-500 mt-1">Majuscules, sans espaces. Le code ne pourra plus être modifié.</p>
            </div>
            <div>
              <label htmlFor="centre-nom" className="block text-sm font-medium text-gray-700 mb-2">Nom</label>
              <input
                id="centre-nom"
                type="text"
                value={form.nom}
                onChange={(e) => setForm((p) => ({ ...p, nom: e.target.value }))}
                className={INPUT}
                placeholder="ex : Tidjikja"
              />
            </div>
            <div>
              <label htmlFor="centre-zone" className="block text-sm font-medium text-gray-700 mb-2">Zone</label>
              <select
                id="centre-zone"
                value={form.zone}
                onChange={(e) => setForm((p) => ({ ...p, zone: e.target.value as ZoneCentre }))}
                className={INPUT}
              >
                {ZONES.map((z) => (
                  <option key={z} value={z}>{z}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-3 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.actif}
                onChange={(e) => setForm((p) => ({ ...p, actif: e.target.checked }))}
                className="w-5 h-5 rounded text-green-600 border-gray-300 focus:ring-green-500"
              />
              Centre actif
            </label>
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="h-12 px-6 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all font-medium"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="h-12 px-6 bg-gradient-to-r from-green-500 to-teal-600 text-white rounded-xl hover:from-green-600 hover:to-teal-700 transition-all shadow-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "Création..." : "Créer"}
              </button>
            </div>
          </form>
        </Modal>

        {/* Modification (jamais le code) */}
        <Modal isOpen={editTarget !== null} onClose={() => setEditTarget(null)} title="Modifier le centre">
          {editTarget && (
            <form onSubmit={handleUpdate} className="space-y-4">
              {formError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{formError}</div>
              )}
              <div>
                <label htmlFor="edit-centre-code" className="block text-sm font-medium text-gray-700 mb-2">Code</label>
                <input
                  id="edit-centre-code"
                  type="text"
                  value={editTarget.code}
                  disabled
                  className="w-full h-12 px-4 border border-gray-200 rounded-xl bg-gray-50 text-gray-500 font-mono"
                />
              </div>
              <div>
                <label htmlFor="edit-centre-nom" className="block text-sm font-medium text-gray-700 mb-2">Nom</label>
                <input
                  id="edit-centre-nom"
                  type="text"
                  value={editForm.nom}
                  onChange={(e) => setEditForm((p) => ({ ...p, nom: e.target.value }))}
                  className={INPUT}
                />
              </div>
              <div>
                <label htmlFor="edit-centre-zone" className="block text-sm font-medium text-gray-700 mb-2">Zone</label>
                <select
                  id="edit-centre-zone"
                  value={editForm.zone}
                  onChange={(e) => setEditForm((p) => ({ ...p, zone: e.target.value as ZoneCentre }))}
                  className={INPUT}
                >
                  {ZONES.map((z) => (
                    <option key={z} value={z}>{z}</option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-3 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={editForm.actif}
                  onChange={(e) => setEditForm((p) => ({ ...p, actif: e.target.checked }))}
                  className="w-5 h-5 rounded text-green-600 border-gray-300 focus:ring-green-500"
                />
                Centre actif
              </label>
              {!editForm.actif && editTarget.actif && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-900">
                  Un centre inactif n'est plus proposé à la création de demandes ni à l'affectation des comptes.
                  Les comptes et demandes existants ne sont pas modifiés.
                </div>
              )}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setEditTarget(null)}
                  className="h-12 px-6 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all font-medium"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="h-12 px-6 bg-gradient-to-r from-green-500 to-teal-600 text-white rounded-xl hover:from-green-600 hover:to-teal-700 transition-all shadow-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? "Enregistrement..." : "Enregistrer"}
                </button>
              </div>
            </form>
          )}
        </Modal>
      </div>
    </div>
  );
}
