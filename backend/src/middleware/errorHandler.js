/**
 * Gestion centralisée des erreurs.
 *
 * Constitution III : « API responses MUST NOT expose internal detail — database
 * messages, constraint names, column names, or stack traces. Errors are logged
 * server-side with a correlation id and returned as a generic message plus that
 * id. »
 *
 * C'est le seul endroit où une exception devient une réponse HTTP.
 */

const { ApiError, estApiError } = require('../utils/errors');

/** Route inconnue : réponse au même format que les autres erreurs. */
function notFoundHandler(req, res, next) {
  next(ApiError.notFound());
}

/**
 * Traduit les erreurs connues qui ne sont pas encore des `ApiError`.
 * Aucune information de la base n'est reprise dans le message rendu.
 */
function normaliser(err) {
  if (estApiError(err)) return err;

  // Corps JSON illisible (express.json) — 400 côté client, pas 500.
  if (err instanceof SyntaxError && 'body' in err) {
    return ApiError.validation(
      { body: 'Le corps de la requête n’est pas un JSON valide.' },
      'Le corps de la requête est invalide.'
    );
  }

  // Corps trop volumineux.
  if (err.type === 'entity.too.large' || err.status === 413) {
    return ApiError.validation(
      { body: 'Le corps de la requête dépasse la taille autorisée.' },
      'La demande est trop volumineuse.'
    );
  }

  // Origine CORS refusée.
  if (err.code === 'CORS_ORIGIN_REFUSEE') {
    return ApiError.forbidden("L'origine de la requête n'est pas autorisée.");
  }

  // Erreurs PostgreSQL : jamais exposées telles quelles.
  if (typeof err.code === 'string' && /^[0-9A-Z]{5}$/.test(err.code)) {
    // Classe 22 « data exception » : la valeur fournie par le client ne peut
    // pas être représentée (entier hors bornes, texte non convertible, date
    // impossible). C'est une erreur de demande, pas une panne du serveur.
    // Le message reste générique : ni colonne, ni type, ni contrainte.
    if (err.code.startsWith('22')) {
      return ApiError.validation(
        { body: 'Une valeur fournie est hors des limites acceptées.' },
        'La demande contient des valeurs invalides.'
      );
    }
    return ApiError.internal(undefined, { pgCode: err.code });
  }

  return ApiError.internal();
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const apiError = normaliser(err);
  const requestIdValeur = req.id || null;

  // Le détail complet reste côté serveur, corrélé par l'identifiant de requête.
  if (apiError.httpStatus >= 500) {
    console.error(
      `[${requestIdValeur}] ${req.method} ${req.originalUrl} — ${err && err.stack ? err.stack : err}`
    );
  } else if (process.env.NODE_ENV !== 'test') {
    console.warn(
      `[${requestIdValeur}] ${req.method} ${req.originalUrl} — ${apiError.code}: ${apiError.message}`
    );
  }

  if (res.headersSent) return;

  const corps = {
    code: apiError.code,
    message: apiError.message,
    request_id: requestIdValeur,
  };
  if (apiError.fieldErrors) corps.field_errors = apiError.fieldErrors;

  res.status(apiError.httpStatus).json(corps);
}

/**
 * Convertit le résultat d'express-validator en `ApiError` VALIDATION_ERROR.
 * Utilisé par les routes qui déclarent des validateurs.
 */
function throwSiValidationEchoue(req) {
  const { validationResult } = require('express-validator');
  const resultat = validationResult(req);
  if (resultat.isEmpty()) return;

  const fieldErrors = {};
  for (const erreur of resultat.array()) {
    const champ = erreur.path || erreur.param || 'body';
    if (!fieldErrors[champ]) fieldErrors[champ] = erreur.msg;
  }
  throw ApiError.validation(fieldErrors);
}

/**
 * Enveloppe un gestionnaire asynchrone : toute exception rejoint le
 * gestionnaire central au lieu de produire une promesse non gérée.
 */
function asyncHandler(fn) {
  return function gestionnaire(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  notFoundHandler,
  errorHandler,
  throwSiValidationEchoue,
  asyncHandler,
};
