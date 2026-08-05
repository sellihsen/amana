/**
 * Capacités de PRÉSENTATION.
 *
 * ⚠️  Ce module ne sécurise rien. Il évite seulement de proposer à
 * l'utilisateur une action que le serveur lui refusera. L'autorité reste
 * `backend/src/middleware/authorize.js`, et toute divergence entre les deux
 * matrices est un défaut.
 *
 * | Capacité        | admin | tresorier | lecteur |
 * |-----------------|-------|-----------|---------|
 * | READ            | oui   | oui       | oui     |
 * | BUSINESS_WRITE  | oui   | oui       | non     |
 * | ADMIN           | oui   | non       | non     |
 */

export const CAPACITES = Object.freeze({
  READ: 'READ',
  BUSINESS_WRITE: 'BUSINESS_WRITE',
  ADMIN: 'ADMIN',
})

export const ROLES = Object.freeze(['admin', 'tresorier', 'lecteur'])

const MATRICE = Object.freeze({
  admin: [CAPACITES.READ, CAPACITES.BUSINESS_WRITE, CAPACITES.ADMIN],
  tresorier: [CAPACITES.READ, CAPACITES.BUSINESS_WRITE],
  lecteur: [CAPACITES.READ],
})

/**
 * @param {string|null|undefined} role
 * @param {string} capacite
 * @returns {boolean} faux pour tout rôle inconnu ou absent.
 */
export function possede(role, capacite) {
  if (!role || !Object.prototype.hasOwnProperty.call(MATRICE, role)) return false
  return MATRICE[role].includes(capacite)
}

export const peutLire = (role) => possede(role, CAPACITES.READ)
export const peutEcrireMetier = (role) => possede(role, CAPACITES.BUSINESS_WRITE)
export const peutAdministrer = (role) => possede(role, CAPACITES.ADMIN)

/** Libellé lisible d'un rôle, pour l'affichage. */
export const LIBELLES_ROLE = Object.freeze({
  admin: 'Administrateur',
  tresorier: 'Trésorier',
  lecteur: 'Lecteur',
})

export function libelleRole(role) {
  return LIBELLES_ROLE[role] || 'Inconnu'
}
