import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuthContext } from "@/context/AuthProvider";
import type { AppRole } from "@/types";
import { homePathFor } from "@/lib/roles";

interface RequireRoleProps {
  roles: AppRole[];
}

const RequireRole: React.FC<RequireRoleProps> = ({ roles }) => {
  const { user, loading } = useAuthContext();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin w-8 h-8 border-4 border-gray-300 border-t-green-600 rounded-full"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!roles.includes(user.role)) {
    return <Navigate to={homePathFor(user)} replace />;
  }

  return <Outlet />;
};

export default RequireRole;
