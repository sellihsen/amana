const express = require('express');
const router = express.Router();

const { pool } = require('../config/database');
const { ApiError } = require('../utils/errors');
const { validerMontantPositif, formaterMontant } = require('../utils/money');
const { OPERATIONS } = require('../utils/idempotency');
const { auditerRequete, EVENEMENTS, RESULTATS } = require('../utils/audit');
const { avecIdempotence, insererEcriture, rattacherSource } = require('../utils/posting');
const { totauxListe } = require('../queries/finances');
const { resoudreReferenceActive } = require('../utils/references');
const { asyncHandler } = require('../middleware/errorHandler');

function projeter(depense) {
  if (!depense) return null;
  return { ...depense, montant: formaterMontant(depense.montant), devise: 'EUR' };
}

/**
 * @swagger
 * /api/depenses:
 *   get:
 *     summary: Liste des dépenses
 *     tags: [Dépenses]
 *     responses:
 *       200: { description: 'Dépenses, montants en chaînes EUR' }
 *       401: { description: Session requise }
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(`
      SELECT d.*,
             u.nom AS utilisateur_nom,
             (ce.id IS NOT NULL) AS est_annulee
        FROM depenses d
        LEFT JOIN utilisateurs u ON d.cree_par = u.id
        LEFT JOIN ecritures_financieres ce ON ce.contre_ecriture_de = d.ecriture_id
       ORDER BY d.date_depense DESC, d.id DESC
    `);
    const totaux = await totauxListe(pool, 'depenses');
    res.json({ items: rows.map(projeter), totaux: { ...totaux, montant: formaterMontant(totaux.montant) } });
  })
);

/**
 * @swagger
 * /api/depenses:
 *   post:
 *     summary: Enregistrer une dépense
 *     description: >
 *       Crée la dépense, son écriture DEBIT au grand livre, son audit et sa clé
 *       d'idempotence dans une seule transaction.
 *     tags: [Dépenses]
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
 *             required: [libelle, montant]
 *             properties:
 *               libelle:          { type: string, minLength: 1, maxLength: 200 }
 *               montant:          { type: string, pattern: '^(0|[1-9][0-9]*)\.[0-9]{2}$' }
 *               categorie:        { type: string }
 *               date_depense:     { type: string, format: date }
 *               numero_facture:   { type: string, nullable: true }
 *               justificatif_url: { type: string, nullable: true }
 *               commentaire:      { type: string, nullable: true }
 *     responses:
 *       201: { description: Dépense enregistrée avec son ecriture_id }
 *       400: { description: VALIDATION_ERROR }
 *       409: { description: IDEMPOTENCY_KEY_REUSED }
 *       422: { description: INVALID_MONEY_SCALE }
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const {
      libelle,
      montant,
      categorie,
      date_depense,
      justificatif_url,
      commentaire,
      numero_facture,
    } = req.body;

    if (!libelle || String(libelle).trim() === '') {
      throw ApiError.validation({ libelle: 'Le libellé est requis.' });
    }
    const montantValide = validerMontantPositif(montant, 'montant');

    await avecIdempotence(req, res, OPERATIONS.DEPENSE_CREER, async (client, { idempotencyId }) => {
      const dateEffet = date_depense || new Date().toISOString().slice(0, 10);

      // La catégorie doit être une référence ACTIVE ; son libellé est figé
      // dans la dépense (snapshot) pour que l'historique reste stable.
      const reference = categorie
        ? await resoudreReferenceActive(client, 'categories-depenses', categorie, 'categorie')
        : null;

      const { rows: creees } = await client.query(
        `INSERT INTO depenses
           (libelle, montant, categorie, date_depense, justificatif_url,
            commentaire, numero_facture, cree_par, categorie_ref_id)
         VALUES ($1, $2::montant_eur_positif, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          String(libelle).trim(),
          montantValide,
          reference ? reference.nom : null,
          dateEffet,
          justificatif_url || null,
          commentaire || null,
          numero_facture || null,
          req.utilisateur.id,
          reference ? reference.id : null,
        ]
      );
      const depense = creees[0];

      const ecriture = await insererEcriture(client, req, {
        typeEcriture: 'DEPENSE',
        perimetre: 'GENERAL',
        sens: 'DEBIT',
        montant: montantValide,
        dateEffet,
        sourceType: 'depense',
        sourceId: depense.id,
        idempotencyId,
      });

      const rattachee = await rattacherSource(client, 'depense', depense.id, ecriture.id);

      await auditerRequete(client, req, {
        typeEvenement: EVENEMENTS.DEPENSE_ENREGISTREE,
        resultat: RESULTATS.SUCCES,
        entiteType: 'depense',
        entiteId: depense.id,
        apres: rattachee,
      });

      return {
        httpStatus: 201,
        corps: projeter(rattachee),
        ressourceType: 'depense',
        ressourceId: depense.id,
      };
    });
  })
);

/**
 * @swagger
 * /api/depenses/{id}:
 *   delete:
 *     summary: (Interdit) Supprimer une dépense
 *     description: Une dépense comptabilisée se corrige par contre-écriture.
 *     tags: [Dépenses]
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
      'Une dépense comptabilisée ne peut pas être supprimée. Créez une contre-écriture motivée.'
    )
  );
});

module.exports = router;
