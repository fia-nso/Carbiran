// src/context/AuthContext.tsx
import React, { createContext, useContext } from "react";
import useAuth from "@/hooks/useAuth";
import type { User } from "@/types";

type UseAuthReturn = {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updatePassword: (newPassword: string) => Promise<boolean>;
  reauthenticateAndUpdatePassword: (currentPassword: string, newPassword: string) => Promise<void>;
};

const AuthContext = createContext<UseAuthReturn | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const auth = useAuth();

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
};

/**
 * Hook consommateur (plus pratique que useContext directement)
 */
export function useAuthContext(): UseAuthReturn {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuthContext must be used within an AuthProvider");
  }
  return ctx;
}
