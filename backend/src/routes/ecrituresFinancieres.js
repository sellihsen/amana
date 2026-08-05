const express = require('express');
const router = express.Router();

const { pool } = require('../config/database');
const { ApiError } = require('../utils/errors');
const { formaterMontant } = require('../utils/money');
const { OPERATIONS } = require('../utils/idempotency');
const { auditerRequete, EVENEMENTS, RESULTATS } = require('../utils/audit');
const { avecIdempotence, insererEcriture } = require('../utils/posting');
const { debitSocialPossible } = require('../queries/finances');
const { asyncHandler } = require('../middleware/errorHandler');

const TYPES = [
  'DON', 'COTISATION_MEMBRE', 'ECOLAGE', 'DEPENSE',
  'PAIEMENT_SALAIRE', 'DISTRIBUTION_SOCIALE', 'CONTRE_ECRITURE',
];
const PERIMETRES = ['GENERAL', 'SOCIAL'];
const SENS = ['CREDIT', 'DEBIT'];

const LIMITE_DEFAUT = 50;
const LIMITE_MAX = 500;

function projeter(e) {
  if (!e) return null;
  return {
    ...e,
    montant: formaterMontant(e.montant),
    devise: e.devise || 'EUR',
    est_annulee: Boolean(e.est_annulee),
  };
}

/** Valeur de filtre appartenant obligatoirement à une liste fermée. */
function valeurAutorisee(valeur, liste, champ) {
  if (valeur === undefined || valeur === '') return null;
  if (!liste.includes(valeur)) {
    throw ApiError.validation({ [champ]: `Valeur attendue parmi : ${liste.join(', ')}.` });
  }
  return valeur;
}

function entierPositif(valeur, champ, defaut, max) {
  if (valeur === undefined || valeur === '') return defaut;
  const n = Number.parseInt(valeur, 10);
  if (!Number.isInteger(n) || n < 0) {
    throw ApiError.validation({ [champ]: 'Un entier positif est attendu.' });
  }
  return max === undefined ? n : Math.min(n, max);
}

function dateOuNull(valeur, champ) {
  if (valeur === undefined || valeur === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valeur)) {
    throw ApiError.validation({ [champ]: 'Format attendu : AAAA-MM-JJ.' });
  }
  return valeur;
}

/**
 * @swagger
 * /api/ecritures-financieres:
 *   get:
 *     summary: Rechercher dans le grand livre
 *     description: >
 *       Liste paginée des écritures. Tous les filtres sont paramétrés ; aucune
 *       valeur n'est interpolée dans le SQL.
 *     tags: [Grand livre]
 *     parameters:
 *       - { in: query, name: type,       schema: { type: string, enum: [DON, COTISATION_MEMBRE, ECOLAGE, DEPENSE, PAIEMENT_SALAIRE, DISTRIBUTION_SOCIALE, CONTRE_ECRITURE] } }
 *       - { in: query, name: perimetre,  schema: { type: string, enum: [GENERAL, SOCIAL] } }
 *       - { in: query, name: sens,       schema: { type: string, enum: [CREDIT, DEBIT] } }
 *       - { in: query, name: caisse_id,  schema: { type: integer } }
 *       - { in: query, name: acteur_id,  schema: { type: integer } }
 *       - { in: query, name: source_type, schema: { type: string } }
 *       - { in: query, name: source_id,  schema: { type: integer } }
 *       - { in: query, name: date_from,  schema: { type: string, format: date } }
 *       - { in: query, name: date_to,    schema: { type: string, format: date } }
 *       - { in: query, name: annulee,    schema: { type: string, enum: ['true', 'false'] } }
 *       - { in: query, name: limit,      schema: { type: integer, default: 50, maximum: 500 } }
 *       - { in: query, name: offset,     schema: { type: integer, default: 0 } }
 *     responses:
 *       200:
 *         description: Page d'écritures.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:  { type: array, items: { type: object } }
 *                 total:  { type: integer }
 *                 limit:  { type: integer }
 *                 offset: { type: integer }
 *       400: { description: VALIDATION_ERROR sur un filtre hors liste }
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const type = valeurAutorisee(req.query.type, TYPES, 'type');
    const perimetre = valeurAutorisee(req.query.perimetre, PERIMETRES, 'perimetre');
    const sens = valeurAutorisee(req.query.sens, SENS, 'sens');
    const annulee = valeurAutorisee(req.query.annulee, ['true', 'false'], 'annulee');
    const limit = entierPositif(req.query.limit, 'limit', LIMITE_DEFAUT, LIMITE_MAX);
    const offset = entierPositif(req.query.offset, 'offset', 0);
    const caisseId = req.query.caisse_id ? entierPositif(req.query.caisse_id, 'caisse_id') : null;
    const acteurId = req.query.acteur_id ? entierPositif(req.query.acteur_id, 'acteur_id') : null;
    const sourceId = req.query.source_id ? entierPositif(req.query.source_id, 'source_id') : null;
    const sourceType = req.query.source_type || null;
    const dateFrom = dateOuNull(req.query.date_from, 'date_from');
    const dateTo = dateOuNull(req.query.date_to, 'date_to');

    const filtres = `
      ($1::text IS NULL OR e.type_ecriture = $1)
      AND ($2::text IS NULL OR e.perimetre = $2)
      AND ($3::text IS NULL OR e.sens = $3)
      AND ($4::int  IS NULL OR e.caisse_id = $4)
      AND ($5::int  IS NULL OR e.cree_par = $5)
      AND ($6::text IS NULL OR e.source_type = $6)
      AND ($7::int  IS NULL OR e.source_id = $7)
      AND ($8::date IS NULL OR e.date_effet >= $8::date)
      AND ($9::date IS NULL OR e.date_effet <= $9::date)
      AND ($10::text IS NULL
           OR ($10 = 'true'  AND ce.id IS NOT NULL)
           OR ($10 = 'false' AND ce.id IS NULL))
    `;
    const valeurs = [
      type, perimetre, sens, caisseId, acteurId, sourceType, sourceId, dateFrom, dateTo, annulee,
    ];

    const { rows: items } = await pool.query(
      `SELECT e.*,
              c.nom AS caisse_nom,
              u.nom AS acteur_utilisateur,
              (ce.id IS NOT NULL) AS est_annulee,
              ce.id AS contre_ecriture_id
         FROM ecritures_financieres e
         LEFT JOIN caisses c ON c.id = e.caisse_id
         LEFT JOIN utilisateurs u ON u.id = e.cree_par
         LEFT JOIN ecritures_financieres ce ON ce.contre_ecriture_de = e.id
        WHERE ${filtres}
        ORDER BY e.date_effet DESC, e.id DESC
        LIMIT $11 OFFSET $12`,
      [...valeurs, limit, offset]
    );

    const { rows: comptage } = await pool.query(
      `SELECT COUNT(*)::int AS total
         FROM ecritures_financieres e
         LEFT JOIN ecritures_financieres ce ON ce.contre_ecriture_de = e.id
        WHERE ${filtres}`,
      valeurs
    );

    res.json({ items: items.map(projeter), total: comptage[0].total, limit, offset });
  })
);

/**
 * @swagger
 * /api/ecritures-financieres/{id}:
 *   get:
 *     summary: Détail d'une écriture
 *     description: Expose la relation entre l'écriture d'origine et sa contre-écriture.
 *     tags: [Grand livre]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: 'Écriture, avec origine ou contre-écriture liée' }
 *       404: { description: RESOURCE_NOT_FOUND }
 */
router.get(
  '/:id(\\d+)',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);

    const { rows } = await pool.query(
      `SELECT e.*,
              c.nom AS caisse_nom,
              (ce.id IS NOT NULL) AS est_annulee
         FROM ecritures_financieres e
         LEFT JOIN caisses c ON c.id = e.caisse_id
         LEFT JOIN ecritures_financieres ce ON ce.contre_ecriture_de = e.id
        WHERE e.id = $1`,
      [id]
    );
    const ecriture = rows[0];
    if (!ecriture) throw ApiError.notFound('Écriture introuvable.');

    const { rows: contre } = await pool.query(
      'SELECT * FROM ecritures_financieres WHERE contre_ecriture_de = $1',
      [id]
    );
    const { rows: origine } = ecriture.contre_ecriture_de
      ? await pool.query('SELECT * FROM ecritures_financieres WHERE id = $1', [
          ecriture.contre_ecriture_de,
        ])
      : { rows: [] };

    res.json({
      ...projeter(ecriture),
      contre_ecriture: contre[0] ? projeter(contre[0]) : null,
      origine: origine[0] ? projeter(origine[0]) : null,
    });
  })
);

/**
 * @swagger
 * /api/ecritures-financieres/{id}/contre-ecritures:
 *   post:
 *     summary: Contrepasser une écriture
 *     description: >
 *       Ajoute une écriture opposée du même montant, reprenant devise,
 *       périmètre et caisse de l'origine. L'écriture d'origine reste intacte :
 *       c'est la seule façon de corriger une opération comptabilisée.
 *       Une contre-écriture affectant une caisse Social ne peut pas rendre le
 *       disponible négatif.
 *     tags: [Grand livre]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: header
 *         name: Idempotency-Key
 *         required: true
 *         schema: { type: string, minLength: 1, maxLength: 128 }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [motif]
 *             properties:
 *               motif: { type: string, minLength: 1, example: 'Erreur de caisse lors de la saisie' }
 *     responses:
 *       201: { description: "Contre-écriture créée, avec l'origine" }
 *       400: { description: VALIDATION_ERROR (motif ou clé absent) }
 *       404: { description: RESOURCE_NOT_FOUND }
 *       409: { description: 'ALREADY_REVERSED, SOCIAL_BALANCE_INSUFFICIENT, IDEMPOTENCY_KEY_REUSED' }
 */
router.post(
  '/:id(\\d+)/contre-ecritures',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const motif = req.body ? req.body.motif : undefined;

    if (typeof motif !== 'string' || motif.trim() === '') {
      throw ApiError.validation({ motif: 'Un motif est requis pour une contre-écriture.' });
    }

    await avecIdempotence(
      req,
      res,
      OPERATIONS.CONTRE_ECRITURE_CREER,
      async (client, { idempotencyId }) => {
        const { rows } = await client.query(
          'SELECT * FROM ecritures_financieres WHERE id = $1 FOR UPDATE',
          [id]
        );
        const origine = rows[0];
        if (!origine) throw ApiError.notFound('Écriture introuvable.');

        if (origine.contre_ecriture_de !== null) {
          throw ApiError.validation({
            id: 'Une contre-écriture ne peut pas être contrepassée.',
          });
        }

        const { rows: dejaAnnulee } = await client.query(
          'SELECT id FROM ecritures_financieres WHERE contre_ecriture_de = $1',
          [id]
        );
        if (dejaAnnulee.length > 0) {
          throw ApiError.conflict(
            'ALREADY_REVERSED',
            'Cette écriture possède déjà une contre-écriture.'
          );
        }

        const sensInverse = origine.sens === 'CREDIT' ? 'DEBIT' : 'CREDIT';

        // Une contre-écriture Social qui débite la caisse suit la même règle de
        // solde que les distributions. Elle utilise le périmètre HISTORIQUE de
        // l'origine : la caisse a pu être désactivée ou réaffectée depuis.
        if (origine.perimetre === 'SOCIAL' && sensInverse === 'DEBIT' && origine.caisse_id) {
          await client.query('SELECT id FROM caisses WHERE id = $1 FOR UPDATE', [
            origine.caisse_id,
          ]);
          const { possible, disponible } = await debitSocialPossible(
            client,
            origine.caisse_id,
            formaterMontant(origine.montant)
          );
          if (!possible) {
            throw ApiError.conflict(
              'SOCIAL_BALANCE_INSUFFICIENT',
              `Annuler ce don rendrait le disponible négatif (disponible : ${formaterMontant(disponible)} €).`
            );
          }
        }

        const contre = await insererEcriture(client, req, {
          typeEcriture: 'CONTRE_ECRITURE',
          perimetre: origine.perimetre,
          sens: sensInverse,
          montant: formaterMontant(origine.montant),
          dateEffet: new Date().toISOString().slice(0, 10),
          sourceType: origine.source_type,
          sourceId: origine.source_id,
          caisseId: origine.caisse_id,
          contreEcritureDe: origine.id,
          motif: motif.trim(),
          idempotencyId,
        });

        await auditerRequete(client, req, {
          typeEvenement: EVENEMENTS.ECRITURE_CONTREPASSEE,
          resultat: RESULTATS.SUCCES,
          entiteType: 'ecriture_financiere',
          entiteId: origine.id,
          avant: projeter(origine),
          apres: projeter(contre),
        });

        return {
          httpStatus: 201,
          corps: { origine: projeter(origine), contre_ecriture: projeter(contre) },
          ressourceType: 'ecriture_financiere',
          ressourceId: contre.id,
        };
      }
    );
  })
);

/**
 * Le grand livre est append-only : aucune méthode de modification n'existe.
 */
router.all('/:id(\\d+)', (req, res, next) => {
  if (req.method === 'GET') return next();
  return next(
    ApiError.methodNotAllowed(
      'Le grand livre est append-only. Corrigez par une contre-écriture.'
    )
  );
});

module.exports = router;
