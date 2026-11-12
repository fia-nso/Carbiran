// src/routers/index.tsx
import React from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import ScrollToTop from "./ScrollToTop";
import LoginPage from "../pages/Auth/LoginPage";
import RootLayout from "../pages/layout";
import { AuthProvider } from "@/context/AuthProvider";
import { useAuthContext } from "@/context/AuthProvider";
import ProtectedRoute from "./RouteProtected";
import RequireRole from "./RequireRole";
import ChangePasswordPage from "@/pages/ChangePasswordPage";
import VehiculePage from "@/pages/Crud/vehiculePage";
import RavitaillementVehiculePage from "@/pages/Crud/ravitaillementVehiculePage";
import UsersPage from "@/pages/Admin/usersPage";
import ActivityLogsPage from "@/pages/Admin/activityLogsPage";
import DashboardPage from "@/pages/Dashboard/dashboardPage";
import DemandesPage from "@/pages/Demandes/demandesPage";
import NouvelleDemandePage from "@/pages/Demandes/nouvelleDemandePage";
import DetailDemandePage from "@/pages/Demandes/detailDemandePage";
import ModifierDemandePage from "@/pages/Demandes/modifierDemandePage";
import UploadSignaturePage from "@/pages/Signature/uploadSignaturePage";
import BonVerificationPage from "@/pages/Public/bonVerificationPage";
import type { User } from "@/types";
import { homePathFor, isCellule, isDG, isDMG, isDT } from "@/lib/roles";

// Redirige vers /dashboard pour Admin/MENAGER, vers /demandes pour tous les autres.
function DefaultRedirect() {
  const { user, loading } = useAuthContext();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin w-8 h-8 border-4 border-gray-300 border-t-green-600 rounded-full" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (isCellule(user)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <Navigate to={homePathFor(user)} replace />;
}

// Garde générique : laisse passer si allow(user) est vrai, sinon renvoie
// vers la page d'accueil du rôle (/dashboard pour DMG, /demandes sinon).
function RequireAccess({ allow }: { allow: (user: User) => boolean }) {
  const { user, loading } = useAuthContext();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin w-8 h-8 border-4 border-gray-300 border-t-green-600 rounded-full" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (!allow(user)) return <Navigate to={homePathFor(user)} replace />;

  return <Outlet />;
}

// Cellule + DG (accès historiques) + DMG (lecture seule).
const canSeeDashboardAndVehicules = (u: User) => isCellule(u) || isDG(u) || isDMG(u);
// Idem + DT (lecture seule) pour les ravitaillements.
const canSeeRavitaillements = (u: User) => canSeeDashboardAndVehicules(u) || isDT(u);
// Tout le monde sauf DMG (pas de demandes, pas de signature).
const notDMG = (u: User) => !isDMG(u);

const AppRouter: React.FC = () => {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <AuthProvider>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/bon/:id" element={<BonVerificationPage />} />

          {/* Protégées — utilisent le layout */}
          <Route element={<ProtectedRoute />}>
            <Route element={<RootLayout />}>

              {/* Redirection intelligente selon le rôle */}
              <Route index element={<DefaultRedirect />} />

              {/* Admin, MENAGER, DG et DMG (lecture seule pour DG/DMG) */}
              <Route element={<RequireAccess allow={canSeeDashboardAndVehicules} />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/vehicules" element={<VehiculePage />} />
              </Route>

              {/* Idem + DT (lecture seule) */}
              <Route element={<RequireAccess allow={canSeeRavitaillements} />}>
                <Route path="/ravitaillements" element={<RavitaillementVehiculePage />} />
              </Route>

              {/* Admin uniquement */}
              <Route element={<RequireRole roles={["Admin"]} />}>
                <Route path="/users" element={<UsersPage />} />
                <Route path="/logs" element={<ActivityLogsPage />} />
              </Route>

              {/* Tous les rôles authentifiés */}
              <Route path="/chpass" element={<ChangePasswordPage />} />

              {/* Tous les rôles sauf DMG */}
              <Route element={<RequireAccess allow={notDMG} />}>
                <Route path="/signature/upload" element={<UploadSignaturePage />} />
                <Route path="/demandes" element={<DemandesPage />} />
                <Route path="/demandes/:id" element={<DetailDemandePage />} />
              </Route>

              {/* chef_de_cours et chef_departement */}
              <Route element={<RequireRole roles={["chef_de_cours", "chef_departement"]} />}>
                <Route path="/demandes/nouvelle" element={<NouvelleDemandePage />} />
              </Route>

              {/* chef_de_cours, chef_departement et signataire (directeur_commercial) */}
              <Route element={<RequireRole roles={["chef_de_cours", "chef_departement", "signataire"]} />}>
                <Route path="/demandes/:id/modifier" element={<ModifierDemandePage />} />
              </Route>

              {/* Catch-all dans le layout → redirection intelligente */}
              <Route path="*" element={<DefaultRedirect />} />

            </Route>
          </Route>

          {/* Fallback non authentifié */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default AppRouter;
