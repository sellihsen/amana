/**
 * Configuration applicative — validée au démarrage, sans valeur de repli.
 *
 * Constitution III : « Required configuration MUST be validated at startup; a
 * missing or empty secret MUST abort boot rather than fall back to a default. »
 *
 * Toutes les variables listées dans `VARIABLES_REQUISES` sont documentées dans
 * `backend/.env.example`. Une variable absente, vide ou invalide interrompt le
 * démarrage en énumérant *tous* les problèmes d'un coup.
 */

/** Variables sans lesquelles l'application ne peut pas démarrer. */
const VARIABLES_REQUISES = [
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD',
  'JWT_SECRET',
  'JWT_EXPIRES_IN',
  'FRONTEND_URL',
];

const JWT_SECRET_LONGUEUR_MIN = 32;

/** Valeurs manifestement issues du gabarit : refusées comme un secret absent. */
const SECRETS_INTERDITS = [
  'changez_cette_cle_secrete_par_une_valeur_aleatoire_longue',
  'votre_mot_de_passe_ici',
  'changeme',
  'secret',
];

function estVide(valeur) {
  return valeur === undefined || valeur === null || String(valeur).trim() === '';
}

/**
 * Valide un environnement et produit la configuration applicative.
 *
 * @param {Record<string, string|undefined>} [env]
 * @returns {object} configuration figée.
 * @throws {Error} énumérant toutes les variables fautives.
 */
function chargerConfig(env = process.env) {
  const problemes = [];

  for (const variable of VARIABLES_REQUISES) {
    if (estVide(env[variable])) {
      problemes.push(`${variable} est requise et ne doit pas être vide.`);
    }
  }

  const port = env.DB_PORT;
  if (!estVide(port) && !/^\d+$/.test(String(port).trim())) {
    problemes.push('DB_PORT doit être un entier.');
  } else if (!estVide(port)) {
    const n = parseInt(String(port).trim(), 10);
    if (n < 1 || n > 65535) problemes.push('DB_PORT doit être compris entre 1 et 65535.');
  }

  const secret = env.JWT_SECRET;
  if (!estVide(secret)) {
    if (String(secret).trim().length < JWT_SECRET_LONGUEUR_MIN) {
      problemes.push(
        `JWT_SECRET doit comporter au moins ${JWT_SECRET_LONGUEUR_MIN} caractères.`
      );
    }
    if (SECRETS_INTERDITS.includes(String(secret).trim().toLowerCase())) {
      problemes.push(
        'JWT_SECRET reprend la valeur du gabarit : générez une clé aléatoire.'
      );
    }
  }

  if (!estVide(env.FRONTEND_URL)) {
    try {
      // eslint-disable-next-line no-new
      new URL(String(env.FRONTEND_URL).trim());
    } catch (_) {
      problemes.push('FRONTEND_URL doit être une URL absolue.');
    }
  }

  if (!estVide(env.JWT_EXPIRES_IN) && !/^\d+[smhd]?$/.test(String(env.JWT_EXPIRES_IN).trim())) {
    problemes.push("JWT_EXPIRES_IN doit être une durée, par exemple « 8h ».");
  }

  if (problemes.length > 0) {
    throw new Error(
      'Configuration invalide — démarrage interrompu :\n' +
        problemes.map((p) => `  • ${p}`).join('\n') +
        '\nVoir backend/.env.example pour la liste complète des variables.'
    );
  }

  const nodeEnv = env.NODE_ENV || 'development';

  return Object.freeze({
    nodeEnv,
    estProduction: nodeEnv === 'production',
    estTest: nodeEnv === 'test',

    port: parseInt(env.PORT, 10) || 3001,
    frontendUrl: String(env.FRONTEND_URL).trim(),

    db: Object.freeze({
      host: String(env.DB_HOST).trim(),
      port: parseInt(String(env.DB_PORT).trim(), 10),
      database: String(env.DB_NAME).trim(),
      user: String(env.DB_USER).trim(),
      password: String(env.DB_PASSWORD),
    }),

    jwt: Object.freeze({
      secret: String(env.JWT_SECRET).trim(),
      expiresIn: String(env.JWT_EXPIRES_IN).trim(),
      algorithme: 'HS256',
    }),

    session: Object.freeze({
      cookieName: env.SESSION_COOKIE_NAME || 'session',
      // `Secure` exige HTTPS : activé hors développement.
      secure: nodeEnv === 'production',
      sameSite: 'strict',
    }),

    // `/api-docs` : admin-only en local, désactivé en production sauf demande
    // explicite (contrats/rest-api.md).
    apiDocsActives:
      nodeEnv === 'production' ? env.API_DOCS_ENABLED === 'true' : true,

    limiteCorpsRequete: env.REQUEST_BODY_LIMIT || '100kb',

    // Coût bcrypt. Abaissé uniquement en test : hacher à 12 tours des dizaines
    // de comptes rendrait la suite inutilisable, sans rien prouver de plus.
    bcryptRounds: parseInt(env.BCRYPT_ROUNDS, 10) || (nodeEnv === 'test' ? 4 : 12),

    // Limitation des tentatives de connexion.
    login: Object.freeze({
      fenetreMs: parseInt(env.LOGIN_RATE_WINDOW_MS, 10) || 15 * 60 * 1000,
      maxTentatives: parseInt(env.LOGIN_RATE_MAX, 10) || 10,
    }),
  });
}

let configMemoisee = null;

/** Configuration validée, calculée une seule fois. */
function obtenirConfig(env) {
  if (env) return chargerConfig(env);
  if (!configMemoisee) configMemoisee = chargerConfig(process.env);
  return configMemoisee;
}

/** Réinitialise le cache (tests uniquement). */
function reinitialiserConfig() {
  configMemoisee = null;
}

module.exports = {
  VARIABLES_REQUISES,
  JWT_SECRET_LONGUEUR_MIN,
  chargerConfig,
  obtenirConfig,
  reinitialiserConfig,
};
