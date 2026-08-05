import { useAuthStore } from '../store/authStore'
import { possede } from '../utils/permissions'

/**
 * Garde de présentation réutilisable.
 *
 * ⚠️  Ne protège rien : le serveur refuse de toute façon. Ce composant évite
 * d'afficher une action vouée à un 403.
 *
 * @param {object} props
 * @param {string} props.capacite  Capacité requise (voir utils/permissions).
 * @param {React.ReactNode} [props.secours]  Contenu affiché à la place.
 * @param {React.ReactNode} props.children
 */
export default function RoleGuard({ capacite, secours = null, children }) {
  // Le rôle vient toujours de l'état de session alimenté par GET /auth/me,
  // jamais de localStorage : une valeur persistée serait modifiable par
  // l'utilisateur et périmée après un changement de rôle.
  const utilisateur = useAuthStore((s) => s.utilisateur)

  if (!utilisateur || !possede(utilisateur.role, capacite)) {
    return secours
  }

  return children
}

/**
 * Variante hook, pour conditionner autre chose qu'un rendu (désactiver un
 * bouton, masquer une colonne…).
 */
export function useCapacite(capacite) {
  const utilisateur = useAuthStore((s) => s.utilisateur)
  return Boolean(utilisateur && possede(utilisateur.role, capacite))
}
