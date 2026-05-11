import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useUsers } from "@/hooks/useUsers";
import { useAuthContext } from "@/context/AuthProvider";
import { supabaseAdmin } from "@/supabaseAdmin";
import type { AppRole } from "@/types";

type ManagedRole = Exclude<AppRole, "Admin">;

interface UserFormState {
  email: string;
  password: string;
  nom: string;
  prenom: string;
  role: ManagedRole;
}

interface EditUserFormState {
  id: string;
  email: string;
  nom: string;
  prenom: string;
  role: ManagedRole;
}

const initialFormState: UserFormState = {
  email: "",
  password: "",
  nom: "",
  prenom: "",
  role: "viewer",
};

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("fr-FR");
}

export default function UsersPage() {
  const {
    users,
    loading,
    submitting,
    createManagedUser,
    updateUserRole,
    updateManagedUser,
    deleteManagedUser,
  } = useUsers();
  const { user: currentUser } = useAuthContext();

  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [form, setForm] = useState<UserFormState>(initialFormState);
  const [editForm, setEditForm] = useState<EditUserFormState | null>(null);
  const [actionUserId, setActionUserId] = useState<string | null>(null);

  const [resetTarget, setResetTarget] = useState<{ id: string; email: string | null } | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [resetSubmitting, setResetSubmitting] = useState(false);

  const filteredUsers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return users.filter((item) => {
      if (!normalizedSearch) {
        return true;
      }

      return [
        item.email || "",
        item.nom || "",
        item.prenom || "",
        item.role,
      ].some((value) => value.toLowerCase().includes(normalizedSearch));
    });
  }, [search, users]);

  const stats = {
    total: filteredUsers.length,
    managers: filteredUsers.filter((item) => item.role === "MENAGER").length,
    viewers: filteredUsers.filter((item) => item.role === "viewer").length,
  };

  function updateForm<K extends keyof UserFormState>(key: K, value: UserFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openCreateModal() {
    setForm(initialFormState);
    setIsModalOpen(true);
  }

  function openEditModal(item: {
    id: string;
    email: string | null;
    nom: string | null;
    prenom: string | null;
    role: AppRole;
  }) {
    if (item.role === "Admin") {
      return;
    }

    setEditForm({
      id: item.id,
      email: item.email || "",
      nom: item.nom || "",
      prenom: item.prenom || "",
      role: item.role,
    });
    setIsEditModalOpen(true);
  }

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.email.trim()) {
      alert("L'email est obligatoire.");
      return;
    }

    if (form.password.trim().length < 6) {
      alert("Le mot de passe doit contenir au moins 6 caracteres.");
      return;
    }

    try {
      const result = await createManagedUser({
        email: form.email,
        password: form.password,
        nom: form.nom,
        prenom: form.prenom,
        role: form.role,
      });

      setForm(initialFormState);
      setIsModalOpen(false);

      if (result.requiresEmailConfirmation) {
        alert("Utilisateur cree. Une confirmation email est attendue avant sa premiere connexion.");
      } else {
        alert("Utilisateur cree avec succes.");
      }
    } catch (error: any) {
      console.error(error);
      alert(error?.message ?? "Erreur lors de la creation du compte.");
    }
  }

  async function handleRoleChange(id: string, role: ManagedRole) {
    setActionUserId(id);
    try {
      await updateUserRole(id, role);
    } catch (error: any) {
      console.error(error);
      alert(error?.message ?? "Erreur lors de la mise a jour du role.");
    } finally {
      setActionUserId(null);
    }
  }

  async function handleUpdateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editForm) {
      return;
    }

    try {
      await updateManagedUser({
        id: editForm.id,
        nom: editForm.nom,
        prenom: editForm.prenom,
        role: editForm.role,
      });
      setIsEditModalOpen(false);
      setEditForm(null);
    } catch (error: any) {
      console.error(error);
      alert(error?.message ?? "Erreur lors de la modification du user.");
    }
  }

  async function handleDeleteUser(id: string, email: string | null) {
    if (id === currentUser?.id) {
      alert("Vous ne pouvez pas supprimer votre propre compte depuis cette page.");
      return;
    }

    const confirmed = window.confirm(
      `Supprimer le user ${email || id} ?\n\nCela retirera son acces a l'application.`
    );

    if (!confirmed) {
      return;
    }

    setActionUserId(id);
    try {
      await deleteManagedUser(id);
    } catch (error: any) {
      console.error(error);
      alert(error?.message ?? "Erreur lors de la suppression du user.");
    } finally {
      setActionUserId(null);
    }
  }

  function openResetModal(item: { id: string; email: string | null }) {
    setResetTarget(item);
    setResetPassword("");
    setResetError(null);
    setResetSuccess(false);
  }

  async function handleResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resetTarget) return;
    if (resetPassword.length < 6) {
      setResetError("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    setResetError(null);
    setResetSubmitting(true);
    try {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(resetTarget.id, {
        password: resetPassword,
      });
      if (error) throw error;
      setResetSuccess(true);
      setResetPassword("");
    } catch (err: any) {
      setResetError(err?.message ?? "Erreur lors de la réinitialisation.");
    } finally {
      setResetSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-teal-50 to-orange-50 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-r from-green-500 to-teal-600 rounded-xl shadow-lg">
                <span className="text-2xl">U</span>
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Gestion des users</h1>
                <p className="text-gray-600 mt-1">
                  Creez des comptes MENAGER et viewer. Cette page est reservee a l'admin.
                </p>
              </div>
            </div>

            <button
              onClick={openCreateModal}
              className="bg-gradient-to-r from-green-500 to-teal-600 text-white px-6 py-3 rounded-xl hover:from-green-600 hover:to-teal-700 transition-all duration-200 shadow-lg hover:shadow-xl flex items-center gap-2 font-medium"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Ajouter un user
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
            <div className="bg-green-50 border border-green-200 rounded-2xl p-5">
              <p className="text-sm text-green-700 font-medium">Users affiches</p>
              <p className="text-3xl font-bold text-green-900 mt-2">{stats.total}</p>
            </div>
            <div className="bg-teal-50 border border-teal-200 rounded-2xl p-5">
              <p className="text-sm text-teal-700 font-medium">MENAGER</p>
              <p className="text-3xl font-bold text-teal-900 mt-2">{stats.managers}</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
              <p className="text-sm text-amber-700 font-medium">viewer</p>
              <p className="text-3xl font-bold text-amber-900 mt-2">{stats.viewers}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher par email, nom, prenom ou role..."
              className="pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200 w-full bg-white shadow-sm"
            />
          </div>

          <p className="mt-4 text-sm text-gray-500">
            Connecte en tant que: {currentUser?.email || currentUser?.id} ({currentUser?.role})
          </p>
          <p className="mt-2 text-sm text-amber-700">
            La suppression retire l'acces applicatif en supprimant le profil public de l'utilisateur.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-green-50 to-teal-100 border-b border-green-200">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-green-800 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-green-800 uppercase tracking-wider">
                    Identite
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-green-800 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-green-800 uppercase tracking-wider">
                    Cree le
                  </th>
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
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
                        <span className="ml-3 text-gray-600">Chargement des users...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center">
                      <div className="text-center">
                        <h3 className="text-lg font-medium text-gray-900">Aucun user</h3>
                        <p className="mt-1 text-gray-500">
                          Commencez par creer un compte MENAGER ou viewer.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50 transition-colors duration-150">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-gray-900">{item.email || "-"}</div>
                        <div className="text-sm text-gray-500">{item.id}</div>
                      </td>
                      <td className="px-6 py-4 text-gray-700">
                        <div>{item.nom || "-"}</div>
                        <div className="text-sm text-gray-500">{item.prenom || "-"}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${
                            item.role === "MENAGER"
                              ? "bg-teal-100 text-teal-800 border border-teal-200"
                              : item.role === "viewer"
                              ? "bg-gray-100 text-gray-700 border border-gray-200"
                              : "bg-green-100 text-green-800 border border-green-200"
                          }`}
                        >
                          {item.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-700">{formatDateTime(item.createdAt)}</td>
                      <td className="px-6 py-4">
                        {item.role === "Admin" ? (
                          <div className="text-center text-sm text-gray-500">Admin</div>
                        ) : (
                          <div className="flex flex-wrap justify-center gap-2">
                            <button
                              onClick={() => openEditModal(item)}
                              disabled={actionUserId !== null}
                              className="px-3 py-2 text-sm font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Modifier
                            </button>
                            <button
                              onClick={() => openResetModal(item)}
                              disabled={actionUserId !== null}
                              className="px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Réinit. mot de passe
                            </button>
                            <button
                              onClick={() => handleRoleChange(item.id, "MENAGER")}
                              disabled={actionUserId !== null || item.role === "MENAGER"}
                              className="px-3 py-2 text-sm font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              MENAGER
                            </button>
                            <button
                              onClick={() => handleRoleChange(item.id, "viewer")}
                              disabled={actionUserId !== null || item.role === "viewer"}
                              className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              viewer
                            </button>
                            <button
                              onClick={() => handleDeleteUser(item.id, item.email)}
                              disabled={actionUserId !== null}
                              className="px-3 py-2 text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Supprimer
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="w-full h-1 bg-gradient-to-r from-amber-400 via-orange-500 to-green-600 rounded-full opacity-80"></div>

        {/* Reset password modal */}
        <Modal
          isOpen={resetTarget !== null}
          onClose={() => setResetTarget(null)}
          title="Réinitialiser le mot de passe"
        >
          <form onSubmit={handleResetPassword} className="space-y-4">
            <p className="text-sm text-gray-600">
              Compte : <span className="font-semibold text-gray-900">{resetTarget?.email ?? resetTarget?.id}</span>
            </p>

            {resetError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
                {resetError}
              </div>
            )}

            {resetSuccess ? (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-700 font-medium text-center">
                Mot de passe réinitialisé !
              </div>
            ) : (
              <div>
                <label htmlFor="reset-password" className="block text-sm font-medium text-gray-700 mb-2">
                  Nouveau mot de passe
                </label>
                <input
                  id="reset-password"
                  type="password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  placeholder="Minimum 6 caractères"
                  autoFocus
                />
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                className="px-6 py-3 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all font-medium"
              >
                {resetSuccess ? "Fermer" : "Annuler"}
              </button>
              {!resetSuccess && (
                <button
                  type="submit"
                  disabled={resetSubmitting}
                  className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all shadow-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {resetSubmitting ? "Réinitialisation..." : "Réinitialiser"}
                </button>
              )}
            </div>
          </form>
        </Modal>

        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title="Nouveau user"
        >
          <form onSubmit={handleCreateUser} className="space-y-4">
            <div>
              <label htmlFor="user-email" className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <input
                id="user-email"
                type="email"
                value={form.email}
                onChange={(event) => updateForm("email", event.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200"
                placeholder="exemple@domaine.com"
                autoFocus
              />
            </div>

            <div>
              <label htmlFor="user-password" className="block text-sm font-medium text-gray-700 mb-2">
                Mot de passe temporaire
              </label>
              <input
                id="user-password"
                type="password"
                value={form.password}
                onChange={(event) => updateForm("password", event.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200"
                placeholder="Au moins 6 caracteres"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="user-nom" className="block text-sm font-medium text-gray-700 mb-2">
                  Nom
                </label>
                <input
                  id="user-nom"
                  type="text"
                  value={form.nom}
                  onChange={(event) => updateForm("nom", event.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200"
                  placeholder="Optionnel"
                />
              </div>

              <div>
                <label htmlFor="user-prenom" className="block text-sm font-medium text-gray-700 mb-2">
                  Prenom
                </label>
                <input
                  id="user-prenom"
                  type="text"
                  value={form.prenom}
                  onChange={(event) => updateForm("prenom", event.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200"
                  placeholder="Optionnel"
                />
              </div>
            </div>

            <div>
              <label htmlFor="user-role" className="block text-sm font-medium text-gray-700 mb-2">
                Role
              </label>
              <select
                id="user-role"
                value={form.role}
                onChange={(event) => updateForm("role", event.target.value as ManagedRole)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200 bg-white"
              >
                <option value="viewer">viewer</option>
                <option value="MENAGER">MENAGER</option>
              </select>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
              Creation depuis le navigateur avec role applicatif immediat.
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
                disabled={submitting}
                className="px-6 py-3 bg-gradient-to-r from-green-500 to-teal-600 text-white rounded-xl hover:from-green-600 hover:to-teal-700 transition-all duration-200 shadow-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "Creation..." : "Creer"}
              </button>
            </div>
          </form>
        </Modal>

        <Modal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          title="Modifier le user"
        >
          {editForm && (
            <form onSubmit={handleUpdateUser} className="space-y-4">
              <div>
                <label htmlFor="edit-user-email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email
                </label>
                <input
                  id="edit-user-email"
                  type="email"
                  value={editForm.email}
                  disabled
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-gray-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="edit-user-nom" className="block text-sm font-medium text-gray-700 mb-2">
                    Nom
                  </label>
                  <input
                    id="edit-user-nom"
                    type="text"
                    value={editForm.nom}
                    onChange={(event) =>
                      setEditForm((prev) => (prev ? { ...prev, nom: event.target.value } : prev))
                    }
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200"
                  />
                </div>

                <div>
                  <label htmlFor="edit-user-prenom" className="block text-sm font-medium text-gray-700 mb-2">
                    Prenom
                  </label>
                  <input
                    id="edit-user-prenom"
                    type="text"
                    value={editForm.prenom}
                    onChange={(event) =>
                      setEditForm((prev) => (prev ? { ...prev, prenom: event.target.value } : prev))
                    }
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="edit-user-role" className="block text-sm font-medium text-gray-700 mb-2">
                  Role
                </label>
                <select
                  id="edit-user-role"
                  value={editForm.role}
                  onChange={(event) =>
                    setEditForm((prev) =>
                      prev ? { ...prev, role: event.target.value as ManagedRole } : prev
                    )
                  }
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all duration-200 bg-white"
                >
                  <option value="viewer">viewer</option>
                  <option value="MENAGER">MENAGER</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-6 py-3 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all duration-200 font-medium"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-6 py-3 bg-gradient-to-r from-green-500 to-teal-600 text-white rounded-xl hover:from-green-600 hover:to-teal-700 transition-all duration-200 shadow-lg font-medium"
                >
                  Enregistrer
                </button>
              </div>
            </form>
          )}
        </Modal>
      </div>
    </div>
  );
}
