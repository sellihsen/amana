/**
 * Forme unique des erreurs de l'API.
 *
 * Constitution III : « API responses MUST NOT expose internal detail ».
 * Une `ApiError` porte un code stable, un message destiné à l'utilisateur et,
 * le cas échéant, des erreurs par champ. Toute autre exception est convertie en
 * `INTERNAL_ERROR` par le gestionnaire central : aucun message PostgreSQL,
 * nom de contrainte, de table ou de colonne ne franchit jamais la frontière
 * HTTP.
 */

/** Catalogue des codes d'erreur exposés — contrats/rest-api.md. */
const CODES = {
  VALIDATION_ERROR: 400,

  AUTHENTICATION_REQUIRED: 401,
  SESSION_INACTIVE: 401,

  FORBIDDEN: 403,

  RESOURCE_NOT_FOUND: 404,

  METHOD_NOT_ALLOWED: 405,

  REGISTRATION_CLOSED: 410,

  DUPLICATE_OPERATION: 409,
  IDEMPOTENCY_KEY_REUSED: 409,
  ALREADY_REVERSED: 409,
  SOCIAL_BALANCE_INSUFFICIENT: 409,
  STOCK_INSUFFICIENT: 409,
  INACTIVE_REFERENCE: 409,
  HISTORY_EXISTS: 409,

  INVALID_MONEY_SCALE: 422,
  INVALID_PERIOD: 422,

  TOO_MANY_REQUESTS: 429,

  INTERNAL_ERROR: 500,
};

const MESSAGES_PAR_DEFAUT = {
  VALIDATION_ERROR: 'La demande contient des valeurs invalides.',
  AUTHENTICATION_REQUIRED: 'Une session valide est requise.',
  SESSION_INACTIVE: 'La session n’est plus valide.',
  FORBIDDEN: 'Vous n’avez pas la permission d’effectuer cette action.',
  RESOURCE_NOT_FOUND: 'La ressource demandée est introuvable.',
  METHOD_NOT_ALLOWED: 'Cette opération n’est pas autorisée sur cette ressource.',
  REGISTRATION_CLOSED: 'L’inscription anonyme est fermée.',
  DUPLICATE_OPERATION: 'Cette opération a déjà été enregistrée.',
  IDEMPOTENCY_KEY_REUSED:
    'Cette clé d’idempotence a déjà été utilisée avec une demande différente.',
  ALREADY_REVERSED: 'Cette écriture possède déjà une contre-écriture.',
  SOCIAL_BALANCE_INSUFFICIENT: 'Le solde disponible de la caisse est insuffisant.',
  STOCK_INSUFFICIENT: 'La quantité en stock est insuffisante.',
  INACTIVE_REFERENCE: 'Une des références sélectionnées n’est plus active.',
  HISTORY_EXISTS: 'Cet élément possède un historique et ne peut pas être supprimé.',
  INVALID_MONEY_SCALE: 'Le montant doit comporter exactement deux décimales.',
  INVALID_PERIOD: 'La période indiquée est invalide.',
  TOO_MANY_REQUESTS: 'Trop de tentatives. Réessayez plus tard.',
  INTERNAL_ERROR: 'Une erreur interne est survenue.',
};

class ApiError extends Error {
  /**
   * @param {keyof CODES} code
   * @param {string}  [message]      Message destiné à l'utilisateur final.
   * @param {object}  [options]
   * @param {object}  [options.fieldErrors]  Erreurs par champ.
   * @param {object}  [options.details]      Contexte journalisé côté serveur uniquement.
   */
  constructor(code, message, { fieldErrors, details } = {}) {
    const httpStatus = CODES[code];
    if (!httpStatus) {
      throw new Error(`Code d'erreur inconnu : ${code}`);
    }
    super(message || MESSAGES_PAR_DEFAUT[code]);
    this.name = 'ApiError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.expose = true;
    if (fieldErrors) this.fieldErrors = fieldErrors;
    // `details` n'est jamais sérialisé dans la réponse ; il alimente le log.
    if (details) this.details = details;
  }

  static validation(fieldErrors, message) {
    return new ApiError('VALIDATION_ERROR', message, { fieldErrors });
  }

  static authenticationRequired(message) {
    return new ApiError('AUTHENTICATION_REQUIRED', message);
  }

  static sessionInactive(message) {
    return new ApiError('SESSION_INACTIVE', message);
  }

  static forbidden(message) {
    return new ApiError('FORBIDDEN', message);
  }

  static notFound(message) {
    return new ApiError('RESOURCE_NOT_FOUND', message);
  }

  static methodNotAllowed(message) {
    return new ApiError('METHOD_NOT_ALLOWED', message);
  }

  static conflict(code, message, options) {
    if (CODES[code] !== 409) {
      throw new Error(`Code de conflit invalide : ${code}`);
    }
    return new ApiError(code, message, options);
  }

  static unprocessable(code, message, options) {
    if (CODES[code] !== 422) {
      throw new Error(`Code 422 invalide : ${code}`);
    }
    return new ApiError(code, message, options);
  }

  static internal(message, options) {
    return new ApiError('INTERNAL_ERROR', message, options);
  }
}

function estApiError(err) {
  return err instanceof ApiError;
}

module.exports = { ApiError, CODES, MESSAGES_PAR_DEFAUT, estApiError };
