import { Link, useNavigate } from "react-router-dom";
import { useAuthContext } from "@/context/AuthProvider";

export default function Header() {
  const { logout, user } = useAuthContext();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/login");
    } catch (err) {
      console.error("Erreur lors de la deconnexion :", err);
    }
  };

  return (
    <header className="bg-gradient-to-r from-green-600 to-teal-700 text-white shadow-xl border-b border-green-500">
      <div className="container mx-auto px-4 py-3">
        <div className="flex justify-between items-center gap-4">
          <div className="flex items-center space-x-4">
            
            <Link to="/" className="hover:opacity-90 transition-opacity">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Gestion Carburant</h1>
                <p className="text-teal-100 text-sm font-medium">Parc vehicule et ravitaillement</p>
              </div>
            </Link>
          </div>

          <div className="flex items-center space-x-3">
            <nav className="flex space-x-2">
              {user?.role === "Admin" && (
                <>
                  <Link
                    to="/users"
                    className="bg-white/15 px-4 py-2 rounded-lg hover:bg-white/25 transition-all duration-200 hover:shadow-lg border border-white/10 hover:border-white/20 font-medium text-white/90 hover:text-white"
                  >
                    Users
                  </Link>
                  <Link
                    to="/logs"
                    className="bg-white/15 px-4 py-2 rounded-lg hover:bg-white/25 transition-all duration-200 hover:shadow-lg border border-white/10 hover:border-white/20 font-medium text-white/90 hover:text-white"
                  >
                    Logs
                  </Link>
                </>
              )}
              <Link
                to="/ravitaillements"
                className="bg-white/15 px-4 py-2 rounded-lg hover:bg-white/25 transition-all duration-200 hover:shadow-lg border border-white/10 hover:border-white/20 font-medium text-white/90 hover:text-white"
              >
                Ravitaillements
              </Link>
              <Link
                to="/vehicules"
                className="bg-white/15 px-4 py-2 rounded-lg hover:bg-white/25 transition-all duration-200 hover:shadow-lg border border-white/10 hover:border-white/20 font-medium text-white/90 hover:text-white"
              >
                Vehicules
              </Link>
              <Link
                to="/chpass"
                className="bg-white/15 px-4 py-2 rounded-lg hover:bg-white/25 transition-all duration-200 hover:shadow-lg border border-white/10 hover:border-white/20 font-medium text-white/90 hover:text-white"
              >
                Securite
              </Link>
            </nav>

            <div className="h-8 w-px bg-white/20 mx-2"></div>

            <button
              onClick={handleLogout}
              className="bg-gradient-to-r from-green-700 to-teal-800 hover:from-green-600 hover:to-teal-700 text-white font-semibold px-4 py-2 rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl border border-white/10 hover:border-white/20 flex items-center space-x-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span>Deconnexion</span>
            </button>
          </div>
        </div>

        <div className="mt-3 w-full h-1 bg-gradient-to-r from-emerald-400 via-teal-500 to-green-600 rounded-full opacity-80"></div>
      </div>
    </header>
  );
}
