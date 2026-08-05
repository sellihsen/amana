const express = require('express');
const router = express.Router();

const { pool } = require('../config/database');
const { ApiError } = require('../utils/errors');
const { validerMontantPositif, formaterMontant } = require('../utils/money');
const { OPERATIONS } = require('../utils/idempotency');
const { auditerRequete, EVENEMENTS, RESULTATS } = require('../utils/audit');
const {
  avecIdempotence,
  insererEcriture,
  rattacherSource,
  chargerCaisseActive,
  perimetreDeCaisse,
} = require('../utils/posting');
const { debitSocialPossible, totauxListe } = require('../queries/finances');
const { asyncHandler } = require('../middleware/errorHandler');

/** Projection API : les montants sortent en chaînes EUR. */
function projeter(don) {
  if (!don) return null;
  return {
    ...don,
    montant: formaterMontant(don.montant),
    devise: 'EUR',
  };
}

/**
 * @swagger
 * /api/dons:
 *   get:
 *     summary: Liste des dons
 *     tags: [Dons]
 *     responses:
 *       200:
 *         description: Dons, montants en chaînes EUR.
 *       401: { description: Session requise }
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(`
      SELECT d.*,
             m.nom    AS membre_nom,
             m.prenom AS membre_prenom,
             c.nom    AS caisse_nom,
             c.affectation AS caisse_affectation,
             (e.contre_ecriture_de IS NOT NULL OR ce.id IS NOT NULL) AS est_annulee
        FROM dons d
        LEFT JOIN membres m ON d.membre_id = m.id
        LEFT JOIN caisses c ON d.caisse_id = c.id
        LEFT JOIN ecritures_financieres e  ON e.id = d.ecriture_id
        LEFT JOIN ecritures_financieres ce ON ce.contre_ecriture_de = e.id
       ORDER BY d.date_don DESC, d.id DESC
    `);
    const totaux = await totauxListe(pool, 'dons');
    res.json({ items: rows.map(projeter), totaux: { ...totaux, montant: formaterMontant(totaux.montant) } });
  })
);

/**
 * @swagger
 * /api/dons:
 *   post:
 *     summary: Enregistrer un don
 *     description: >
 *       Crée le don, son écriture au grand livre, son audit et sa clé
 *       d'idempotence dans une seule transaction. Le périmètre (GENERAL ou
 *       SOCIAL) est déduit de l'affectation de la caisse. Un don vers une
 *       caisse Social est soumis au même verrou que les distributions.
 *     tags: [Dons]
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
 *             required: [montant, caisse_id]
 *             properties:
 *               montant:     { type: string, pattern: '^(0|[1-9][0-9]*)\.[0-9]{2}$', example: '150.00' }
 *               caisse_id:   { type: integer }
 *               membre_id:   { type: integer, nullable: true }
 *               date_don:    { type: string, format: date }
 *               commentaire: { type: string, nullable: true }
 *               anonyme:     { type: boolean }
 *     responses:
 *       201: { description: Don enregistré avec son ecriture_id }
 *       400: { description: VALIDATION_ERROR (clé ou montant absent) }
 *       409: { description: 'INACTIVE_REFERENCE, IDEMPOTENCY_KEY_REUSED' }
 *       422: { description: INVALID_MONEY_SCALE }
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { membre_id, montant, caisse_id, date_don, commentaire, anonyme } = req.body;
    const montantValide = validerMontantPositif(montant, 'montant');

    await avecIdempotence(req, res, OPERATIONS.DON_CREER, async (client, { idempotencyId }) => {
      // Le verrou de caisse sérialise dons, distributions et contre-écritures.
      const caisse = await chargerCaisseActive(client, caisse_id);
      const perimetre = perimetreDeCaisse(caisse);
      const dateEffet = date_don || new Date().toISOString().slice(0, 10);

      if (membre_id) {
        const { rows } = await client.query('SELECT id FROM membres WHERE id = $1', [membre_id]);
        if (rows.length === 0) {
          throw ApiError.validation({ membre_id: 'Ce membre est introuvable.' });
        }
      }

      const { rows: creees } = await client.query(
        `INSERT INTO dons (membre_id, montant, caisse_id, date_don, commentaire, anonyme, cree_par)
         VALUES ($1, $2::montant_eur_positif, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          membre_id || null,
          montantValide,
          caisse.id,
          dateEffet,
          commentaire || null,
          anonyme === true,
          req.utilisateur.id,
        ]
      );
      const don = creees[0];

      const ecriture = await insererEcriture(client, req, {
        typeEcriture: 'DON',
        perimetre,
        sens: 'CREDIT',
        montant: montantValide,
        dateEffet,
        sourceType: 'don',
        sourceId: don.id,
        caisseId: caisse.id,
        idempotencyId,
      });

      const rattache = await rattacherSource(client, 'don', don.id, ecriture.id);

      await auditerRequete(client, req, {
        typeEvenement: EVENEMENTS.DON_ENREGISTRE,
        resultat: RESULTATS.SUCCES,
        entiteType: 'don',
        entiteId: don.id,
        apres: { ...rattache, perimetre, ecriture_id: ecriture.id },
      });

      const corps = { ...projeter(rattache), perimetre };
      return {
        httpStatus: 201,
        corps,
        ressourceType: 'don',
        ressourceId: don.id,
      };
    });
  })
);

/**
 * @swagger
 * /api/dons/{id}:
 *   delete:
 *     summary: (Interdit) Supprimer un don
 *     description: >
 *       Un don comptabilisé est immuable. La correction passe par
 *       POST /api/ecritures-financieres/{id}/contre-ecritures.
 *     tags: [Dons]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       405: { description: METHOD_NOT_ALLOWED — utiliser une contre-écriture }
 */
router.delete('/:id(\\d+)', (req, res, next) => {
  next(
    ApiError.methodNotAllowed(
      'Un don comptabilisé ne peut pas être supprimé. Créez une contre-écriture motivée.'
    )
  );
});

module.exports = router;
