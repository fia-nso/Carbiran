import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthContext } from "@/context/AuthProvider";
import NotificationBell from "@/components/NotificationBell";

const NAV_LINK =
  "bg-white/15 px-4 py-2 rounded-lg hover:bg-white/25 transition-all duration-200 hover:shadow-lg border border-white/10 hover:border-white/20 font-medium text-white/90 hover:text-white text-sm";

const MOBILE_NAV_LINK =
  "flex items-center px-4 py-3 min-h-[44px] rounded-lg hover:bg-white/15 transition-colors font-medium text-white text-base";

export default function Header() {
  const { logout, user } = useAuthContext();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isAdminOrManager = user?.role === "Admin" || user?.role === "MENAGER";
  const isAdmin          = user?.role === "Admin";
  const canCreateDemande = user?.role === "chef_de_cours" || user?.role === "chef_departement";

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/login");
    } catch (err) {
      console.error("Erreur lors de la deconnexion :", err);
    }
  };

  const closeMenu = () => setMobileMenuOpen(false);

  return (
    <header className="bg-gradient-to-r from-green-600 to-teal-700 text-white shadow-xl border-b border-green-500">
      <div className="container mx-auto px-4 py-3">
        <div className="flex justify-between items-center gap-3">
          {/* Logo */}
          <Link to="/" className="hover:opacity-90 transition-opacity min-w-0">
            <h1 className="text-lg sm:text-2xl font-bold tracking-tight leading-tight">Gestion Carburant</h1>
            <p className="hidden sm:block text-teal-100 text-sm font-medium">Parc vehicule et ravitaillement</p>
          </Link>

          {/* Desktop nav */}
          <div className="hidden lg:flex items-center space-x-3">
            <nav className="flex space-x-2">
              {isAdminOrManager ? (
                <>
                  <Link to="/dashboard"       className={NAV_LINK}>Dashboard</Link>
                  <Link to="/ravitaillements" className={NAV_LINK}>Ravitaillements</Link>
                  <Link to="/vehicules"       className={NAV_LINK}>Vehicules</Link>
                  {isAdmin && (
                    <>
                      <Link to="/users" className={NAV_LINK}>Users</Link>
                      <Link to="/logs"  className={NAV_LINK}>Logs</Link>
                    </>
                  )}
                  <Link to="/demandes" className={NAV_LINK}>Demandes</Link>
                  <Link to="/chpass"   className={NAV_LINK}>Securite</Link>
                </>
              ) : (
                <>
                  <Link to="/demandes" className={NAV_LINK}>Demandes</Link>
                  {canCreateDemande && (
                    <Link to="/demandes/nouvelle" className={NAV_LINK}>Nouvelle demande</Link>
                  )}
                </>
              )}
            </nav>

            <NotificationBell />

            <div className="h-8 w-px bg-white/20 mx-1" />

            <button
              onClick={handleLogout}
              className="bg-gradient-to-r from-green-700 to-teal-800 hover:from-green-600 hover:to-teal-700 text-white font-semibold px-4 py-2 rounded-lg transition-all duration-200 shadow-lg border border-white/10 flex items-center space-x-2 text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span>Deconnexion</span>
            </button>
          </div>

          {/* Mobile : notification + hamburger */}
          <div className="flex lg:hidden items-center gap-2 flex-shrink-0">
            <NotificationBell />
            <button
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
              aria-label={mobileMenuOpen ? "Fermer le menu" : "Ouvrir le menu"}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <div className="mt-3 w-full h-1 bg-gradient-to-r from-emerald-400 via-teal-500 to-green-600 rounded-full opacity-80" />
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-white/10 bg-gradient-to-b from-green-700 to-teal-800 px-4 py-2 space-y-0.5">
          {isAdminOrManager ? (
            <>
              <Link to="/dashboard"       className={MOBILE_NAV_LINK} onClick={closeMenu}>Dashboard</Link>
              <Link to="/ravitaillements" className={MOBILE_NAV_LINK} onClick={closeMenu}>Ravitaillements</Link>
              <Link to="/vehicules"       className={MOBILE_NAV_LINK} onClick={closeMenu}>Vehicules</Link>
              {isAdmin && (
                <>
                  <Link to="/users" className={MOBILE_NAV_LINK} onClick={closeMenu}>Users</Link>
                  <Link to="/logs"  className={MOBILE_NAV_LINK} onClick={closeMenu}>Logs</Link>
                </>
              )}
              <Link to="/demandes" className={MOBILE_NAV_LINK} onClick={closeMenu}>Demandes</Link>
              <Link to="/chpass"   className={MOBILE_NAV_LINK} onClick={closeMenu}>Securite</Link>
            </>
          ) : (
            <>
              <Link to="/demandes" className={MOBILE_NAV_LINK} onClick={closeMenu}>Demandes</Link>
              {canCreateDemande && (
                <Link to="/demandes/nouvelle" className={MOBILE_NAV_LINK} onClick={closeMenu}>Nouvelle demande</Link>
              )}
            </>
          )}
          <div className="pt-2 border-t border-white/10">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-4 py-3 min-h-[44px] rounded-lg bg-white/10 hover:bg-white/20 transition-colors font-medium text-white text-base"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Deconnexion
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
