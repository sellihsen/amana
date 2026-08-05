const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const auth = require('../middleware/auth');
const { ApiError } = require('../utils/errors');
const {
  validerMontantPositif,
  validerMontantNonNegatif,
  formaterMontant,
} = require('../utils/money');
const { OPERATIONS } = require('../utils/idempotency');
const { auditerRequete, EVENEMENTS, RESULTATS } = require('../utils/audit');
const { avecIdempotence, insererEcriture, rattacherSource, chargerCaisseActive } = require('../utils/posting');
const { withTransaction } = require('../utils/transaction');
const { bilanSocial, debitSocialPossible } = require('../queries/finances');
const { asyncHandler } = require('../middleware/errorHandler');

// ─── BILAN SOCIAL ─────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/social/bilan:
 *   get:
 *     summary: Bilan de l'aide sociale
 *     description: >
 *       Collecté, distribué et disponible, calculés en SQL depuis le grand
 *       livre (périmètre SOCIAL), contre-écritures déduites. Totalement séparé
 *       du solde général.
 *     tags: [Social]
 *     responses:
 *       200:
 *         description: Bilan social, montants en chaînes EUR.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total_collecte:   { type: string, example: '1000.00' }
 *                 total_distribue:  { type: string, example: '250.00' }
 *                 reste_disponible: { type: string, example: '750.00' }
 *                 caisses:          { type: array, items: { type: object } }
 *       401: { description: Session requise }
 */
router.get(
  '/bilan',
  asyncHandler(async (req, res) => {
    // Agrégats calculés en SQL depuis le grand livre, sans jointure
    // démultipliante : dons et distributions ne se multiplient plus entre eux.
    const bilan = await bilanSocial();

    const { rows: comptages } = await pool.query(`
      SELECT c.id AS caisse_id,
             COUNT(DISTINCT d.id)::int  AS nb_dons,
             COUNT(DISTINCT ds.id)::int AS nb_distributions,
             COUNT(DISTINCT ds.famille_id)::int AS nb_familles_aidees
        FROM caisses c
        LEFT JOIN dons d                    ON d.caisse_id = c.id
        LEFT JOIN distributions_sociales ds ON ds.caisse_origine_id = c.id
       WHERE c.affectation = 'Social'
       GROUP BY c.id
    `);
    const parCaisse = new Map(comptages.map((c) => [c.caisse_id, c]));

    res.json({
      total_collecte: formaterMontant(bilan.total_collecte),
      total_distribue: formaterMontant(bilan.total_distribue),
      reste_disponible: formaterMontant(bilan.reste_disponible),
      devise: 'EUR',
      caisses: bilan.caisses.map((c) => ({
        caisse_id: c.id,
        caisse_nom: c.nom,
        actif: c.actif,
        affectation: c.affectation,
        total_collecte: formaterMontant(c.total_collecte),
        total_distribue: formaterMontant(c.total_distribue),
        reste_disponible: formaterMontant(c.reste_disponible),
        nb_dons: parCaisse.get(c.id)?.nb_dons ?? 0,
        nb_distributions: parCaisse.get(c.id)?.nb_distributions ?? 0,
        nb_familles_aidees: parCaisse.get(c.id)?.nb_familles_aidees ?? 0,
      })),
    });
  })
);

// ─── FAMILLES ─────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/social/familles:
 *   get:
 *     summary: Liste des familles nécessiteuses
 *     tags: [Social]
 *     responses:
 *       200:
 *         description: Liste des familles
 *       500:
 *         description: Erreur serveur
 */
// GET /api/social/familles
router.get('/familles', auth, async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT f.*,
        COALESCE(SUM(ds.montant_verse), 0) AS total_aide_verse,
        COUNT(ds.id)                        AS nb_aides,
        MAX(ds.date_versement)              AS derniere_aide
      FROM familles_necessiteuses f
      LEFT JOIN distributions_sociales ds ON ds.famille_id = f.id
      GROUP BY f.id
      ORDER BY f.nom_responsable ASC
    `);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/social/familles/{id}:
 *   get:
 *     summary: Détail d'une famille avec historique
 *     tags: [Social]
 *     responses:
 *       200:
 *         description: Détail famille
 *       404:
 *         description: Famille introuvable
 *       500:
 *         description: Erreur serveur
 */
// GET /api/social/familles/:id — une famille avec son historique
router.get('/familles/:id(\\d+)', auth, async (req, res, next) => {
  try {
    const famille = await pool.query(
      `SELECT f.*,
        COALESCE(SUM(ds.montant_verse), 0) AS total_aide_verse,
        COUNT(ds.id)                        AS nb_aides
      FROM familles_necessiteuses f
      LEFT JOIN distributions_sociales ds ON ds.famille_id = f.id
      WHERE f.id = $1
      GROUP BY f.id`,
      [req.params.id]
    );
    if (famille.rows.length === 0) {
      throw ApiError.notFound('Famille introuvable.');
    }
    // Historique des distributions
    const historique = await pool.query(`
      SELECT ds.*, c.nom AS caisse_nom
      FROM distributions_sociales ds
      LEFT JOIN caisses c ON ds.caisse_origine_id = c.id
      WHERE ds.famille_id = $1
      ORDER BY ds.date_versement DESC
    `, [req.params.id]);
    res.json({ ...famille.rows[0], historique: historique.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/social/familles:
 *   post:
 *     summary: Ajouter une famille nécessiteuse
 *     tags: [Social]
 *     responses:
 *       201:
 *         description: Famille créée
 *       400:
 *         description: Données invalides
 *       500:
 *         description: Erreur serveur
 */
// POST /api/social/familles
router.post('/familles', auth, async (req, res, next) => {
  const {
    nom_responsable, adresse, telephone,
    ressources_mensuelles, nb_membres_famille, details_membres,
    montant_recommande_aide, frequence_aide, commentaires,
  } = req.body;
  if (!nom_responsable || !nom_responsable.trim()) {
    return res.status(400).json({ message: 'Le nom du responsable est requis.' });
  }
  try {
    const result = await pool.query(`
      INSERT INTO familles_necessiteuses
        (nom_responsable, adresse, telephone, ressources_mensuelles,
         nb_membres_famille, details_membres, montant_recommande_aide,
         frequence_aide, commentaires)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
    `, [
      nom_responsable.trim(),
      adresse || null,
      telephone || null,
      validerMontantNonNegatif(ressources_mensuelles ?? '0.00', 'ressources_mensuelles'),
      parseInt(nb_membres_famille) || 1,
      details_membres ? (typeof details_membres === 'string' ? details_membres : JSON.stringify(details_membres)) : '[]',
      validerMontantNonNegatif(montant_recommande_aide ?? '0.00', 'montant_recommande_aide'),
      ['Mensuelle', 'Ponctuelle', 'Fêtes'].includes(frequence_aide) ? frequence_aide : 'Mensuelle',
      commentaires || null,
    ]);
    await withTransaction(async (client) => {
      await auditerRequete(client, req, {
        typeEvenement: EVENEMENTS.FAMILLE_CREEE,
        resultat: RESULTATS.SUCCES,
        entiteType: 'famille_necessiteuse',
        entiteId: result.rows[0].id,
        apres: result.rows[0],
      });
    });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/social/familles/{id}:
 *   put:
 *     summary: Modifier une famille nécessiteuse
 *     tags: [Social]
 *     responses:
 *       200:
 *         description: Famille modifiée
 *       400:
 *         description: Données invalides
 *       404:
 *         description: Famille introuvable
 *       500:
 *         description: Erreur serveur
 */
// PUT /api/social/familles/:id
router.put('/familles/:id(\\d+)', auth, async (req, res, next) => {
  const fields = []; const values = []; let idx = 1;
  const allowed = ['nom_responsable','adresse','telephone','ressources_mensuelles',
    'nb_membres_famille','details_membres','montant_recommande_aide','frequence_aide','commentaires'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      fields.push(`${key} = $${idx++}`);
      values.push(key === 'ressources_mensuelles' || key === 'montant_recommande_aide'
        ? validerMontantNonNegatif(req.body[key] ?? '0.00', key)
        : key === 'nb_membres_famille'
        ? parseInt(req.body[key]) || 1
        : key === 'details_membres'
        ? (typeof req.body[key] === 'string' ? req.body[key] : JSON.stringify(req.body[key]))
        : req.body[key]);
    }
  }
  if (fields.length === 0) {
    return res.status(400).json({ message: 'Aucun champ à mettre à jour.' });
  }
  fields.push('updated_at = NOW()');
  values.push(req.params.id);
  try {
    const result = await pool.query(
      `UPDATE familles_necessiteuses SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    if (result.rows.length === 0) {
      throw ApiError.notFound('Famille introuvable.');
    }
    await withTransaction(async (client) => {
      await auditerRequete(client, req, {
        typeEvenement: EVENEMENTS.FAMILLE_MODIFIEE,
        resultat: RESULTATS.SUCCES,
        entiteType: 'famille_necessiteuse',
        entiteId: parseInt(req.params.id, 10),
        apres: result.rows[0],
      });
    });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/social/familles/{id}:
 *   delete:
 *     summary: Supprimer une famille nécessiteuse
 *     tags: [Social]
 *     responses:
 *       200:
 *         description: Famille supprimée
 *       404:
 *         description: Famille introuvable
 *       409:
 *         description: Distributions liées
 *       500:
 *         description: Erreur serveur
 */
// DELETE /api/social/familles/:id
router.delete(
  '/familles/:id(\\d+)',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);

    await withTransaction(async (client) => {
      const { rows } = await client.query(
        'SELECT * FROM familles_necessiteuses WHERE id = $1 FOR UPDATE',
        [id]
      );
      const famille = rows[0];
      if (!famille) throw ApiError.notFound('Famille introuvable.');

      // Une famille ayant reçu de l'aide porte un historique financier : elle
      // est désactivée, jamais effacée.
      const { rows: distributions } = await client.query(
        'SELECT COUNT(*)::int AS n FROM distributions_sociales WHERE famille_id = $1',
        [id]
      );
      if (distributions[0].n > 0) {
        throw ApiError.conflict(
          'HISTORY_EXISTS',
          `Cette famille a reçu ${distributions[0].n} versement(s) : désactivez-la au lieu de la supprimer.`
        );
      }

      await auditerRequete(client, req, {
        typeEvenement: EVENEMENTS.FAMILLE_SUPPRIMEE,
        resultat: RESULTATS.SUCCES,
        entiteType: 'famille_necessiteuse',
        entiteId: id,
        avant: famille,
      });

      await client.query('DELETE FROM familles_necessiteuses WHERE id = $1', [id]);
    });

    res.json({ message: 'Famille supprimée.' });
  })
);


// ─── DISTRIBUTIONS ────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/social/distributions:
 *   get:
 *     summary: Liste des distributions sociales
 *     tags: [Social]
 *     responses:
 *       200:
 *         description: Liste des distributions
 *       500:
 *         description: Erreur serveur
 */
// GET /api/social/distributions
router.get('/distributions', auth, async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT ds.*, f.nom_responsable, c.nom AS caisse_nom
      FROM distributions_sociales ds
      LEFT JOIN familles_necessiteuses f ON ds.famille_id = f.id
      LEFT JOIN caisses c                ON ds.caisse_origine_id = c.id
      ORDER BY ds.date_versement DESC
    `);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/social/distributions:
 *   post:
 *     summary: Enregistrer une distribution sociale
 *     description: >
 *       Exige une famille existante, une caisse active affectée « Social », un
 *       montant EUR exact et un solde suffisant. La caisse est verrouillée puis
 *       son disponible recalculé depuis le grand livre : deux distributions
 *       concurrentes sont sérialisées et ne peuvent pas se croiser.
 *       Un solde insuffisant produit 409 SOCIAL_BALANCE_INSUFFICIENT sans
 *       aucune écriture.
 *     tags: [Social]
 *     parameters:
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
 *             required: [famille_id, caisse_origine_id, montant_verse]
 *             properties:
 *               famille_id:        { type: integer }
 *               caisse_origine_id: { type: integer }
 *               montant_verse:     { type: string, pattern: '^(0|[1-9][0-9]*)\.[0-9]{2}$' }
 *               date_versement:    { type: string, format: date }
 *               commentaire:       { type: string, nullable: true }
 *     responses:
 *       201: { description: Distribution enregistrée avec son ecriture_id }
 *       400: { description: VALIDATION_ERROR }
 *       404: { description: Famille ou caisse introuvable }
 *       409: { description: 'SOCIAL_BALANCE_INSUFFICIENT, INACTIVE_REFERENCE, IDEMPOTENCY_KEY_REUSED' }
 *       422: { description: INVALID_MONEY_SCALE }
 */
router.post(
  '/distributions',
  asyncHandler(async (req, res) => {
    const { famille_id, caisse_origine_id, montant_verse, date_versement, commentaire } = req.body;

    if (!famille_id) throw ApiError.validation({ famille_id: 'La famille est requise.' });
    const montantValide = validerMontantPositif(montant_verse, 'montant_verse');

    await avecIdempotence(
      req,
      res,
      OPERATIONS.DISTRIBUTION_SOCIALE_CREER,
      async (client, { idempotencyId }) => {
        // 1. Verrouiller la caisse : dons, distributions et contre-écritures
        //    de cette caisse sont sérialisés à partir d'ici.
        const caisse = await chargerCaisseActive(client, caisse_origine_id, 'caisse_origine_id');

        if (caisse.affectation !== 'Social') {
          throw ApiError.conflict(
            'INACTIVE_REFERENCE',
            "Cette caisse n'est pas affectée à l'aide sociale."
          );
        }

        const { rows: familles } = await client.query(
          'SELECT * FROM familles_necessiteuses WHERE id = $1',
          [famille_id]
        );
        if (familles.length === 0) throw ApiError.notFound('Famille introuvable.');
        if (familles[0].statut !== 'actif') {
          throw ApiError.conflict(
            'INACTIVE_REFERENCE',
            'Cette famille est désactivée : elle ne peut plus recevoir de versement.'
          );
        }

        // 2. Le disponible est recalculé depuis le grand livre, sous verrou.
        const { possible, disponible } = await debitSocialPossible(
          client,
          caisse.id,
          montantValide
        );
        if (!possible) {
          throw ApiError.conflict(
            'SOCIAL_BALANCE_INSUFFICIENT',
            `Le solde disponible de cette caisse est insuffisant (disponible : ${formaterMontant(disponible)} €).`
          );
        }

        const dateEffet = date_versement || new Date().toISOString().slice(0, 10);

        const { rows: creees } = await client.query(
          `INSERT INTO distributions_sociales
             (famille_id, caisse_origine_id, montant_verse, date_versement, commentaire, cree_par)
           VALUES ($1, $2, $3::montant_eur_positif, $4, $5, $6)
           RETURNING *`,
          [famille_id, caisse.id, montantValide, dateEffet, commentaire || null, req.utilisateur.id]
        );
        const distribution = creees[0];

        const ecriture = await insererEcriture(client, req, {
          typeEcriture: 'DISTRIBUTION_SOCIALE',
          perimetre: 'SOCIAL',
          sens: 'DEBIT',
          montant: montantValide,
          dateEffet,
          sourceType: 'distribution_sociale',
          sourceId: distribution.id,
          caisseId: caisse.id,
          idempotencyId,
        });

        const rattachee = await rattacherSource(
          client,
          'distribution_sociale',
          distribution.id,
          ecriture.id
        );

        await auditerRequete(client, req, {
          typeEvenement: EVENEMENTS.DISTRIBUTION_SOCIALE_ENREGISTREE,
          resultat: RESULTATS.SUCCES,
          entiteType: 'distribution_sociale',
          entiteId: distribution.id,
          apres: rattachee,
        });

        return {
          httpStatus: 201,
          corps: {
            ...rattachee,
            montant_verse: formaterMontant(rattachee.montant_verse),
            devise: 'EUR',
          },
          ressourceType: 'distribution_sociale',
          ressourceId: distribution.id,
        };
      }
    );
  })
);

module.exports = router;
