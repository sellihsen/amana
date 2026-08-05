const express = require('express');
const router = express.Router();

const { pool } = require('../config/database');
const { ApiError } = require('../utils/errors');
const { OPERATIONS } = require('../utils/idempotency');
const { withTransaction } = require('../utils/transaction');
const { auditerRequete, EVENEMENTS, RESULTATS } = require('../utils/audit');
const { avecIdempotence } = require('../utils/posting');
const { asyncHandler } = require('../middleware/errorHandler');

const TYPES_MOUVEMENT = ['ENTREE', 'SORTIE'];

/** Quantité : entier strictement positif. Aucun arrondi n'est toléré. */
function validerQuantite(valeur, champ = 'quantite') {
  if (typeof valeur === 'number' && !Number.isInteger(valeur)) {
    throw ApiError.validation({ [champ]: 'La quantité doit être un nombre entier.' });
  }
  const n = Number(valeur);
  if (!Number.isInteger(n) || n <= 0) {
    throw ApiError.validation({ [champ]: 'La quantité doit être un entier strictement positif.' });
  }
  return n;
}

/** Entier non négatif (quantité initiale, seuil d'alerte). */
function validerEntierNonNegatif(valeur, champ, defaut) {
  if (valeur === undefined || valeur === null || valeur === '') return defaut;
  const n = Number(valeur);
  if (!Number.isInteger(n) || n < 0) {
    throw ApiError.validation({ [champ]: 'Un entier positif ou nul est attendu.' });
  }
  return n;
}

/**
 * @swagger
 * /api/stock/alertes:
 *   get:
 *     summary: Produits au seuil d'alerte
 *     tags: [Stock]
 *     responses:
 *       200: { description: Produits dont la quantité atteint ou passe sous le seuil }
 *       401: { description: Session requise }
 */
router.get(
  '/alertes',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT * FROM produits_stock
        WHERE quantite_actuelle <= quantite_minimale_alerte AND actif = TRUE
        ORDER BY (quantite_actuelle - quantite_minimale_alerte) ASC, nom ASC`
    );
    res.json(rows);
  })
);

/**
 * @swagger
 * /api/stock:
 *   get:
 *     summary: Liste des produits en stock
 *     tags: [Stock]
 *     responses:
 *       200: { description: Produits }
 *       401: { description: Session requise }
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT *,
              (quantite_actuelle <= quantite_minimale_alerte) AS en_alerte
         FROM produits_stock
        ORDER BY nom ASC`
    );
    res.json(rows);
  })
);

/**
 * @swagger
 * /api/stock:
 *   post:
 *     summary: Créer un produit
 *     tags: [Stock]
 *     responses:
 *       201: { description: Produit créé }
 *       400: { description: VALIDATION_ERROR }
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { nom, categorie, quantite_actuelle, quantite_minimale_alerte, unite, emplacement } =
      req.body;

    if (!nom || !String(nom).trim()) {
      throw ApiError.validation({ nom: 'Le nom du produit est requis.' });
    }
    const quantite = validerEntierNonNegatif(quantite_actuelle, 'quantite_actuelle', 0);
    const seuil = validerEntierNonNegatif(quantite_minimale_alerte, 'quantite_minimale_alerte', 10);

    const produit = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO produits_stock
           (nom, categorie, quantite_actuelle, quantite_minimale_alerte, unite, emplacement)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          String(nom).trim(),
          categorie || 'Construction',
          quantite,
          seuil,
          unite || 'Pièces',
          emplacement || null,
        ]
      );

      await auditerRequete(client, req, {
        typeEvenement: EVENEMENTS.PRODUIT_CREE,
        resultat: RESULTATS.SUCCES,
        entiteType: 'produit_stock',
        entiteId: rows[0].id,
        apres: rows[0],
      });

      return rows[0];
    });

    res.status(201).json(produit);
  })
);

/** Corps commun de PATCH et de son alias PUT. */
async function modifierProduit(req, res) {
  const id = parseInt(req.params.id, 10);
  const { nom, categorie, quantite_minimale_alerte, unite, emplacement, actif } = req.body;

  // La quantité ne se modifie QUE par un mouvement : sans cela, une correction
  // silencieuse échapperait à l'audit et au contrôle de non-négativité.
  if (req.body.quantite_actuelle !== undefined) {
    throw ApiError.validation({
      quantite_actuelle:
        'La quantité ne se modifie pas ici : utilisez POST /api/stock/{id}/mouvements.',
    });
  }

  if (nom !== undefined && !String(nom).trim()) {
    throw ApiError.validation({ nom: 'Le nom ne peut pas être vide.' });
  }
  const seuil =
    quantite_minimale_alerte === undefined
      ? null
      : validerEntierNonNegatif(quantite_minimale_alerte, 'quantite_minimale_alerte', 0);

  const produit = await withTransaction(async (client) => {
    const { rows: avant } = await client.query(
      'SELECT * FROM produits_stock WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (avant.length === 0) throw ApiError.notFound('Produit introuvable.');

    const { rows } = await client.query(
      `UPDATE produits_stock SET
         nom                      = COALESCE($2, nom),
         categorie                = COALESCE($3, categorie),
         quantite_minimale_alerte = COALESCE($4, quantite_minimale_alerte),
         unite                    = COALESCE($5, unite),
         emplacement              = COALESCE($6, emplacement),
         actif                    = COALESCE($7, actif),
         updated_at               = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        nom === undefined ? null : String(nom).trim(),
        categorie === undefined ? null : categorie,
        seuil,
        unite === undefined ? null : unite,
        emplacement === undefined ? null : emplacement,
        actif === undefined ? null : actif,
      ]
    );

    await auditerRequete(client, req, {
      typeEvenement: EVENEMENTS.PRODUIT_MODIFIE,
      resultat: RESULTATS.SUCCES,
      entiteType: 'produit_stock',
      entiteId: id,
      avant: avant[0],
      apres: rows[0],
    });

    return rows[0];
  });

  res.json(produit);
}

/**
 * @swagger
 * /api/stock/{id}:
 *   patch:
 *     summary: Modifier les métadonnées d'un produit
 *     description: >
 *       Modifie nom, catégorie, seuil, unité, emplacement et état actif.
 *       REFUSE `quantite_actuelle` : la quantité ne change que par un mouvement.
 *     tags: [Stock]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Produit modifié }
 *       400: { description: VALIDATION_ERROR (dont tentative sur la quantité) }
 *       404: { description: RESOURCE_NOT_FOUND }
 *   put:
 *     summary: Alias déprécié de PATCH
 *     deprecated: true
 *     tags: [Stock]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Produit modifié }
 */
router.patch('/:id(\\d+)', asyncHandler(modifierProduit));
router.put('/:id(\\d+)', asyncHandler(modifierProduit));

/**
 * @swagger
 * /api/stock/{id}:
 *   delete:
 *     summary: Supprimer un produit
 *     tags: [Stock]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Produit supprimé }
 *       404: { description: RESOURCE_NOT_FOUND }
 */
router.delete(
  '/:id(\\d+)',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);

    await withTransaction(async (client) => {
      const { rows } = await client.query(
        'SELECT * FROM produits_stock WHERE id = $1 FOR UPDATE',
        [id]
      );
      const produit = rows[0];
      if (!produit) throw ApiError.notFound('Produit introuvable.');

      await auditerRequete(client, req, {
        typeEvenement: EVENEMENTS.PRODUIT_SUPPRIME,
        resultat: RESULTATS.SUCCES,
        entiteType: 'produit_stock',
        entiteId: id,
        avant: produit,
      });

      await client.query('DELETE FROM produits_stock WHERE id = $1', [id]);
    });

    res.json({ message: 'Produit supprimé.' });
  })
);

/**
 * Applique un mouvement de stock.
 *
 * La soustraction est CONDITIONNELLE et faite en base :
 * `UPDATE … SET q = q - $1 WHERE id = $2 AND q >= $1`.
 * Zéro ligne modifiée signifie « stock insuffisant » — jamais un écrêtage.
 * Deux sorties concurrentes ne peuvent donc pas se croiser.
 */
async function appliquerMouvement(req, res, typeImpose) {
  const id = parseInt(req.params.id, 10);
  const type = typeImpose || req.body.type;
  const quantiteDemandee = validerQuantite(req.body.quantite);

  if (!TYPES_MOUVEMENT.includes(type)) {
    throw ApiError.validation({
      type: `Le type doit être l'un de : ${TYPES_MOUVEMENT.join(', ')}.`,
    });
  }

  await avecIdempotence(req, res, OPERATIONS.STOCK_MOUVEMENT, async (client) => {
    const { rows: avant } = await client.query(
      'SELECT * FROM produits_stock WHERE id = $1 FOR UPDATE',
      [id]
    );
    const produit = avant[0];
    if (!produit) throw ApiError.notFound('Produit introuvable.');

    let apres;
    if (type === 'ENTREE') {
      const { rows } = await client.query(
        `UPDATE produits_stock
            SET quantite_actuelle = quantite_actuelle + $2, updated_at = NOW()
          WHERE id = $1
          RETURNING *`,
        [id, quantiteDemandee]
      );
      apres = rows[0];
    } else {
      const { rows } = await client.query(
        `UPDATE produits_stock
            SET quantite_actuelle = quantite_actuelle - $2, updated_at = NOW()
          WHERE id = $1 AND quantite_actuelle >= $2
          RETURNING *`,
        [id, quantiteDemandee]
      );
      if (rows.length === 0) {
        throw ApiError.conflict(
          'STOCK_INSUFFICIENT',
          `Stock insuffisant : ${produit.quantite_actuelle} ${produit.unite} disponible(s).`
        );
      }
      apres = rows[0];
    }

    await auditerRequete(client, req, {
      typeEvenement: EVENEMENTS.STOCK_VARIATION,
      resultat: RESULTATS.SUCCES,
      entiteType: 'produit_stock',
      entiteId: id,
      avant: produit,
      apres: { ...apres, type_mouvement: type, motif: req.body.motif || null },
    });

    return {
      httpStatus: 201,
      corps: {
        produit_id: id,
        type,
        quantite: quantiteDemandee,
        motif: req.body.motif || null,
        quantite_avant: produit.quantite_actuelle,
        quantite_apres: apres.quantite_actuelle,
        en_alerte: apres.quantite_actuelle <= apres.quantite_minimale_alerte,
      },
      ressourceType: 'produit_stock',
      ressourceId: id,
    };
  });
}

/**
 * @swagger
 * /api/stock/{id}/mouvements:
 *   post:
 *     summary: Enregistrer une entrée ou une sortie de stock
 *     description: >
 *       Une sortie excessive retourne 409 STOCK_INSUFFICIENT et ne modifie
 *       rien : la quantité n'est jamais ramenée à zéro silencieusement.
 *     tags: [Stock]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
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
 *             required: [type, quantite]
 *             properties:
 *               type:     { type: string, enum: [ENTREE, SORTIE] }
 *               quantite: { type: integer, minimum: 1 }
 *               motif:    { type: string, nullable: true }
 *     responses:
 *       201: { description: 'Mouvement appliqué, avec quantité avant et après' }
 *       400: { description: VALIDATION_ERROR }
 *       404: { description: RESOURCE_NOT_FOUND }
 *       409: { description: 'STOCK_INSUFFICIENT, IDEMPOTENCY_KEY_REUSED' }
 */
router.post('/:id(\\d+)/mouvements', asyncHandler((req, res) => appliquerMouvement(req, res)));

/**
 * @swagger
 * /api/stock/{id}/increment:
 *   post:
 *     summary: Alias déprécié — entrée de stock
 *     deprecated: true
 *     description: Applique exactement les mêmes validations que /mouvements.
 *     tags: [Stock]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *       - { in: header, name: Idempotency-Key, required: true, schema: { type: string } }
 *     responses:
 *       201: { description: Entrée appliquée }
 */
router.post(
  '/:id(\\d+)/increment',
  asyncHandler((req, res) => appliquerMouvement(req, res, 'ENTREE'))
);

/**
 * @swagger
 * /api/stock/{id}/decrement:
 *   post:
 *     summary: Alias déprécié — sortie de stock
 *     deprecated: true
 *     description: >
 *       Applique les mêmes validations que /mouvements, y compris le refus
 *       d'une sortie excessive (409 STOCK_INSUFFICIENT).
 *     tags: [Stock]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *       - { in: header, name: Idempotency-Key, required: true, schema: { type: string } }
 *     responses:
 *       201: { description: Sortie appliquée }
 *       409: { description: STOCK_INSUFFICIENT }
 */
router.post(
  '/:id(\\d+)/decrement',
  asyncHandler((req, res) => appliquerMouvement(req, res, 'SORTIE'))
);

module.exports = router;
