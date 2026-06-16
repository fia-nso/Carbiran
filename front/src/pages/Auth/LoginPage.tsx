import React, { useState, useEffect } from 'react';
import { useNavigate } from "react-router-dom";
import useAuth from '../../hooks/useAuth';

function UserIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  );
}

function LoginIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
    </svg>
  );
}

const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  
  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!username.trim() || !password.trim()) {
      setError("Veuillez remplir tous les champs");
      setLoading(false);
      return;
    }

    try {
      await login(username, password);
      if (isMounted) {
        navigate("/", { replace: true });
      }
    } catch (err: any) {
      if (isMounted) {
        setError(err?.response?.data?.message ?? err?.message ?? "Échec de la connexion. Veuillez réessayer.");
      }
    } finally {
      if (isMounted) {
        setLoading(false);
      }
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-gradient-to-br from-green-50 via-emerald-50 to-teal-100 relative overflow-hidden">
      {/* Arrière-plan animé */}
       

      {/* Carte de connexion */}
      <div className="relative z-10 w-full max-w-md px-6">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-green-600 to-emerald-700 rounded-2xl shadow-2xl border-4 border-white/50 mb-6 transform hover:scale-105 transition-transform duration-300">
          </div>
          <h1 className="text-3xl font-bold text-slate-800 mb-2">Connexion</h1>
          <p className="text-slate-600">Accédez à votre espace personnel</p>
        </div>

        <form 
          className="bg-white/90 backdrop-blur-lg p-8 rounded-3xl shadow-2xl border border-white/50 ring-1 ring-green-100/50 space-y-6 transform transition-all duration-500 hover:shadow-3xl"
          onSubmit={handleSubmit}
        >
          {error && (
            <div className="bg-gradient-to-r from-red-50 to-pink-50 text-red-700 border border-red-200 rounded-xl px-4 py-3 text-center font-medium text-sm shadow-lg animate-shake">
              <div className="flex items-center justify-center gap-2">
                <ErrorIcon />
                {error}
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="username" className="text-slate-700 font-semibold text-sm uppercase tracking-wider">
                Identifiant
              </label>
              <div className="relative">
                <input
                  type="text"
                  id="username"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  required
                  disabled={loading}
                  className="w-full px-4 py-3 pl-11 border-2 border-green-100 rounded-xl text-base outline-none bg-white text-slate-800 transition-all duration-300 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 focus:shadow-lg disabled:opacity-50 placeholder:text-slate-400"
                  placeholder="Votre identifiant"
                />
                <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400">
                  <UserIcon />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="password" className="text-slate-700 font-semibold text-sm uppercase tracking-wider">
                Mot de passe
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  id="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  className="w-full px-4 py-3 pl-11 pr-11 border-2 border-green-100 rounded-xl text-base outline-none bg-white text-slate-800 transition-all duration-300 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 focus:shadow-lg disabled:opacity-50 placeholder:text-slate-400"
                  placeholder="Votre mot de passe"
                />
                <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400">
                  <LockIcon />
                </div>
                <button
                  type="button"
                  onClick={togglePasswordVisibility}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors duration-200"
                  disabled={loading}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>
          </div>
 

          <button 
            type="submit" 
            className="w-full bg-gradient-to-r from-emerald-600 to-green-700 text-white border-none py-4 rounded-xl text-lg font-bold cursor-pointer transition-all duration-300 shadow-lg tracking-wide hover:from-emerald-700 hover:to-green-800 hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transform active:scale-95 flex items-center justify-center gap-3 group"
            disabled={loading}
          >
            {loading ? (
              <>
                <Spinner />
                Connexion...
              </>
            ) : (
              <>
                <LoginIcon />
                Se connecter
              </>
            )}
          </button>

           
        </form>
      </div>
 
    </div>
  );
};

export default LoginPage;