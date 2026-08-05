const express = require('express');
const router = express.Router();

const { pool } = require('../config/database');
const { ApiError } = require('../utils/errors');
const { validerMontantPositif, formaterMontant } = require('../utils/money');
const { OPERATIONS } = require('../utils/idempotency');
const { auditerRequete, EVENEMENTS, RESULTATS } = require('../utils/audit');
const { avecIdempotence, insererEcriture, rattacherSource } = require('../utils/posting');
const { withTransaction } = require('../utils/transaction');
const { totauxListe } = require('../queries/finances');
const { asyncHandler } = require('../middleware/errorHandler');

const STATUTS = ['payee', 'en_attente', 'annulee'];
/** Seul ce statut déclenche l'écriture comptable. */
const STATUT_COMPTABILISE = 'payee';

function projeter(cotisation) {
  if (!cotisation) return null;
  return { ...cotisation, montant: formaterMontant(cotisation.montant), devise: 'EUR' };
}

/**
 * @swagger
 * /api/cotisations:
 *   get:
 *     summary: Liste des cotisations de membres
 *     tags: [Cotisations]
 *     responses:
 *       200: { description: 'Cotisations, montants en chaînes EUR' }
 *       401: { description: Session requise }
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(`
      SELECT c.*,
             m.nom    AS membre_nom,
             m.prenom AS membre_prenom,
             (ce.id IS NOT NULL) AS est_annulee
        FROM cotisations c
        LEFT JOIN membres m ON c.membre_id = m.id
        LEFT JOIN ecritures_financieres ce ON ce.contre_ecriture_de = c.ecriture_id
       ORDER BY c.date_paiement DESC, c.id DESC
    `);
    const totaux = await totauxListe(pool, 'cotisations');
    res.json({ items: rows.map(projeter), totaux: { ...totaux, montant: formaterMontant(totaux.montant) } });
  })
);

/**
 * @swagger
 * /api/cotisations:
 *   post:
 *     summary: Enregistrer une cotisation de membre
 *     description: >
 *       Une cotisation créée au statut `payee` est comptabilisée immédiatement.
 *       Aux statuts `en_attente` ou `annulee` elle reste un brouillon
 *       modifiable, sans écriture au grand livre.
 *     tags: [Cotisations]
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
 *             required: [membre_id, montant, annee]
 *             properties:
 *               membre_id:     { type: integer }
 *               montant:       { type: string, pattern: '^(0|[1-9][0-9]*)\.[0-9]{2}$' }
 *               annee:         { type: integer }
 *               mois:          { type: integer, minimum: 1, maximum: 12, nullable: true }
 *               date_paiement: { type: string, format: date }
 *               statut:        { type: string, enum: [payee, en_attente, annulee] }
 *               commentaire:   { type: string, nullable: true }
 *     responses:
 *       201: { description: Cotisation créée ; ecriture_id nul si non comptabilisée }
 *       400: { description: VALIDATION_ERROR }
 *       409: { description: 'DUPLICATE_OPERATION, IDEMPOTENCY_KEY_REUSED' }
 *       422: { description: INVALID_MONEY_SCALE }
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { membre_id, montant, annee, mois, date_paiement, statut, commentaire } = req.body;

    const montantValide = validerMontantPositif(montant, 'montant');
    const statutFinal = statut || STATUT_COMPTABILISE;
    if (!STATUTS.includes(statutFinal)) {
      throw ApiError.validation({ statut: `Le statut doit être l'un de : ${STATUTS.join(', ')}.` });
    }
    if (!Number.isInteger(Number(annee))) {
      throw ApiError.validation({ annee: "L'année est requise." });
    }

    await avecIdempotence(
      req,
      res,
      OPERATIONS.COTISATION_CREER,
      async (client, { idempotencyId }) => {
        const { rows: membres } = await client.query('SELECT id FROM membres WHERE id = $1', [
          membre_id,
        ]);
        if (membres.length === 0) {
          throw ApiError.validation({ membre_id: 'Ce membre est introuvable.' });
        }

        const dateEffet = date_paiement || new Date().toISOString().slice(0, 10);

        const { rows: creees } = await client.query(
          `INSERT INTO cotisations
             (membre_id, montant, annee, mois, date_paiement, statut, commentaire, cree_par)
           VALUES ($1, $2::montant_eur_positif, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [
            membre_id,
            montantValide,
            annee,
            mois === undefined || mois === null || mois === '' ? null : mois,
            dateEffet,
            statutFinal,
            commentaire || null,
            req.utilisateur.id,
          ]
        );
        let cotisation = creees[0];

        if (statutFinal === STATUT_COMPTABILISE) {
          const ecriture = await insererEcriture(client, req, {
            typeEcriture: 'COTISATION_MEMBRE',
            perimetre: 'GENERAL',
            sens: 'CREDIT',
            montant: montantValide,
            dateEffet,
            sourceType: 'cotisation',
            sourceId: cotisation.id,
            idempotencyId,
          });
          cotisation = await rattacherSource(client, 'cotisation', cotisation.id, ecriture.id);
        }

        await auditerRequete(client, req, {
          typeEvenement: EVENEMENTS.COTISATION_ENREGISTREE,
          resultat: RESULTATS.SUCCES,
          entiteType: 'cotisation',
          entiteId: cotisation.id,
          apres: cotisation,
        });

        return {
          httpStatus: 201,
          corps: projeter(cotisation),
          ressourceType: 'cotisation',
          ressourceId: cotisation.id,
        };
      }
    );
  })
);

/**
 * @swagger
 * /api/cotisations/{id}:
 *   put:
 *     summary: Modifier une cotisation non comptabilisée
 *     description: >
 *       Seule une cotisation sans écriture peut être modifiée. Le passage au
 *       statut `payee` crée l'écriture, une seule fois. Une cotisation
 *       comptabilisée retourne 409 et se corrige par contre-écriture.
 *     tags: [Cotisations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Cotisation modifiée }
 *       404: { description: RESOURCE_NOT_FOUND }
 *       409: { description: Cotisation déjà comptabilisée }
 */
router.put(
  '/:id(\\d+)',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { statut, montant, commentaire } = req.body;

    const montantValide =
      montant === undefined ? null : validerMontantPositif(montant, 'montant');
    if (statut !== undefined && !STATUTS.includes(statut)) {
      throw ApiError.validation({ statut: `Le statut doit être l'un de : ${STATUTS.join(', ')}.` });
    }

    const resultat = await withTransaction(async (client) => {
      const { rows } = await client.query('SELECT * FROM cotisations WHERE id = $1 FOR UPDATE', [
        id,
      ]);
      const avant = rows[0];
      if (!avant) throw ApiError.notFound('Cotisation introuvable.');

      if (avant.ecriture_id) {
        throw ApiError.conflict(
          'HISTORY_EXISTS',
          'Cette cotisation est comptabilisée : créez une contre-écriture pour la corriger.'
        );
      }

      const statutFinal = statut === undefined ? avant.statut : statut;
      const montantFinal = montantValide === null ? avant.montant : montantValide;

      const { rows: modifiees } = await client.query(
        `UPDATE cotisations
            SET montant     = $2::montant_eur_positif,
                statut      = $3,
                commentaire = COALESCE($4, commentaire),
                updated_at  = NOW()
          WHERE id = $1
          RETURNING *`,
        [id, montantFinal, statutFinal, commentaire === undefined ? null : commentaire]
      );
      let cotisation = modifiees[0];

      // Le passage à « payee » comptabilise, une seule fois.
      if (statutFinal === STATUT_COMPTABILISE) {
        const ecriture = await insererEcriture(client, req, {
          typeEcriture: 'COTISATION_MEMBRE',
          perimetre: 'GENERAL',
          sens: 'CREDIT',
          montant: formaterMontant(cotisation.montant),
          dateEffet: cotisation.date_paiement || new Date().toISOString().slice(0, 10),
          sourceType: 'cotisation',
          sourceId: cotisation.id,
        });
        cotisation = await rattacherSource(client, 'cotisation', cotisation.id, ecriture.id);
      }

      await auditerRequete(client, req, {
        typeEvenement: EVENEMENTS.COTISATION_MODIFIEE,
        resultat: RESULTATS.SUCCES,
        entiteType: 'cotisation',
        entiteId: id,
        avant,
        apres: cotisation,
      });

      return cotisation;
    });

    res.json(projeter(resultat));
  })
);

/**
 * @swagger
 * /api/cotisations/{id}:
 *   delete:
 *     summary: Supprimer une cotisation non comptabilisée
 *     description: Une cotisation comptabilisée retourne 409.
 *     tags: [Cotisations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Cotisation supprimée }
 *       404: { description: RESOURCE_NOT_FOUND }
 *       409: { description: HISTORY_EXISTS — utiliser une contre-écriture }
 */
router.delete(
  '/:id(\\d+)',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);

    await withTransaction(async (client) => {
      const { rows } = await client.query('SELECT * FROM cotisations WHERE id = $1 FOR UPDATE', [
        id,
      ]);
      const cotisation = rows[0];
      if (!cotisation) throw ApiError.notFound('Cotisation introuvable.');

      if (cotisation.ecriture_id) {
        throw ApiError.conflict(
          'HISTORY_EXISTS',
          'Cette cotisation est comptabilisée : créez une contre-écriture pour l’annuler.'
        );
      }

      await auditerRequete(client, req, {
        typeEvenement: EVENEMENTS.COTISATION_SUPPRIMEE,
        resultat: RESULTATS.SUCCES,
        entiteType: 'cotisation',
        entiteId: id,
        avant: cotisation,
      });

      await client.query('DELETE FROM cotisations WHERE id = $1', [id]);
    });

    res.json({ message: 'Cotisation supprimée.' });
  })
);

module.exports = router;
