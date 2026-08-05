import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

import Sidebar from './Sidebar'
import Header from './Header'

/**
 * Ossature de l'application.
 *
 * Sur grand écran, la navigation occupe une colonne fixe à gauche.
 * Sur mobile, elle deviendrait une amputation : 256 px de barre sur un écran
 * de 375 px ne laissent rien au contenu. Elle se replie donc en tiroir,
 * ouvert à la demande et refermé dès qu'on change de page.
 */
export default function Layout() {
  const [menuOuvert, setMenuOuvert] = useState(false)
  const emplacement = useLocation()

  // Naviguer referme le tiroir : sans cela, la page demandée s'afficherait
  // derrière un menu resté ouvert.
  useEffect(() => {
    setMenuOuvert(false)
  }, [emplacement.pathname])

  // Échap referme aussi — un tiroir qu'on ne sait pas fermer est un piège.
  useEffect(() => {
    const surTouche = (e) => {
      if (e.key === 'Escape') setMenuOuvert(false)
    }
    window.addEventListener('keydown', surTouche)
    return () => window.removeEventListener('keydown', surTouche)
  }, [])

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Voile assombrissant, uniquement quand le tiroir est ouvert. */}
      {menuOuvert && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setMenuOuvert(false)}
          aria-hidden="true"
        />
      )}

      <Sidebar ouvert={menuOuvert} surFermeture={() => setMenuOuvert(false)} />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Header surOuvertureMenu={() => setMenuOuvert(true)} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
