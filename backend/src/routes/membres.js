const express = require('express');
const router = express.Router();

const { pool } = require('../config/database');
const { ApiError } = require('../utils/errors');
const { withTransaction } = require('../utils/transaction');
const { auditerRequete, EVENEMENTS, RESULTATS } = require('../utils/audit');
const { asyncHandler } = require('../middleware/errorHandler');

/** Valeurs fermées : jamais interpolées, toujours comparées à une liste. */
const STATUTS = ['actif', 'inactif', 'suspendu'];

function validerStatut(statut, champ = 'statut') {
  if (statut === undefined || statut === null || statut === '') return null;
  if (!STATUTS.includes(statut)) {
    throw ApiError.validation({ [champ]: `Le statut doit être l'un de : ${STATUTS.join(', ')}.` });
  }
  return statut;
}

function validerNom(nom) {
  if (typeof nom !== 'string' || nom.trim() === '') {
    throw ApiError.validation({ nom: 'Le nom est requis.' });
  }
  if (nom.trim().length > 100) {
    throw ApiError.validation({ nom: 'Le nom ne peut pas dépasser 100 caractères.' });
  }
  return nom.trim();
}

/**
 * @swagger
 * /api/membres:
 *   get:
 *     summary: Liste des membres
 *     description: Recherche sur nom, prénom, adresse électronique et téléphone.
 *     tags: [Membres]
 *     parameters:
 *       - { in: query, name: search, schema: { type: string } }
 *       - { in: query, name: statut, schema: { type: string, enum: [actif, inactif, suspendu] } }
 *     responses:
 *       200: { description: Membres correspondants }
 *       400: { description: VALIDATION_ERROR sur un filtre hors liste }
 *       401: { description: Session requise }
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const search = req.query.search ? String(req.query.search).trim() : null;
    const statut = req.query.statut ? String(req.query.statut) : null;

    // Un statut hors liste ne filtre rien plutôt que d'atteindre le SQL.
    const statutFiltre = statut && STATUTS.includes(statut) ? statut : null;
    const aucunResultat = Boolean(statut) && !statutFiltre;

    if (aucunResultat) {
      res.json({ items: [], total: 0 });
      return;
    }

    const { rows } = await pool.query(
      `SELECT * FROM membres
        WHERE ($1::text IS NULL OR (
                LOWER(nom)              LIKE '%' || LOWER($1) || '%'
             OR LOWER(COALESCE(prenom, '')) LIKE '%' || LOWER($1) || '%'
             OR LOWER(COALESCE(email, ''))  LIKE '%' || LOWER($1) || '%'
             OR COALESCE(telephone, '')     LIKE '%' || $1 || '%'
              ))
          AND ($2::text IS NULL OR statut = $2)
        ORDER BY nom ASC, prenom ASC`,
      [search, statutFiltre]
    );

    res.json({ items: rows, total: rows.length });
  })
);

/**
 * @swagger
 * /api/membres/{id}:
 *   get:
 *     summary: Détail d'un membre
 *     tags: [Membres]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Membre }
 *       404: { description: RESOURCE_NOT_FOUND }
 */
router.get(
  '/:id(\\d+)',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM membres WHERE id = $1', [req.params.id]);
    if (rows.length === 0) throw ApiError.notFound('Membre introuvable.');
    res.json(rows[0]);
  })
);

/**
 * @swagger
 * /api/membres:
 *   post:
 *     summary: Créer un membre
 *     tags: [Membres]
 *     responses:
 *       201: { description: Membre créé }
 *       400: { description: VALIDATION_ERROR }
 *       403: { description: Réservé aux rôles admin et tresorier }
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { nom, prenom, email, telephone, adresse, date_adhesion, statut } = req.body;
    const nomValide = validerNom(nom);
    const statutValide = validerStatut(statut) || 'actif';

    const membre = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO membres (nom, prenom, email, telephone, adresse, date_adhesion, statut)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [
          nomValide,
          prenom || null,
          email || null,
          telephone || null,
          adresse || null,
          date_adhesion || new Date().toISOString().slice(0, 10),
          statutValide,
        ]
      );

      await auditerRequete(client, req, {
        typeEvenement: EVENEMENTS.MEMBRE_CREE,
        resultat: RESULTATS.SUCCES,
        entiteType: 'membre',
        entiteId: rows[0].id,
        apres: rows[0],
      });

      return rows[0];
    });

    res.status(201).json(membre);
  })
);

/**
 * @swagger
 * /api/membres/{id}:
 *   put:
 *     summary: Modifier un membre
 *     description: >
 *       Modification non financière. Passer le statut à « inactif » remplace la
 *       suppression pour un membre porteur d'historique.
 *     tags: [Membres]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Membre modifié }
 *       400: { description: VALIDATION_ERROR }
 *       404: { description: RESOURCE_NOT_FOUND }
 */
router.put(
  '/:id(\\d+)',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { nom, prenom, email, telephone, adresse, statut } = req.body;

    const nomValide = nom === undefined ? null : validerNom(nom);
    const statutValide = validerStatut(statut);

    const membre = await withTransaction(async (client) => {
      const { rows: avant } = await client.query(
        'SELECT * FROM membres WHERE id = $1 FOR UPDATE',
        [id]
      );
      if (avant.length === 0) throw ApiError.notFound('Membre introuvable.');

      const { rows } = await client.query(
        `UPDATE membres SET
           nom        = COALESCE($2, nom),
           prenom     = COALESCE($3, prenom),
           email      = COALESCE($4, email),
           telephone  = COALESCE($5, telephone),
           adresse    = COALESCE($6, adresse),
           statut     = COALESCE($7, statut),
           updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [
          id,
          nomValide,
          prenom === undefined ? null : prenom,
          email === undefined ? null : email,
          telephone === undefined ? null : telephone,
          adresse === undefined ? null : adresse,
          statutValide,
        ]
      );

      await auditerRequete(client, req, {
        typeEvenement: EVENEMENTS.MEMBRE_MODIFIE,
        resultat: RESULTATS.SUCCES,
        entiteType: 'membre',
        entiteId: id,
        avant: avant[0],
        apres: rows[0],
      });

      return rows[0];
    });

    res.json(membre);
  })
);

/**
 * @swagger
 * /api/membres/{id}:
 *   delete:
 *     summary: Supprimer un membre sans historique
 *     description: >
 *       Un membre porteur de dons ou de cotisations retourne 409 HISTORY_EXISTS :
 *       il doit être désactivé, jamais effacé, sous peine de perdre l'historique
 *       financier qui lui est rattaché.
 *     tags: [Membres]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Membre supprimé }
 *       404: { description: RESOURCE_NOT_FOUND }
 *       409: { description: HISTORY_EXISTS — désactiver plutôt que supprimer }
 */
router.delete(
  '/:id(\\d+)',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);

    await withTransaction(async (client) => {
      const { rows } = await client.query('SELECT * FROM membres WHERE id = $1 FOR UPDATE', [id]);
      const membre = rows[0];
      if (!membre) throw ApiError.notFound('Membre introuvable.');

      const { rows: historique } = await client.query(
        `SELECT (SELECT COUNT(*) FROM dons        WHERE membre_id = $1)
              + (SELECT COUNT(*) FROM cotisations WHERE membre_id = $1) AS n`,
        [id]
      );
      if (parseInt(historique[0].n, 10) > 0) {
        throw ApiError.conflict(
          'HISTORY_EXISTS',
          'Ce membre possède des dons ou des cotisations : désactivez-le au lieu de le supprimer.'
        );
      }

      await auditerRequete(client, req, {
        typeEvenement: EVENEMENTS.MEMBRE_SUPPRIME,
        resultat: RESULTATS.SUCCES,
        entiteType: 'membre',
        entiteId: id,
        avant: membre,
      });

      await client.query('DELETE FROM membres WHERE id = $1', [id]);
    });

    res.json({ message: 'Membre supprimé.' });
  })
);

module.exports = router;
