/**
 * Matrice d'autorisation — autorité unique.
 *
 * Constitution III & V : l'autorisation est décidée côté serveur, à un seul
 * endroit. Aucune route ne réinvente sa propre règle, et une route qui oublie
 * de se déclarer reste protégée par le refus par défaut appliqué dans `app.js`.
 *
 * | Capacité        | admin | tresorier | lecteur |
 * |-----------------|-------|-----------|---------|
 * | READ            | oui   | oui       | oui     |
 * | BUSINESS_WRITE  | oui   | oui       | non     |
 * | ADMIN           | oui   | non       | non     |
 */

const { ApiError } = require('../utils/errors');

const CAPACITES = Object.freeze({
  READ: 'READ',
  BUSINESS_WRITE: 'BUSINESS_WRITE',
  ADMIN: 'ADMIN',
});

/** Rôles reconnus. Une valeur hors de cette liste n'obtient jamais rien. */
const ROLES = Object.freeze(['admin', 'tresorier', 'lecteur']);

const MATRICE = Object.freeze({
  admin: Object.freeze([CAPACITES.READ, CAPACITES.BUSINESS_WRITE, CAPACITES.ADMIN]),
  tresorier: Object.freeze([CAPACITES.READ, CAPACITES.BUSINESS_WRITE]),
  lecteur: Object.freeze([CAPACITES.READ]),
});

/**
 * @param {string|undefined} role
 * @param {string} capacite
 * @returns {boolean}
 */
function possede(role, capacite) {
  if (!role || !Object.prototype.hasOwnProperty.call(MATRICE, role)) return false;
  return MATRICE[role].includes(capacite);
}

/**
 * Middleware exigeant une capacité.
 *
 * L'absence de session produit 401 ; une session valide mais insuffisante
 * produit 403. La distinction est explicitement exigée par le contrat.
 */
function exiger(capacite) {
  if (!Object.values(CAPACITES).includes(capacite)) {
    throw new Error(`Capacité inconnue : ${capacite}`);
  }

  return function verifierCapacite(req, res, next) {
    const utilisateur = req.utilisateur;

    if (!utilisateur) {
      return next(ApiError.authenticationRequired());
    }

    if (!possede(utilisateur.role, capacite)) {
      return next(ApiError.forbidden());
    }

    return next();
  };
}

const exigerLecture = exiger(CAPACITES.READ);
const exigerEcritureMetier = exiger(CAPACITES.BUSINESS_WRITE);
const exigerAdmin = exiger(CAPACITES.ADMIN);

/** Méthodes considérées comme des lectures. */
const METHODES_LECTURE = Object.freeze(['GET', 'HEAD', 'OPTIONS']);

/**
 * Refus par défaut appliqué à tout `/api`, avant les routeurs.
 *
 * Une route nouvelle ou oubliée hérite automatiquement de la bonne exigence :
 *  - `/api/admin/**`            → ADMIN;
 *  - `/api/auth/**`             → session seulement (logout et me sont des
 *                                 opérations de session, pas des écritures métier);
 *  - toute autre écriture       → BUSINESS_WRITE;
 *  - toute autre lecture        → READ.
 */
function autorisationParDefaut(req, res, next) {
  // Les routes publiques ont déjà été justifiées dans `middleware/auth.js` :
  // elles n'ont pas d'utilisateur et ne peuvent donc porter aucune capacité.
  const { estRoutePublique } = require('./auth');
  if (estRoutePublique(req)) return next();

  const chemin = req.path || '';

  if (chemin === '/auth' || chemin.startsWith('/auth/')) {
    return exigerLecture(req, res, next);
  }

  if (chemin === '/admin' || chemin.startsWith('/admin/')) {
    return exigerAdmin(req, res, next);
  }

  if (METHODES_LECTURE.includes(req.method)) {
    return exigerLecture(req, res, next);
  }

  return exigerEcritureMetier(req, res, next);
}

module.exports = {
  CAPACITES,
  ROLES,
  MATRICE,
  possede,
  exiger,
  exigerLecture,
  exigerEcritureMetier,
  exigerAdmin,
  autorisationParDefaut,
  METHODES_LECTURE,
};
