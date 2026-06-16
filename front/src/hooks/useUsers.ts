import { useEffect, useState } from "react";
import { apiGetUsers, apiCreateUser, apiUpdateUser, apiDeleteUser } from "@/lib/api";
import { writeActivityLogSafe } from "@/lib/activityLogs";
import type { AppRole } from "@/types";

export interface ManagedUser {
  id: string;
  email: string | null;
  nom: string | null;
  prenom: string | null;
  role: AppRole;
  createdAt: string;
}

interface CreateManagedUserPayload {
  email: string;
  password: string;
  nom?: string;
  prenom?: string;
  role: Exclude<AppRole, "Admin">;
}

interface UpdateManagedUserPayload {
  id: string;
  nom?: string;
  prenom?: string;
  role: Exclude<AppRole, "Admin">;
}

export function useUsers() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void loadUsers().catch(() => undefined);
  }, []);

  async function loadUsers() {
    setLoading(true);
    try {
      const data = await apiGetUsers();
      setUsers(
        ((data as any[]) ?? []).map((item) => ({
          id: item.id,
          email: item.email,
          nom: item.nom,
          prenom: item.prenom,
          role: item.role,
          createdAt: item.created_at,
        }))
      );
    } catch (error) {
      console.error("Erreur chargement users:", error);
      throw error;
    } finally {
      setLoading(false);
    }
  }

  async function createManagedUser(payload: CreateManagedUserPayload) {
    setSubmitting(true);
    try {
      const normalizedEmail = payload.email.trim().toLowerCase();
      const data = await apiCreateUser({
        email: normalizedEmail,
        password: payload.password,
        nom: payload.nom?.trim() || null,
        prenom: payload.prenom?.trim() || null,
        role: payload.role,
      });

      await loadUsers();
      await writeActivityLogSafe({
        module: "users",
        action: "CREATE",
        targetTable: "users",
        targetId: data.id,
        description: `Creation du user ${normalizedEmail}.`,
        afterData: data,
      });

      return { requiresEmailConfirmation: false };
    } finally {
      setSubmitting(false);
    }
  }

  async function updateUserRole(id: string, role: Exclude<AppRole, "Admin">) {
    const previousUser = users.find((item) => item.id === id) || null;
    await apiUpdateUser(id, { role });

    await writeActivityLogSafe({
      module: "users",
      action: "UPDATE_ROLE",
      targetTable: "users",
      targetId: id,
      description: `Mise a jour du role du user ${previousUser?.email || id}.`,
      beforeData: previousUser,
      afterData: previousUser ? { ...previousUser, role } : { id, role },
    });

    await loadUsers();
  }

  async function updateManagedUser(payload: UpdateManagedUserPayload) {
    const previousUser = users.find((item) => item.id === payload.id) || null;
    await apiUpdateUser(payload.id, {
      nom:   payload.nom?.trim()    || null,
      prenom: payload.prenom?.trim() || null,
      role:  payload.role,
    });

    await writeActivityLogSafe({
      module: "users",
      action: "UPDATE",
      targetTable: "users",
      targetId: payload.id,
      description: `Modification du user ${previousUser?.email || payload.id}.`,
      beforeData: previousUser,
      afterData: { ...previousUser, nom: payload.nom, prenom: payload.prenom, role: payload.role },
    });

    await loadUsers();
  }

  async function deleteManagedUser(id: string) {
    const previousUser = users.find((item) => item.id === id) || null;
    await apiDeleteUser(id);

    await writeActivityLogSafe({
      module: "users",
      action: "DELETE",
      targetTable: "users",
      targetId: id,
      description: `Suppression du user ${previousUser?.email || id}.`,
      beforeData: previousUser,
    });

    await loadUsers();
  }

  return {
    users,
    loading,
    submitting,
    createManagedUser,
    updateUserRole,
    updateManagedUser,
    deleteManagedUser,
    reload: loadUsers,
  };
}
