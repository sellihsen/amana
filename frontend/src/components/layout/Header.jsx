import { LogOut, User } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { libelleRole } from '../../utils/permissions'
import api from '../../services/api'

export default function Header() {
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
    <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
      <div />
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <User className="w-4 h-4" />
          <span>{utilisateur?.nom}</span>
          <span className="bg-amana-100 text-amana-700 text-xs px-2 py-0.5 rounded-full font-medium">
            {libelleRole(utilisateur?.role)}
          </span>
        </div>
        <button
          onClick={seDeconnecter}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Déconnexion
        </button>
      </div>
    </header>
  )
}
