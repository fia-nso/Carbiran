import { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
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
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, nom, prenom, role, created_at")
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      setUsers(
        ((data as any[]) || []).map((item) => ({
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
      const { data: currentSessionData } = await supabase.auth.getSession();
      const currentSession = currentSessionData.session;

      const { data: existingProfiles } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", normalizedEmail)
        .limit(1);

      if (existingProfiles && existingProfiles.length > 0) {
        throw new Error("Un utilisateur avec cet email existe deja.");
      }

      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: payload.password,
        options: {
          data: {
            nom: payload.nom?.trim() || null,
            prenom: payload.prenom?.trim() || null,
            role: payload.role,
          },
        },
      });

      if (error) {
        throw error;
      }

      if (!data.user) {
        throw new Error("La creation de l'utilisateur a echoue.");
      }

      if (
        currentSession &&
        data.session &&
        data.session.user.id !== currentSession.user.id
      ) {
        await supabase.auth.setSession({
          access_token: currentSession.access_token,
          refresh_token: currentSession.refresh_token,
        });
      }

      const { data: profileData } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", data.user.id)
        .maybeSingle();

      if (!profileData) {
        const { error: profileUpsertError } = await supabase
          .from("profiles")
          .upsert(
            {
              id: data.user.id,
              email: normalizedEmail,
              nom: payload.nom?.trim() || null,
              prenom: payload.prenom?.trim() || null,
              role: payload.role,
            },
            { onConflict: "id" }
          );

        if (profileUpsertError) {
          throw profileUpsertError;
        }
      }

      await loadUsers();
      await writeActivityLogSafe({
        module: "users",
        action: "CREATE",
        targetTable: "profiles",
        targetId: data.user.id,
        description: `Creation du user ${normalizedEmail}.`,
        afterData: {
          id: data.user.id,
          email: normalizedEmail,
          nom: payload.nom?.trim() || null,
          prenom: payload.prenom?.trim() || null,
          role: payload.role,
        },
      });
      return {
        requiresEmailConfirmation: !data.session,
      };
    } finally {
      setSubmitting(false);
    }
  }

  async function updateUserRole(id: string, role: Exclude<AppRole, "Admin">) {
    const previousUser = users.find((item) => item.id === id) || null;
    const { error } = await supabase
      .from("profiles")
      .update({ role })
      .eq("id", id);

    if (error) {
      console.error("Erreur mise a jour role utilisateur:", error);
      throw error;
    }

    await writeActivityLogSafe({
      module: "users",
      action: "UPDATE_ROLE",
      targetTable: "profiles",
      targetId: id,
      description: `Mise a jour du role du user ${previousUser?.email || id}.`,
      beforeData: previousUser,
      afterData: previousUser ? { ...previousUser, role } : { id, role },
    });

    await loadUsers();
  }

  async function updateManagedUser(payload: UpdateManagedUserPayload) {
    const previousUser = users.find((item) => item.id === payload.id) || null;
    const { error } = await supabase
      .from("profiles")
      .update({
        nom: payload.nom?.trim() || null,
        prenom: payload.prenom?.trim() || null,
        role: payload.role,
      })
      .eq("id", payload.id);

    if (error) {
      console.error("Erreur mise a jour utilisateur:", error);
      throw error;
    }

    await writeActivityLogSafe({
      module: "users",
      action: "UPDATE",
      targetTable: "profiles",
      targetId: payload.id,
      description: `Modification du user ${previousUser?.email || payload.id}.`,
      beforeData: previousUser,
      afterData: previousUser
        ? {
            ...previousUser,
            nom: payload.nom?.trim() || null,
            prenom: payload.prenom?.trim() || null,
            role: payload.role,
          }
        : {
            id: payload.id,
            nom: payload.nom?.trim() || null,
            prenom: payload.prenom?.trim() || null,
            role: payload.role,
          },
    });

    await loadUsers();
  }

  async function deleteManagedUser(id: string) {
    const previousUser = users.find((item) => item.id === id) || null;
    const { error } = await supabase
      .from("profiles")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Erreur suppression utilisateur:", error);
      throw error;
    }

    await writeActivityLogSafe({
      module: "users",
      action: "DELETE",
      targetTable: "profiles",
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
