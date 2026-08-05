const express = require('express');
const router = express.Router();
const { pool } = require('../../config/database');
const { validerMontantNonNegatif } = require('../../utils/money');
const { withTransaction } = require('../../utils/transaction');
const { auditerRequete, EVENEMENTS, RESULTATS } = require('../../utils/audit');
const auth = require('../../middleware/auth');

// L'authentification et la capacité ADMIN sont imposées globalement par
// `app.js` (refus par défaut) : aucune garde locale n'est nécessaire.

/**
 * @swagger
 * /api/admin/projet:
 *   get:
 *     summary: Récupérer la configuration du projet
 *     tags: [Administration]
 *     responses:
 *       200:
 *         description: Configuration du projet
 *       500:
 *         description: Erreur serveur
 */
router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM projet_config WHERE id = 1');
    if (result.rows.length === 0) {
      return res.json({ budget_previsionnel: 300000.00, capacite_salle_priere: 3000, capacite_etages: 4000, capacite_totale: 7000 });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/admin/projet:
 *   put:
 *     summary: Mettre à jour la configuration du projet
 *     tags: [Administration]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               budget_previsionnel:
 *                 type: number
 *               capacite_salle_priere:
 *                 type: integer
 *               capacite_etages:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Configuration mise à jour
 *       500:
 *         description: Erreur serveur
 */
router.put('/', async (req, res, next) => {
  const { budget_previsionnel, capacite_salle_priere, capacite_etages } = req.body;
  // Le budget est un montant : même règle EUR que partout ailleurs.
  const budgetValide = validerMontantNonNegatif(
    budget_previsionnel === undefined || budget_previsionnel === null || budget_previsionnel === ''
      ? '300000.00'
      : budget_previsionnel,
    'budget_previsionnel'
  );
  const capacite_totale = (parseInt(capacite_salle_priere) || 3000) + (parseInt(capacite_etages) || 4000);
  try {
    const result = await pool.query(`
      INSERT INTO projet_config (id, budget_previsionnel, capacite_salle_priere, capacite_etages, capacite_totale)
      VALUES (1, $1, $2, $3, $4)
      ON CONFLICT (id) DO UPDATE SET
        budget_previsionnel = EXCLUDED.budget_previsionnel,
        capacite_salle_priere = EXCLUDED.capacite_salle_priere,
        capacite_etages = EXCLUDED.capacite_etages,
        capacite_totale = EXCLUDED.capacite_totale,
        updated_at = NOW()
      RETURNING *
    `, [
      budgetValide,
      parseInt(capacite_salle_priere) || 3000,
      parseInt(capacite_etages) || 4000,
      capacite_totale,
    ]);
    await withTransaction(async (client) => {
      await auditerRequete(client, req, {
        typeEvenement: EVENEMENTS.PROJET_MODIFIE,
        resultat: RESULTATS.SUCCES,
        entiteType: 'projet_config',
        entiteId: 1,
        apres: result.rows[0],
      });
    });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
