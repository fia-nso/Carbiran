// src/pages/layout/RootLayout.tsx 
import Header from "../components/Layout/Header";
import { Outlet } from "react-router-dom";
  
/**
 * Layout global :
 * - Header fixed en haut (height 64px)
 * - Sidebar fixed à gauche sous le header (width 16rem)
 * - Main area scrollable (padding top = header height)
 *
 * Ajuste les classes Tailwind (hauteur header / largeur sidebar) si nécessaire.
 */ 

export default function RootLayout() { 
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header fixed */}
      <Header />
    

      <div className="flex">
        {/* Sidebar: visible sous le header. Pour mobile, Sidebar peut gérer son propre comportement (drawer). */}

        {/* Main content : espace réservé pour header (pt-16) et pour mobile on affiche header seulement */}
        <main
          className="flex-1 min-h-screen pt-16 pb-8 px-4 md:px-8 overflow-auto"
          role="main"
          aria-live="polite"
        >
          {/* Outlet rendra la route enfant */}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
