const path = require('path');
const swaggerJsdoc = require('swagger-jsdoc');

// Configuration OpenAPI partagée. `app.js` et les tests de contrat consomment
// exactement le même document ; il n'existe pas de seconde définition.
// Les chemins des sources sont absolus afin que le document soit identique
// quel que soit le répertoire courant du processus (serveur, test, CI).
const apis = [
  // `app.js` porte l'annotation de /api/health, seule route hors routeur.
  path.join(__dirname, '..', 'app.js'),
  path.join(__dirname, '..', 'routes', '*.js'),
  path.join(__dirname, '..', 'routes', 'admin', '*.js'),
];

const definition = {
  openapi: '3.0.0',
  info: {
    title: 'API Amana',
    version: '1.0.0',
    description:
      "API de gestion administrative et financière de la mosquée. " +
      "La session est portée par un cookie HttpOnly ; aucun jeton n'est " +
      "retourné dans le corps des réponses.",
  },
  servers: [{ url: '/', description: 'Serveur courant' }],
  components: {
    securitySchemes: {
      sessionCookie: {
        type: 'apiKey',
        in: 'cookie',
        name: 'session',
        description:
          "Cookie de session HttpOnly, SameSite=Strict, émis par POST /api/auth/login.",
      },
    },
    schemas: {
      /** Montant exact : toujours une CHAÎNE à deux décimales, jamais un nombre. */
      MoneyEUR: {
        type: 'string',
        pattern: '^(0|[1-9][0-9]*)\\.[0-9]{2}$',
        example: '125.00',
        description:
          'Montant EUR exact. Une précision différente est refusée, jamais arrondie.',
      },
      Error: {
        type: 'object',
        required: ['code', 'message', 'request_id'],
        properties: {
          code: { type: 'string', example: 'VALIDATION_ERROR' },
          message: { type: 'string', example: 'La demande contient des valeurs invalides.' },
          request_id: { type: 'string', format: 'uuid' },
          field_errors: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: 'Erreurs par champ, lorsqu’elles sont applicables.',
          },
        },
        description:
          'Forme unique des erreurs. Ne contient jamais de message base, de nom de contrainte, de table, de colonne ni de pile.',
      },
      AuditEvent: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          type_evenement: { type: 'string', example: 'don.posted' },
          resultat: { type: 'string', enum: ['SUCCES', 'REFUS', 'ECHEC'] },
          acteur_type: { type: 'string', enum: ['UTILISATEUR', 'SYSTEME', 'MIGRATION'] },
          utilisateur_id: { type: 'integer', nullable: true },
          utilisateur_nom: { type: 'string', nullable: true },
          acteur_role: { type: 'string', enum: ['admin', 'tresorier', 'lecteur'], nullable: true },
          entite_type: { type: 'string', nullable: true },
          entite_id: { type: 'string', nullable: true },
          avant: { type: 'object', nullable: true },
          apres: { type: 'object', nullable: true },
          request_id: { type: 'string', format: 'uuid', nullable: true },
          ip: { type: 'string', nullable: true },
          date_action: { type: 'string', format: 'date-time' },
        },
        description: 'Entrée de journal append-only : ni modifiable ni supprimable.',
      },
      FinancialEntry: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          type_ecriture: {
            type: 'string',
            enum: [
              'DON', 'COTISATION_MEMBRE', 'ECOLAGE', 'DEPENSE',
              'PAIEMENT_SALAIRE', 'DISTRIBUTION_SOCIALE', 'CONTRE_ECRITURE',
            ],
          },
          perimetre: { type: 'string', enum: ['GENERAL', 'SOCIAL'] },
          sens: { type: 'string', enum: ['CREDIT', 'DEBIT'] },
          montant: { $ref: '#/components/schemas/MoneyEUR' },
          devise: { type: 'string', enum: ['EUR'] },
          date_effet: { type: 'string', format: 'date' },
          source_type: { type: 'string' },
          source_id: { type: 'integer', nullable: true },
          caisse_id: { type: 'integer', nullable: true },
          acteur_nom: { type: 'string' },
          acteur_role: { type: 'string', nullable: true },
          contre_ecriture_de: { type: 'integer', nullable: true },
          motif: { type: 'string', nullable: true },
          est_annulee: { type: 'boolean' },
          created_at: { type: 'string', format: 'date-time' },
        },
        description: 'Ligne du grand livre : append-only, corrigible seulement par contre-écriture.',
      },
    },
    parameters: {
      IdempotencyKey: {
        in: 'header',
        name: 'Idempotency-Key',
        required: true,
        schema: { type: 'string', minLength: 1, maxLength: 128 },
        description:
          'Même clé + même contenu retourne le résultat initial ; même clé + contenu différent retourne 409.',
      },
    },
    responses: {
      Unauthorized: {
        description: 'Session absente, expirée, révoquée ou compte inactif.',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      Forbidden: {
        description: 'Session valide mais permission insuffisante.',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
    },
  },
  // Refus par défaut : toute opération exige la session sauf mention contraire
  // explicite (`security: []`) sur l'opération elle-même.
  security: [{ sessionCookie: [] }],
};

const METHODES_HTTP = ['get', 'post', 'put', 'patch', 'delete'];

/**
 * Complète le document avec les conséquences du refus par défaut.
 *
 * L'authentification et l'autorisation sont imposées globalement dans
 * `app.js` : toute opération non publique peut donc répondre 401, et toute
 * opération `/api/admin/**` peut répondre 403. Documenter cette règle une fois
 * ici évite de la recopier — et de l'oublier — sur chaque route.
 */
function appliquerRefusParDefaut(spec) {
  for (const [chemin, operations] of Object.entries(spec.paths || {})) {
    for (const [methode, operation] of Object.entries(operations)) {
      if (!METHODES_HTTP.includes(methode)) continue;

      // Opération explicitement publique : elle ne reçoit aucun code d'accès.
      if (Array.isArray(operation.security) && operation.security.length === 0) continue;

      operation.responses = operation.responses || {};
      if (!operation.responses['401']) {
        operation.responses['401'] = { $ref: '#/components/responses/Unauthorized' };
      }

      // L'administration exige la capacité ADMIN ; les écritures métier
      // exigent BUSINESS_WRITE. Les deux peuvent donc produire un 403.
      const estAdmin = chemin.startsWith('/api/admin/');
      const estEcriture = methode !== 'get';
      if ((estAdmin || estEcriture) && !operation.responses['403']) {
        operation.responses['403'] = { $ref: '#/components/responses/Forbidden' };
      }
    }
  }
  return spec;
}

function buildSwaggerSpec() {
  return appliquerRefusParDefaut(swaggerJsdoc({ definition, apis }));
}

module.exports = { buildSwaggerSpec, definition, apis };
