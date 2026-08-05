import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'

import { useAuthStore, ETATS } from './store/authStore'
import { CAPACITES, possede } from './utils/permissions'
import api from './services/api'
import Layout from './components/layout/Layout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import MembresPage from './pages/MembresPage'
import DonsPage from './pages/DonsPage'
import CotisationsPage from './pages/CotisationsPage'
import DepensesPage from './pages/DepensesPage'
import AdminPage from './pages/AdminPage'
import RHPage from './pages/RHPage'
import MadrasaPage from './pages/MadrasaPage'
import BilansPage from './pages/BilansPage'
import StockPage from './pages/StockPage'
import SocialPage from './pages/SocialPage'

/**
 * Rétablit l'état de session au chargement.
 *
 * Le cookie de session étant HttpOnly, le navigateur ne peut pas savoir s'il
 * est connecté : seul `GET /auth/me` fait foi. C'est aussi ce qui garantit que
 * le rôle affiché est le rôle actuel, pas celui d'il y a huit heures.
 */
function useRestaurerSession() {
  const definirUtilisateur = useAuthStore((s) => s.definirUtilisateur)
  const effacerSession = useAuthStore((s) => s.effacerSession)
  const statutSession = useAuthStore((s) => s.statutSession)

  useEffect(() => {
    if (statutSession !== ETATS.INCONNU) return
    let annule = false

    api
      .get('/auth/me')
      .then(({ data }) => {
        if (!annule) definirUtilisateur(data)
      })
      .catch(() => {
        if (!annule) effacerSession()
      })

    return () => {
      annule = true
    }
  }, [statutSession, definirUtilisateur, effacerSession])

  return statutSession
}

/** Route exigeant une session, et éventuellement une capacité. */
function RoutePrivee({ capacite = CAPACITES.READ, children }) {
  const utilisateur = useAuthStore((s) => s.utilisateur)
  const statutSession = useAuthStore((s) => s.statutSession)

  if (statutSession === ETATS.INCONNU) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Chargement…
      </div>
    )
  }

  if (!utilisateur) {
    return <Navigate to="/login" replace />
  }

  if (!possede(utilisateur.role, capacite)) {
    // L'utilisateur est connecté : on ne le déconnecte pas, on l'informe.
    return <Navigate to="/dashboard" replace state={{ acces: 'refuse' }} />
  }

  return children
}

export default function App() {
  const statutSession = useRestaurerSession()
  const utilisateur = useAuthStore((s) => s.utilisateur)

  return (
    <Routes>
      <Route
        path="/login"
        element={
          statutSession === ETATS.AUTHENTIFIE && utilisateur ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <LoginPage />
          )
        }
      />
      <Route
        path="/"
        element={
          <RoutePrivee>
            <Layout />
          </RoutePrivee>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="membres" element={<MembresPage />} />
        <Route path="dons" element={<DonsPage />} />
        <Route path="cotisations" element={<CotisationsPage />} />
        <Route path="depenses" element={<DepensesPage />} />
        <Route path="rh" element={<RHPage />} />
        <Route path="madrasa" element={<MadrasaPage />} />
        <Route path="bilans" element={<BilansPage />} />
        <Route path="stock" element={<StockPage />} />
        <Route path="social" element={<SocialPage />} />
        <Route
          path="admin"
          element={
            <RoutePrivee capacite={CAPACITES.ADMIN}>
              <AdminPage />
            </RoutePrivee>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
