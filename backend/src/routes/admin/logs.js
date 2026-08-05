const express = require('express');
const router = express.Router();

const { pool } = require('../../config/database');
const { ApiError } = require('../../utils/errors');
const { EVENEMENTS, RESULTATS } = require('../../utils/audit');
const { asyncHandler } = require('../../middleware/errorHandler');

// L'accès administrateur est imposé par le refus par défaut de `app.js`.

const LIMITE_DEFAUT = 50;
const LIMITE_MAX = 500;

const CODES_EVENEMENT = Object.values(EVENEMENTS);
const RESULTATS_VALIDES = Object.values(RESULTATS);

function valeurAutorisee(valeur, liste, champ) {
  if (valeur === undefined || valeur === '') return null;
  if (!liste.includes(valeur)) {
    throw ApiError.validation({ [champ]: `Valeur attendue parmi : ${liste.join(', ')}.` });
  }
  return valeur;
}

function entier(valeur, champ, defaut, max) {
  if (valeur === undefined || valeur === '') return defaut;
  const n = Number(valeur);
  if (!Number.isInteger(n) || n < 0) {
    throw ApiError.validation({ [champ]: 'Un entier positif est attendu.' });
  }
  return max === undefined ? n : Math.min(n, max);
}

function date(valeur, champ) {
  if (valeur === undefined || valeur === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valeur)) {
    throw ApiError.validation({ [champ]: 'Format attendu : AAAA-MM-JJ.' });
  }
  return valeur;
}

/**
 * @swagger
 * /api/admin/audit-events:
 *   get:
 *     summary: Journal d'audit
 *     description: >
 *       Journal append-only de toutes les opérations. Aucune méthode de
 *       modification n'est exposée : POST, PUT, PATCH et DELETE n'existent pas.
 *       Une panne remonte en erreur, jamais sous forme de liste vide.
 *     tags: [Administration]
 *     parameters:
 *       - { in: query, name: event_type,    schema: { type: string } }
 *       - { in: query, name: actor_user_id, schema: { type: integer } }
 *       - { in: query, name: resultat,      schema: { type: string, enum: [SUCCES, REFUS, ECHEC] } }
 *       - { in: query, name: entity_type,   schema: { type: string } }
 *       - { in: query, name: entity_id,     schema: { type: string } }
 *       - { in: query, name: date_from,     schema: { type: string, format: date } }
 *       - { in: query, name: date_to,       schema: { type: string, format: date } }
 *       - { in: query, name: search,        schema: { type: string } }
 *       - { in: query, name: limit,         schema: { type: integer, default: 50, maximum: 500 } }
 *       - { in: query, name: offset,        schema: { type: integer, default: 0 } }
 *     responses:
 *       200:
 *         description: Page d'événements.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:  { type: array, items: { type: object } }
 *                 total:  { type: integer }
 *                 limit:  { type: integer }
 *                 offset: { type: integer }
 *       400: { description: VALIDATION_ERROR sur un filtre }
 *       401: { description: Session requise }
 *       403: { description: Réservé au rôle admin }
 */
const listerEvenements = asyncHandler(async (req, res) => {
  const eventType = valeurAutorisee(req.query.event_type, CODES_EVENEMENT, 'event_type');
  const resultat = valeurAutorisee(req.query.resultat, RESULTATS_VALIDES, 'resultat');
  const acteurId = req.query.actor_user_id
    ? entier(req.query.actor_user_id, 'actor_user_id')
    : null;
  const entityType = req.query.entity_type || null;
  const entityId = req.query.entity_id ? String(req.query.entity_id) : null;
  const dateFrom = date(req.query.date_from, 'date_from');
  const dateTo = date(req.query.date_to, 'date_to');
  const recherche = req.query.search ? String(req.query.search) : null;
  const limit = entier(req.query.limit, 'limit', LIMITE_DEFAUT, LIMITE_MAX);
  const offset = entier(req.query.offset, 'offset', 0);

  // Tous les filtres sont paramétrés ; aucune valeur n'atteint le SQL.
  const filtres = `
    ($1::text IS NULL OR l.type_evenement = $1)
    AND ($2::int  IS NULL OR l.utilisateur_id = $2)
    AND ($3::text IS NULL OR l.resultat = $3)
    AND ($4::text IS NULL OR l.entite_type = $4)
    AND ($5::text IS NULL OR l.entite_id = $5)
    AND ($6::date IS NULL OR l.date_action >= $6::date)
    AND ($7::date IS NULL OR l.date_action < ($7::date + INTERVAL '1 day'))
    AND ($8::text IS NULL OR (
          l.utilisateur_nom ILIKE '%' || $8 || '%'
       OR l.type_evenement  ILIKE '%' || $8 || '%'
       OR l.entite_type     ILIKE '%' || $8 || '%'
       OR COALESCE(l.avant::text, '') ILIKE '%' || $8 || '%'
       OR COALESCE(l.apres::text, '') ILIKE '%' || $8 || '%'
        ))
  `;
  const valeurs = [eventType, acteurId, resultat, entityType, entityId, dateFrom, dateTo, recherche];

  const { rows: items } = await pool.query(
    `SELECT l.*, t.description AS evenement_description
       FROM logs_activite l
       LEFT JOIN types_evenement_audit t ON t.code = l.type_evenement
      WHERE ${filtres}
      ORDER BY l.date_action DESC, l.id DESC
      LIMIT $9 OFFSET $10`,
    [...valeurs, limit, offset]
  );

  const { rows: comptage } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM logs_activite l WHERE ${filtres}`,
    valeurs
  );

  res.json({ items, total: comptage[0].total, limit, offset });
});

router.get('/', listerEvenements);

/**
 * Le journal est append-only : aucune route de modification n'existe.
 * Une tentative reçoit 405 plutôt qu'un 404 ambigu.
 */
router.all('/', (req, res, next) => {
  if (req.method === 'GET') return next();
  next(ApiError.methodNotAllowed('Le journal d’audit est append-only.'));
});

router.all('/:id(\\d+)', (req, res, next) => {
  next(ApiError.methodNotAllowed('Le journal d’audit est append-only.'));
});

module.exports = router;
module.exports.listerEvenements = listerEvenements;
