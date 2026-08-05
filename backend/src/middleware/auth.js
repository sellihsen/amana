/**
 * Vérification de session.
 *
 * À CHAQUE requête :
 *  1. la session est lue dans le cookie HttpOnly — jamais dans un en-tête
 *     `Authorization`, jamais dans le corps;
 *  2. la signature est vérifiée avec l'algorithme épinglé (HS256) : un jeton
 *     « alg: none » ou signé autrement est rejeté;
 *  3. le compte est RELU EN BASE. Le rôle, le statut et `auth_version` viennent
 *     de la base, pas du jeton : une désactivation, une suppression ou une
 *     rétrogradation prend effet immédiatement.
 *
 * Constitution III : « Client-supplied input MUST NOT determine privilege. »
 */

const jwt = require('jsonwebtoken');

const { pool } = require('../config/database');
const { obtenirConfig } = require('../config/env');
const { ApiError } = require('../utils/errors');

/** Routes accessibles sans session — liste exhaustive et justifiée. */
const ROUTES_PUBLIQUES = Object.freeze([
  // Nécessaire pour établir une session.
  { methode: 'POST', chemin: '/auth/login' },
  // Supervision : ne divulgue aucune donnée métier.
  { methode: 'GET', chemin: '/health' },
]);

/**
 * Route supprimée : elle répond 410 à tout le monde, avec ou sans session.
 * L'exposer sans authentification ne divulgue rien — elle n'exécute plus
 * aucune logique — et indique sans ambiguïté aux intégrations que
 * l'inscription anonyme a été fermée.
 */
const ROUTES_SUPPRIMEES = Object.freeze(['/auth/register']);

function estRoutePublique(req) {
  // Le préflight CORS ne porte jamais de cookie : il doit aboutir pour que la
  // requête réelle, elle, soit authentifiée.
  if (req.method === 'OPTIONS') return true;

  const chemin = req.path || '';

  if (ROUTES_SUPPRIMEES.includes(chemin)) return true;

  return ROUTES_PUBLIQUES.some(
    (route) => route.methode === req.method && route.chemin === chemin
  );
}

/** Construit le cookie de session. */
function optionsCookieSession() {
  const { session } = obtenirConfig();
  return {
    httpOnly: true,
    secure: session.secure,
    sameSite: session.sameSite,
    path: '/',
  };
}

/**
 * Émet la session. La charge utile est minimale : identifiant et version
 * d'authentification. Ni le rôle ni l'adresse n'y figurent — ils seraient
 * périmés dès la requête suivante.
 */
function emettreSession(res, utilisateur) {
  const config = obtenirConfig();
  const jeton = jwt.sign(
    { sub: utilisateur.id, av: utilisateur.auth_version },
    config.jwt.secret,
    { algorithm: config.jwt.algorithme, expiresIn: config.jwt.expiresIn }
  );

  res.cookie(config.session.cookieName, jeton, {
    ...optionsCookieSession(),
    maxAge: 8 * 60 * 60 * 1000,
  });
  return jeton;
}

function effacerSession(res) {
  const config = obtenirConfig();
  res.clearCookie(config.session.cookieName, optionsCookieSession());
}

/**
 * Garde d'authentification, montée une fois pour tout `/api`.
 */
async function authentifier(req, res, next) {
  try {
    if (estRoutePublique(req)) return next();

    const config = obtenirConfig();
    const jeton = req.cookies ? req.cookies[config.session.cookieName] : null;

    if (!jeton) {
      throw ApiError.authenticationRequired();
    }

    let charge;
    try {
      charge = jwt.verify(jeton, config.jwt.secret, {
        algorithms: [config.jwt.algorithme],
      });
    } catch (_) {
      // Signature invalide, algorithme non conforme ou session expirée : la
      // cause exacte ne regarde pas le client.
      throw ApiError.authenticationRequired();
    }

    const { rows } = await pool.query(
      `SELECT id, nom, email, role, statut, auth_version
         FROM utilisateurs WHERE id = $1`,
      [charge.sub]
    );
    const utilisateur = rows[0];

    // Compte supprimé depuis l'émission de la session.
    if (!utilisateur) throw ApiError.sessionInactive();

    // Compte désactivé depuis l'émission de la session.
    if (utilisateur.statut !== 'actif') throw ApiError.sessionInactive();

    // Session révoquée : mot de passe, rôle ou statut modifié entre-temps.
    if (utilisateur.auth_version !== charge.av) throw ApiError.sessionInactive();

    req.utilisateur = utilisateur;
    // Alias hérité, conservé le temps de convertir les routes restantes (T106).
    req.user = utilisateur;

    return next();
  } catch (err) {
    return next(err);
  }
}

/**
 * Compatibilité : les routes déclarent encore `auth` individuellement.
 * La garde globale ayant déjà résolu la session, cet appel devient un passe-plat.
 */
function authMiddleware(req, res, next) {
  if (req.utilisateur) return next();
  return authentifier(req, res, next);
}

module.exports = authMiddleware;
module.exports.authentifier = authentifier;
module.exports.emettreSession = emettreSession;
module.exports.effacerSession = effacerSession;
module.exports.estRoutePublique = estRoutePublique;
module.exports.ROUTES_PUBLIQUES = ROUTES_PUBLIQUES;
module.exports.ROUTES_SUPPRIMEES = ROUTES_SUPPRIMEES;
module.exports.optionsCookieSession = optionsCookieSession;
