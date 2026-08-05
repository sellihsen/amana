const express = require('express');
const { pool } = require('../config/database');
const auth = require('../middleware/auth');
const { ApiError } = require('../utils/errors');
const { withTransaction } = require('../utils/transaction');
const { auditerRequete, EVENEMENTS, RESULTATS } = require('../utils/audit');
const { asyncHandler } = require('../middleware/errorHandler');

// ─────────────────────────────────────────────────────────────
// Routeur public  →  monté sur  GET /api/caisses
// ─────────────────────────────────────────────────────────────
const publicRouter = express.Router();

/**
 * @swagger
 * /api/caisses:
 *   get:
 *     summary: Liste les caisses actives
 *     tags: [Caisses]
 *     responses:
 *       200:
 *         description: Tableau des caisses actives
 *       500:
 *         description: Erreur serveur
 */
// GET /api/caisses — liste les caisses actives (formulaires)
publicRouter.get('/', auth, async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT id, nom, description, affectation FROM caisses WHERE actif = TRUE ORDER BY id ASC'
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────
// Routeur admin   →  monté sur  /api/admin/caisses
// ─────────────────────────────────────────────────────────────
const adminRouter = express.Router();

// L'authentification et la capacité ADMIN sont imposées globalement par
// `app.js` (refus par défaut) : aucune garde locale n'est nécessaire.

/**
 * @swagger
 * /api/admin/caisses:
 *   get:
 *     summary: Liste toutes les caisses avec statistiques (admin)
 *     tags: [Caisses]
 *     responses:
 *       200:
 *         description: Tableau des caisses avec nb_dons et total_dons
 *       500:
 *         description: Erreur serveur
 */
// GET /api/admin/caisses — toutes les caisses avec stats
adminRouter.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT c.*,
         (SELECT COUNT(*)              FROM dons WHERE caisse_id = c.id) AS nb_dons,
         (SELECT COALESCE(SUM(montant),0) FROM dons WHERE caisse_id = c.id) AS total_dons
       FROM caisses c
       ORDER BY c.id ASC`
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/admin/caisses:
 *   post:
 *     summary: Crée une nouvelle caisse (admin)
 *     tags: [Caisses]
 *     responses:
 *       201:
 *         description: Caisse créée
 *       400:
 *         description: Nom requis
 *       409:
 *         description: Nom déjà existant
 *       500:
 *         description: Erreur serveur
 */
// POST /api/admin/caisses — créer une caisse
adminRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { nom, description, affectation } = req.body;
    if (!nom || !String(nom).trim()) {
      throw ApiError.validation({ nom: 'Le nom de la caisse est requis.' });
    }
    if (affectation !== undefined && !['Chantier', 'Fonctionnement', 'Social'].includes(affectation)) {
      throw ApiError.validation({
        affectation: "L'affectation doit être Chantier, Fonctionnement ou Social.",
      });
    }

    const caisse = await withTransaction(async (client) => {
      const { rows: collision } = await client.query(
        'SELECT id FROM caisses WHERE LOWER(nom) = LOWER($1)',
        [String(nom).trim()]
      );
      if (collision.length > 0) {
        throw ApiError.conflict('DUPLICATE_OPERATION', 'Une caisse avec ce nom existe déjà.');
      }

      const { rows } = await client.query(
        'INSERT INTO caisses (nom, description, affectation) VALUES ($1, $2, $3) RETURNING *',
        [String(nom).trim(), description || null, affectation || 'Fonctionnement']
      );

      await auditerRequete(client, req, {
        typeEvenement: EVENEMENTS.CAISSE_CREEE,
        resultat: RESULTATS.SUCCES,
        entiteType: 'caisse',
        entiteId: rows[0].id,
        apres: rows[0],
      });

      return rows[0];
    });

    res.status(201).json(caisse);
  })
);


/**
 * @swagger
 * /api/admin/caisses/{id}:
 *   put:
 *     summary: Modifie une caisse (admin)
 *     tags: [Caisses]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Caisse modifiée
 *       400:
 *         description: Aucun champ à mettre à jour
 *       404:
 *         description: Caisse introuvable
 *       500:
 *         description: Erreur serveur
 */
// PUT /api/admin/caisses/:id — modifier nom, description, actif et/ou affectation
adminRouter.put(
  '/:id(\\d+)',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { nom, description, actif, affectation } = req.body;

    if (nom !== undefined && !String(nom).trim()) {
      throw ApiError.validation({ nom: 'Le nom ne peut pas être vide.' });
    }
    if (affectation !== undefined && !['Chantier', 'Fonctionnement', 'Social'].includes(affectation)) {
      throw ApiError.validation({
        affectation: "L'affectation doit être Chantier, Fonctionnement ou Social.",
      });
    }

    const caisse = await withTransaction(async (client) => {
      const { rows: avant } = await client.query(
        'SELECT * FROM caisses WHERE id = $1 FOR UPDATE',
        [id]
      );
      if (avant.length === 0) throw ApiError.notFound('Caisse introuvable.');

      const { rows } = await client.query(
        `UPDATE caisses SET
           nom         = COALESCE($2, nom),
           description = COALESCE($3, description),
           actif       = COALESCE($4, actif),
           affectation = COALESCE($5, affectation),
           updated_at  = NOW()
         WHERE id = $1
         RETURNING *`,
        [
          id,
          nom === undefined ? null : String(nom).trim(),
          description === undefined ? null : description,
          actif === undefined ? null : actif,
          affectation === undefined ? null : affectation,
        ]
      );

      await auditerRequete(client, req, {
        typeEvenement: EVENEMENTS.CAISSE_MODIFIEE,
        resultat: RESULTATS.SUCCES,
        entiteType: 'caisse',
        entiteId: id,
        avant: avant[0],
        apres: rows[0],
      });

      return rows[0];
    });

    res.json(caisse);
  })
);


/**
 * @swagger
 * /api/admin/caisses/{id}:
 *   delete:
 *     summary: Supprime une caisse (admin)
 *     tags: [Caisses]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Caisse supprimée
 *       404:
 *         description: Caisse introuvable
 *       409:
 *         description: Impossible, dons liés
 *       500:
 *         description: Erreur serveur
 */
// DELETE /api/admin/caisses/:id — suppression (bloquée si dons liés)
adminRouter.delete(
  '/:id(\\d+)',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);

    await withTransaction(async (client) => {
      const { rows } = await client.query('SELECT * FROM caisses WHERE id = $1 FOR UPDATE', [id]);
      const caisse = rows[0];
      if (!caisse) throw ApiError.notFound('Caisse introuvable.');

      // Une caisse porteuse d'écritures est désactivée, jamais supprimée :
      // l'historique financier y fait référence.
      const { rows: liees } = await client.query(
        `SELECT (SELECT COUNT(*) FROM dons WHERE caisse_id = $1)
              + (SELECT COUNT(*) FROM ecritures_financieres WHERE caisse_id = $1)
              + (SELECT COUNT(*) FROM distributions_sociales WHERE caisse_origine_id = $1) AS n`,
        [id]
      );
      if (parseInt(liees[0].n, 10) > 0) {
        throw ApiError.conflict(
          'HISTORY_EXISTS',
          `Cette caisse porte ${liees[0].n} opération(s) : désactivez-la au lieu de la supprimer.`
        );
      }

      await auditerRequete(client, req, {
        typeEvenement: EVENEMENTS.CAISSE_SUPPRIMEE,
        resultat: RESULTATS.SUCCES,
        entiteType: 'caisse',
        entiteId: id,
        avant: caisse,
      });

      await client.query('DELETE FROM caisses WHERE id = $1', [id]);
    });

    res.json({ message: 'Caisse supprimée.' });
  })
);

module.exports = { publicRouter, adminRouter };
