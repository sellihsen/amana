import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Lock, Mail, AlertCircle } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import api from '../services/api'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [erreur, setErreur] = useState('')
  const [enCours, setEnCours] = useState(false)
  const definirUtilisateur = useAuthStore((s) => s.definirUtilisateur)
  const navigate = useNavigate()

  const soumettre = async (e) => {
    e.preventDefault()
    setErreur('')
    setEnCours(true)
    try {
      // La réponse ne contient aucun jeton : la session est déposée dans un
      // cookie HttpOnly par le serveur.
      const { data } = await api.post('/auth/login', {
        email,
        mot_de_passe: motDePasse,
      })
      definirUtilisateur(data.user)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      const statut = err.response?.status
      if (statut === 429) {
        setErreur('Trop de tentatives de connexion. Réessayez dans quelques minutes.')
      } else if (statut === 401) {
        setErreur('Identifiants incorrects.')
      } else {
        setErreur(err.response?.data?.message || 'Erreur de connexion.')
      }
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amana-800 to-amana-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-amana-100 rounded-2xl mb-4">
            <Building2 className="w-8 h-8 text-amana-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Amana</h1>
          <p className="text-gray-500 text-sm mt-1">Gestion Administrative &amp; Financière</p>
        </div>

        <form onSubmit={soumettre} className="space-y-5">
          <div>
            <label className="label" htmlFor="email">Adresse email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field pl-10"
                placeholder="admin@mosquee.local"
                required
              />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="mot_de_passe">Mot de passe</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                id="mot_de_passe"
                name="mot_de_passe"
                type="password"
                autoComplete="current-password"
                value={motDePasse}
                onChange={(e) => setMotDePasse(e.target.value)}
                className="input-field pl-10"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          {erreur && (
            <div role="alert" className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {erreur}
            </div>
          )}

          <button type="submit" disabled={enCours} className="btn-primary w-full py-2.5">
            {enCours ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  )
}
