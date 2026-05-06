import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/supabaseClient";
import { writeActivityLogSafe } from "@/lib/activityLogs";
import type { User } from "@/types";

interface UseAuthReturn {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updatePassword: (newPassword: string) => Promise<boolean>;
  reauthenticateAndUpdatePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

export default function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadUser = useCallback(async (userId: string) => {
    try {
      const { data, error: profileErr } = await supabase
        .from("profiles")
        .select("id, email, nom, prenom, role")
        .eq("id", userId)
        .single();

      if (profileErr) {
        throw profileErr;
      }

      if (data) {
        const nextUser = {
          id: data.id,
          email: data.email,
          nom: data.nom,
          prenom: data.prenom,
          role: data.role,
        };
        setUser(nextUser);
        return nextUser;
      }

      setUser(null);
      return null;
    } catch (e) {
      console.error("loadUser error:", e);
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const sessionUser = data.session?.user ?? null;
        if (sessionUser && mounted) {
          await loadUser(sessionUser.id);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void init();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        void loadUser(session.user.id);
      } else {
        setUser(null);
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [loadUser]);

  const login = useCallback(
    async (email: string, password: string) => {
      setError(null);
      setLoading(true);
      try {
        const { data, error: signErr } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signErr) {
          throw signErr;
        }
        const sessionUser = data.user;
        if (!sessionUser) {
          throw new Error("Utilisateur introuvable apres connexion.");
        }
        const loadedUser = await loadUser(sessionUser.id);
        if (!loadedUser) {
          await supabase.auth.signOut();
          throw new Error("Utilisateur non autorise dans cette application.");
        }
        await writeActivityLogSafe({
          module: "auth",
          action: "LOGIN",
          targetTable: "profiles",
          targetId: loadedUser.id,
          description: `Connexion de ${loadedUser.email || loadedUser.id}.`,
          afterData: {
            id: loadedUser.id,
            email: loadedUser.email,
            role: loadedUser.role,
          },
        });
      } catch (err: any) {
        console.error("login error:", err);
        setError(err?.message ?? "Erreur de connexion");
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [loadUser]
  );

  const logout = useCallback(async () => {
    if (user) {
      await writeActivityLogSafe({
        module: "auth",
        action: "LOGOUT",
        targetTable: "profiles",
        targetId: user.id,
        description: `Deconnexion de ${user.email || user.id}.`,
        beforeData: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
      });
    }

    await supabase.auth.signOut();
    setUser(null);
  }, [user]);

  const refreshUser = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      await loadUser(data.user.id);
    }
  }, [loadUser]);

  const updatePassword = useCallback(async (newPassword: string) => {
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      throw error;
    }
    await writeActivityLogSafe({
      module: "auth",
      action: "UPDATE_PASSWORD",
      targetTable: "profiles",
      targetId: userData.user?.id || null,
      description: `Changement de mot de passe pour ${userData.user?.email || "l'utilisateur courant"}.`,
    });
    return true;
  }, []);

  const reauthenticateAndUpdatePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData?.user?.email) {
        throw new Error("Impossible de recuperer l'email de l'utilisateur courant.");
      }
      const email = userData.user.email as string;

      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (signInErr) {
        throw new Error(signInErr.message || "Mot de passe courant incorrect.");
      }

      const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword });
      if (updateErr) {
        throw new Error(updateErr.message || "Erreur lors de la mise a jour du mot de passe.");
      }

      await writeActivityLogSafe({
        module: "auth",
        action: "UPDATE_PASSWORD",
        targetTable: "profiles",
        targetId: userData.user.id,
        description: `Changement de mot de passe pour ${email}.`,
      });
    },
    []
  );

  return {
    user,
    loading,
    error,
    login,
    logout,
    refreshUser,
    updatePassword,
    reauthenticateAndUpdatePassword,
  };
}
