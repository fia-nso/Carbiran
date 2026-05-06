// src/routers/index.tsx
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ScrollToTop from "./ScrollToTop";
import LoginPage from "../pages/Auth/LoginPage"; 
import RootLayout from "../pages/layout";
import { AuthProvider } from "@/context/AuthProvider";
import ProtectedRoute from "./RouteProtected";
import RequireRole from "./RequireRole";
import ChangePasswordPage from "@/pages/ChangePasswordPage";
import VehiculePage from "@/pages/Crud/vehiculePage";
import RavitaillementVehiculePage from "@/pages/Crud/ravitaillementVehiculePage";
import UsersPage from "@/pages/Admin/usersPage";
import ActivityLogsPage from "@/pages/Admin/activityLogsPage";
import DashboardPage from "@/pages/Dashboard/dashboardPage";
 

const AppRouter: React.FC = () => {
  return (
    <BrowserRouter>
      <ScrollToTop />
      {/* <QueryClientProvider client={qClient}> */}
        <AuthProvider>
          <Routes>
            {/* Public route (login) */}
              <Route path="/login" element={<LoginPage />} />

            {/* Routes protégées qui utilisent le layout */}
            <Route element={<ProtectedRoute />}>
              {/* Layout wraps all authenticated pages */}
              <Route element={<RootLayout />}>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/ravitaillements" element={<RavitaillementVehiculePage />} />
                <Route path="/vehicules" element={<VehiculePage />} />
                <Route path="/chpass" element={<ChangePasswordPage />} />
                <Route element={<RequireRole roles={["Admin"]} />}>
                  <Route path="/users" element={<UsersPage />} />
                  <Route path="/logs" element={<ActivityLogsPage />} />
                </Route>
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Route>
            </Route>

            {/* fallback for any other unmatched (unauthenticated) */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
       </AuthProvider>
      {/* </QueryClientProvider> */}
    </BrowserRouter>
  );
};

export default AppRouter;
