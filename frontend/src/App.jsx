import { Suspense, lazy, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'

import { useAuthStore, ETATS } from './store/authStore'
import { CAPACITES, possede } from './utils/permissions'
import api from './services/api'
import Layout from './components/layout/Layout'
import LoginPage from './pages/LoginPage'
import LandingPage from './pages/landing/LandingPage'

/**
 * Les pages sont chargées à la demande.
 *
 * Sans cela, ouvrir l'écran de connexion téléchargeait aussi les graphiques du
 * tableau de bord et l'intégralité des écrans d'administration — plusieurs
 * centaines de kilooctets qu'un utilisateur ne verra peut-être jamais, sur une
 * connexion mobile.
 *
 * `LandingPage` et `LoginPage` restent importées normalement : ce sont les deux
 * premières choses que voit un visiteur non connecté, les différer ne ferait
 * qu'ajouter une attente.
 */
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const MembresPage = lazy(() => import('./pages/MembresPage'))
const DonsPage = lazy(() => import('./pages/DonsPage'))
const CotisationsPage = lazy(() => import('./pages/CotisationsPage'))
const DepensesPage = lazy(() => import('./pages/DepensesPage'))
const RHPage = lazy(() => import('./pages/RHPage'))
const MadrasaPage = lazy(() => import('./pages/MadrasaPage'))
const BilansPage = lazy(() => import('./pages/BilansPage'))
const StockPage = lazy(() => import('./pages/StockPage'))
const SocialPage = lazy(() => import('./pages/SocialPage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))

function Chargement() {
  return (
    <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
      Chargement…
    </div>
  )
}

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
      {/* La racine est publique : c'est la page de présentation d'Amana. */}
      <Route path="/" element={<LandingPage />} />
      {/*
        Route de mise en page sans chemin : elle n'ajoute rien à l'URL, si bien
        que `/dashboard`, `/membres`… restent exactement où ils étaient avant
        que la racine ne soit rendue au public.
      */}
      <Route
        element={
          <RoutePrivee>
            <Layout />
          </RoutePrivee>
        }
      >
        <Route path="/dashboard" element={<Suspense fallback={<Chargement />}><DashboardPage /></Suspense>} />
        <Route path="/membres" element={<Suspense fallback={<Chargement />}><MembresPage /></Suspense>} />
        <Route path="/dons" element={<Suspense fallback={<Chargement />}><DonsPage /></Suspense>} />
        <Route path="/cotisations" element={<Suspense fallback={<Chargement />}><CotisationsPage /></Suspense>} />
        <Route path="/depenses" element={<Suspense fallback={<Chargement />}><DepensesPage /></Suspense>} />
        <Route path="/rh" element={<Suspense fallback={<Chargement />}><RHPage /></Suspense>} />
        <Route path="/madrasa" element={<Suspense fallback={<Chargement />}><MadrasaPage /></Suspense>} />
        <Route path="/bilans" element={<Suspense fallback={<Chargement />}><BilansPage /></Suspense>} />
        <Route path="/stock" element={<Suspense fallback={<Chargement />}><StockPage /></Suspense>} />
        <Route path="/social" element={<Suspense fallback={<Chargement />}><SocialPage /></Suspense>} />
        <Route
          path="/admin"
          element={
            <RoutePrivee capacite={CAPACITES.ADMIN}>
              <Suspense fallback={<Chargement />}><AdminPage /></Suspense>
            </RoutePrivee>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
