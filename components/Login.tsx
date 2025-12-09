import React, { useState } from 'react';
import cityImage from '../Imagenes/city.jpg';
import logoImage from '../Imagenes/logo.png';

interface LoginProps {
  onLogin: () => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [loading, setLoading] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      onLogin();
    }, 1500);
  };

  return (
    <div
      className="relative min-h-screen w-full flex items-center justify-center bg-cover bg-center font-sans overflow-hidden"
      style={{ backgroundImage: `url(${cityImage})` }}
    >
      {/* Background Overlay */}
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"></div>

      {/* Login Card - Static, no animations */}
      <div className="relative z-10 w-full max-w-[440px] bg-white/90 backdrop-blur-xl rounded-[2.5rem] shadow-2xl p-10 mx-4 border border-white/40 flex flex-col items-center">
        {/* Logo Section */}
        <div className="flex flex-col items-center mb-10 w-full">
          <img
            src={logoImage}
            alt="Urban Lytica Logo"
            className="w-28 h-auto mb-6 drop-shadow-xl transform transition-transform duration-500 hover:scale-105"
          />
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Urban Lytica</h1>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-[0.25em] mt-3">
            Masterplan AI
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="w-full space-y-6">
          <div className="space-y-2 group">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1 group-focus-within:text-blue-600 transition-colors">
              Usuario
            </label>
            <input
              type="email"
              defaultValue="demo@urbanlytica.com"
              className="w-full px-5 py-4 bg-slate-50/50 border border-slate-200 text-slate-800 text-base rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all placeholder:text-slate-400 font-medium hover:bg-white"
              placeholder="nombre@empresa.com"
              required
            />
          </div>

          <div className="space-y-2 group">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1 group-focus-within:text-blue-600 transition-colors">
              Contraseña
            </label>
            <input
              type="password"
              defaultValue="password"
              className="w-full px-5 py-4 bg-slate-50/50 border border-slate-200 text-slate-800 text-base rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all placeholder:text-slate-400 font-medium hover:bg-white"
              placeholder="••••••••"
              required
            />
          </div>

          <div className="pt-4">
            <button
              type="submit"
              disabled={loading}
              className="btn-interactive w-full py-4 px-6 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-lg font-bold rounded-2xl shadow-lg shadow-blue-500/30 disabled:opacity-80 disabled:cursor-not-allowed flex items-center justify-center gap-3"
            >
              {loading ? (
                <>
                  <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span className="opacity-90">Accediendo...</span>
                </>
              ) : (
                'Entrar a la Plataforma'
              )}
            </button>
          </div>
        </form>

        {/* Footer */}
        <div className="mt-10 text-center border-t border-slate-200/50 w-full pt-8">
          <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
            Acceso exclusivo para desarrolladores autorizados
            <br />
            &copy; 2025 Urban Lytica Technologies
          </p>
        </div>
      </div>
    </div>
  );
};
