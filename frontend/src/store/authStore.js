import { create } from 'zustand'

/**
 * État de session côté navigateur.
 *
 * La session elle-même est portée par un cookie HttpOnly : elle n'est ni
 * lisible ni stockable par ce code. Ce store ne conserve donc AUCUN jeton et
 * n'est PAS persisté — un rechargement de page redemande le compte courant au
 * serveur via `GET /auth/me`, seule source de vérité du rôle.
 */

const ETATS = Object.freeze({
  INCONNU: 'inconnu',
  AUTHENTIFIE: 'authentifie',
  ANONYME: 'anonyme',
})

export const useAuthStore = create((set) => ({
  utilisateur: null,
  statutSession: ETATS.INCONNU,

  /** Renseigne le compte courant après login ou après GET /auth/me. */
  definirUtilisateur: (utilisateur) =>
    set({ utilisateur, statutSession: ETATS.AUTHENTIFIE }),

  /** Session absente ou révoquée. */
  effacerSession: () => set({ utilisateur: null, statutSession: ETATS.ANONYME }),

  /** Message destiné à l'utilisateur pour une erreur de l'API. */
  messagePourErreur: (erreur) => {
    const statut = erreur?.response?.status
    if (statut === 401) {
      return 'Votre session a expiré. Veuillez vous reconnecter.'
    }
    if (statut === 403) {
      return "Vous n'avez pas la permission d'effectuer cette action."
    }
    return erreur?.response?.data?.message || 'Une erreur est survenue.'
  },
}))

export { ETATS }
