const express = require('express');
const router = express.Router();

const { pool } = require('../config/database');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * @swagger
 * /api/options:
 *   get:
 *     summary: Références sélectionnables dans les formulaires
 *     description: >
 *       Ne retourne que les références ACTIVES : une référence désactivée
 *       disparaît des nouvelles saisies tout en restant lisible dans
 *       l'historique. Chaque entrée porte son identifiant et son libellé.
 *     tags: [Options]
 *     responses:
 *       200:
 *         description: Références actives.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 categories_depenses: { type: array, items: { type: object } }
 *                 classes_madrasa:     { type: array, items: { type: object } }
 *                 types_paiement_rh:   { type: array, items: { type: object } }
 *                 caisses:             { type: array, items: { type: object } }
 *       401: { description: Session requise }
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const [categories, classes, typesPaiement, caisses] = await Promise.all([
      pool.query('SELECT id, nom, actif FROM categories_depenses WHERE actif = TRUE ORDER BY nom'),
      pool.query('SELECT id, nom, actif FROM classes_madrasa WHERE actif = TRUE ORDER BY nom'),
      pool.query('SELECT id, nom, actif FROM types_paiement_rh WHERE actif = TRUE ORDER BY nom'),
      pool.query(
        'SELECT id, nom, description, affectation, actif FROM caisses WHERE actif = TRUE ORDER BY nom'
      ),
    ]);

    res.json({
      categories_depenses: categories.rows,
      classes_madrasa: classes.rows,
      types_paiement_rh: typesPaiement.rows,
      caisses: caisses.rows,
    });
  })
);

module.exports = router;
