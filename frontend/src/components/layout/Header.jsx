import { LogOut, User, Menu } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { useAuthStore } from '../../store/authStore'
import { libelleRole } from '../../utils/permissions'
import api from '../../services/api'

export default function Header({ surOuvertureMenu }) {
  const utilisateur = useAuthStore((s) => s.utilisateur)
  const effacerSession = useAuthStore((s) => s.effacerSession)
  const navigate = useNavigate()

  const seDeconnecter = async () => {
    try {
      // Seul le serveur peut invalider le cookie HttpOnly.
      await api.post('/auth/logout')
    } catch (_) {
      // Session déjà expirée côté serveur : le résultat local est le même.
    } finally {
      effacerSession()
      navigate('/login', { replace: true })
    }
  }

  return (
    <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
      {/* Ouverture du tiroir — inutile dès que la barre latérale est fixe. */}
      <button
        type="button"
        onClick={surOuvertureMenu}
        className="lg:hidden p-2 -ml-2 text-gray-500 hover:text-gray-900 rounded-lg hover:bg-gray-100"
        aria-label="Ouvrir le menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      <div className="flex items-center gap-3 sm:gap-4 ml-auto min-w-0">
        <div className="flex items-center gap-2 text-sm text-gray-600 min-w-0">
          <User className="w-4 h-4 flex-shrink-0" />
          {/* Le nom s'efface sur les écrans étroits : le rôle prime. */}
          <span className="hidden sm:inline truncate">{utilisateur?.nom}</span>
          <span className="bg-amana-100 text-amana-700 text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
            {libelleRole(utilisateur?.role)}
          </span>
        </div>
        <button
          onClick={seDeconnecter}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600 transition-colors whitespace-nowrap"
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          <span className="hidden sm:inline">Déconnexion</span>
        </button>
      </div>
    </header>
  )
}
