// src/routers/ProtectedRoute.tsx
import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthContext } from "../context/AuthProvider";

/**
 * Protège les routes nécessitant authentification.
 * Si non authentifié -> redirige vers /login en gardant la cible dans state.
 */
const ProtectedRoute: React.FC = () => {
  const { user, loading } = useAuthContext();
  const location = useLocation();

  // pendant le chargement initial, on peut afficher un loader minimal
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin w-8 h-8 border-4 border-gray-300 border-t-green-600 rounded-full"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
