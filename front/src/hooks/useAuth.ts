import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { apiLogin, apiLogout, apiMe } from "@/lib/api";
import api from "@/lib/api";
import { writeActivityLogSafe } from "@/lib/activityLogs";
import type { User } from "@/types";

const TOKEN_KEY = "carbiran_token";

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
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) {
        if (mounted) setLoading(false);
        return;
      }
      try {
        const data = await apiMe();
        if (mounted) setUser(data);
      } catch {
        localStorage.removeItem(TOKEN_KEY);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void init();
    return () => { mounted = false; };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    setLoading(true);
    try {
      const result = await apiLogin(email, password);

      if (result?.token) {
        localStorage.setItem(TOKEN_KEY, result.token);
        setUser(result.user);
        navigate('/demandes');
      }
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err?.message ?? "Erreur de connexion");
      throw err;
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  const logout = useCallback(async () => {
    if (user) {
      await writeActivityLogSafe({
        module: "auth",
        action: "LOGOUT",
        targetTable: "profiles",
        targetId: user.id,
        description: `Deconnexion de ${user.email || user.id}.`,
        beforeData: { id: user.id, email: user.email, role: user.role },
      });
    }
    try { await apiLogout(); } catch { /* JWT stateless — on nettoie localement */ }
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    navigate('/login');
  }, [user, navigate]);

  const refreshUser = useCallback(async () => {
    try {
      const data = await apiMe();
      setUser(data);
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      setUser(null);
    }
  }, []);

  const updatePassword = useCallback(async (_newPassword: string): Promise<boolean> => {
    throw new Error("Utilisez reauthenticateAndUpdatePassword pour changer le mot de passe.");
  }, []);

  const reauthenticateAndUpdatePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      if (!user?.email) {
        throw new Error("Impossible de récupérer l'email de l'utilisateur courant.");
      }
      await api.patch("/auth/password", { currentPassword, newPassword });
      await writeActivityLogSafe({
        module: "auth",
        action: "UPDATE_PASSWORD",
        targetTable: "profiles",
        targetId: user.id,
        description: `Changement de mot de passe pour ${user.email}.`,
      });
    },
    [user]
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
