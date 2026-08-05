const express = require('express');
const router = express.Router();
const { pool } = require('../../config/database');
const { ApiError } = require('../../utils/errors');
const { withTransaction } = require('../../utils/transaction');
const { REFERENTIELS, definitionReferentiel, compterUsages } = require('../../utils/references');
const { asyncHandler } = require('../../middleware/errorHandler');
const { auditerRequete, EVENEMENTS, RESULTATS } = require('../../utils/audit');

// L'authentification et la capacité ADMIN sont imposées globalement par
// `app.js` (refus par défaut) : aucune garde locale n'est nécessaire.

// Le catalogue des référentiels vit dans utils/references.js : une seule
// définition partagée par l'administration, la validation à l'écriture et
// le comptage des usages.
const TABLES = Object.fromEntries(
  Object.entries(REFERENTIELS).map(([cle, def]) => [
    cle,
    {
      table: def.table,
      label: def.libelle,
      refTable: def.usages[0].table,
      refCol: def.usages[0].colonne,
      refLabel: def.usages[0].libelle,
    },
  ])
);

// GET /api/admin/config/:type — liste tous les enregistrements
/**
 * @swagger
 * /api/admin/config/{type}:
 *   get:
 *     summary: Liste tous les enregistrements d'une configuration
 *     tags: [Administration]
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *         description: Type de configuration (categories-depenses, classes-madrasa, types-paiement-rh)
 *     responses:
 *       200:
 *         description: Liste des enregistrements
 *       400:
 *         description: Type de configuration invalide
 *       500:
 *         description: Erreur serveur
 */
router.get('/:type', async (req, res, next) => {
  const cfg = TABLES[req.params.type];
  if (!cfg) return res.status(400).json({ message: 'Type de configuration invalide.' });

  try {
    const result = await pool.query(
      `SELECT tc.*,
        (SELECT COUNT(*) FROM "${cfg.refTable}" WHERE "${cfg.refCol}" = tc.id) AS nb_references
       FROM "${cfg.table}" tc
       ORDER BY tc.id ASC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(503).json({
      message: `La table « ${cfg.table} » est inaccessible. Avez-vous exécuté les migrations ?`
    });
  }
});

// POST /api/admin/config/:type — créer
/**
 * @swagger
 * /api/admin/config/{type}:
 *   post:
 *     summary: Créer un enregistrement de configuration
 *     tags: [Administration]
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *         description: Type de configuration
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nom:
 *                 type: string
 *     responses:
 *       201:
 *         description: Enregistrement créé
 *       400:
 *         description: Données invalides
 *       409:
 *         description: Conflit - existe déjà
 *       500:
 *         description: Erreur serveur
 */
router.post('/:type', async (req, res, next) => {
  const cfg = TABLES[req.params.type];
  if (!cfg) return res.status(400).json({ message: 'Type de configuration invalide.' });

  const { nom } = req.body;
  if (!nom || !nom.trim()) {
    return res.status(400).json({ message: 'Le nom est requis.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO "${cfg.table}" (nom) VALUES ($1) RETURNING *`,
      [nom.trim()]
    );
    await withTransaction(async (client) => {
      await auditerRequete(client, req, {
        typeEvenement: EVENEMENTS.REFERENCE_CREEE,
        resultat: RESULTATS.SUCCES,
        entiteType: 'config.' + req.params.type,
        entiteId: result.rows[0].id,
        apres: result.rows[0],
      });
    });
    res.status(201).json({ ...result.rows[0], nb_references: 0 });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: `"${nom}" existe déjà.` });
    }
    next(err);
  }
});

// PUT /api/admin/config/:type/:id — modifier
/**
 * @swagger
 * /api/admin/config/{type}/{id}:
 *   put:
 *     summary: Modifier un enregistrement de configuration
 *     tags: [Administration]
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *         description: Type de configuration
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de l'enregistrement
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nom:
 *                 type: string
 *               actif:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Enregistrement modifié
 *       400:
 *         description: Données invalides
 *       404:
 *         description: Enregistrement introuvable
 *       409:
 *         description: Conflit - nom existe déjà
 *       500:
 *         description: Erreur serveur
 */
router.put('/:type/:id(\\d+)', async (req, res, next) => {
  const cfg = TABLES[req.params.type];
  if (!cfg) return res.status(400).json({ message: 'Type de configuration invalide.' });

  const { nom, actif } = req.body;

  try {
    const fields = [];
    const values = [];
    let idx = 1;

    if (nom !== undefined) {
      if (!nom.trim()) return res.status(400).json({ message: 'Le nom ne peut pas être vide.' });
      fields.push(`nom = $${idx++}`);
      values.push(nom.trim());
    }
    if (actif !== undefined) {
      fields.push(`actif = $${idx++}`);
      values.push(actif);
    }

    if (fields.length === 0) {
      return res.status(400).json({ message: 'Aucun champ à mettre à jour.' });
    }

    fields.push('updated_at = NOW()');
    values.push(req.params.id);

    const result = await pool.query(
      `UPDATE "${cfg.table}" SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw ApiError.notFound('Enregistrement introuvable.');
    }

    const count = await pool.query(
      `SELECT COUNT(*) AS nb FROM "${cfg.refTable}" WHERE "${cfg.refCol}" = $1`,
      [result.rows[0].id]
    );

    await withTransaction(async (client) => {
      await auditerRequete(client, req, {
        typeEvenement: EVENEMENTS.REFERENCE_MODIFIEE,
        resultat: RESULTATS.SUCCES,
        entiteType: 'config.' + req.params.type,
        entiteId: parseInt(req.params.id, 10),
        apres: result.rows[0],
      });
    });
    res.json({ ...result.rows[0], nb_references: parseInt(count.rows[0].nb) });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Ce nom existe déjà.' });
    }
    next(err);
  }
});

// DELETE /api/admin/config/:type/:id — suppression (bloquée si références)
/**
 * @swagger
 * /api/admin/config/{type}/{id}:
 *   delete:
 *     summary: Supprimer un enregistrement de configuration
 *     tags: [Administration]
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *         description: Type de configuration
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de l'enregistrement
 *     responses:
 *       200:
 *         description: Enregistrement supprimé
 *       400:
 *         description: Type de configuration invalide
 *       404:
 *         description: Enregistrement introuvable
 *       409:
 *         description: Suppression bloquée - références existantes
 *       500:
 *         description: Erreur serveur
 */
router.delete(
  '/:type/:id(\\d+)',
  asyncHandler(async (req, res) => {
    const definition = definitionReferentiel(req.params.type);
    const id = parseInt(req.params.id, 10);

    await withTransaction(async (client) => {
      const { rows } = await client.query(
        `SELECT * FROM ${definition.table} WHERE id = $1 FOR UPDATE`,
        [id]
      );
      const reference = rows[0];
      if (!reference) throw ApiError.notFound('Enregistrement introuvable.');

      const usages = await compterUsages(client, req.params.type, id);
      if (usages > 0) {
        throw ApiError.conflict(
          'HISTORY_EXISTS',
          `« ${reference.nom} » est utilisé par ${usages} opération(s) : désactivez-le au lieu de le supprimer.`
        );
      }

      await auditerRequete(client, req, {
        typeEvenement: EVENEMENTS.REFERENCE_SUPPRIMEE,
        resultat: RESULTATS.SUCCES,
        entiteType: 'config.' + req.params.type,
        entiteId: id,
        avant: reference,
      });

      await client.query(`DELETE FROM ${definition.table} WHERE id = $1`, [id]);
    });

    res.json({ message: 'Référence supprimée.' });
  })
);

module.exports = router;
