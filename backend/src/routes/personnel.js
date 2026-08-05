const express  = require('express');
const router   = express.Router();
const { pool } = require('../config/database');
const auth     = require('../middleware/auth');
const { ApiError } = require('../utils/errors');
const {
  validerMontantPositif,
  validerMontantNonNegatif,
  formaterMontant,
} = require('../utils/money');
const { OPERATIONS } = require('../utils/idempotency');
const { auditerRequete, EVENEMENTS, RESULTATS } = require('../utils/audit');
const { avecIdempotence, insererEcriture, rattacherSource } = require('../utils/posting');
const { totauxListe } = require('../queries/finances');
const { resoudreReferenceActive } = require('../utils/references');
const { withTransaction } = require('../utils/transaction');
const { asyncHandler } = require('../middleware/errorHandler');

const ROLES_VALIDES = [
  'Imam', 'Mouadhine', 'Enseignant',
  "Agent d'entretien", 'Secrétaire', 'Comptable', 'Autre',
];

// ═══════════════════════════════════════════════════════════════
//  FICHES PERSONNEL — /api/personnel
// ═══════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/personnel:
 *   get:
 *     summary: Liste tout le personnel avec stats paiements
 *     tags: [Ressources Humaines]
 *     responses:
 *       200:
 *         description: Liste du personnel
 *       500:
 *         description: Erreur serveur
 */
// GET /api/personnel — liste tout le personnel avec stats paiements
router.get('/', auth, async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT p.*,
        COALESCE(SUM(ps.montant_verse), 0)  AS total_verse,
        COUNT(ps.id)                         AS nb_paiements,
        MAX(ps.date_versement)               AS dernier_paiement
      FROM personnel p
      LEFT JOIN paiements_salaires ps ON ps.personnel_id = p.id
      GROUP BY p.id
      ORDER BY p.statut ASC, p.nom ASC, p.prenom ASC
    `);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/personnel/actifs:
 *   get:
 *     summary: Liste du personnel actif
 *     tags: [Ressources Humaines]
 *     responses:
 *       200:
 *         description: Liste du personnel actif
 *       500:
 *         description: Erreur serveur
 */
// GET /api/personnel/actifs — uniquement les actifs (pour les selects)
router.get('/actifs', auth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, nom, prenom, role_poste, salaire_base, statut
       FROM personnel WHERE statut = 'actif'
       ORDER BY nom ASC, prenom ASC`
    );
    res.json(
      result.rows.map((p) => ({ ...p, salaire_base: formaterMontant(p.salaire_base) }))
    );
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/personnel/{id}:
 *   get:
 *     summary: Fiche détaillée d'un employé avec historique
 *     tags: [Ressources Humaines]
 *     responses:
 *       200:
 *         description: Fiche employé
 *       404:
 *         description: Employé introuvable
 *       500:
 *         description: Erreur serveur
 */
// GET /api/personnel/:id — fiche détaillée + historique paiements
router.get('/:id(\\d+)', auth, async (req, res, next) => {
  try {
    const [fiche, paiements] = await Promise.all([
      pool.query('SELECT * FROM personnel WHERE id = $1', [req.params.id]),
      pool.query(
        `SELECT * FROM paiements_salaires WHERE personnel_id = $1
         ORDER BY date_versement DESC`,
        [req.params.id]
      ),
    ]);
    if (fiche.rows.length === 0) {
      throw ApiError.notFound('Employé introuvable.');
    }
    res.json({ ...fiche.rows[0], paiements: paiements.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/personnel:
 *   post:
 *     summary: Créer une fiche personnel
 *     tags: [Ressources Humaines]
 *     responses:
 *       201:
 *         description: Fiche créée
 *       400:
 *         description: Données invalides
 *       500:
 *         description: Erreur serveur
 */
// POST /api/personnel — créer une fiche
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { nom, prenom, role_poste, telephone, email,
            salaire_base, date_embauche, statut, notes } = req.body;

    if (!nom || !String(nom).trim()) {
      throw ApiError.validation({ nom: 'Le nom est requis.' });
    }
    if (!ROLES_VALIDES.includes(role_poste)) {
      throw ApiError.validation({
        role_poste: `Rôle invalide. Valeurs acceptées : ${ROLES_VALIDES.join(', ')}`,
      });
    }
    // Le salaire de base est un montant : il obéit à la même règle EUR.
    const salaireValide = validerMontantNonNegatif(
      salaire_base === undefined || salaire_base === null || salaire_base === ''
        ? '0.00'
        : salaire_base,
      'salaire_base'
    );

    const fiche = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO personnel
           (nom, prenom, role_poste, telephone, email, salaire_base, date_embauche, statut, notes)
         VALUES ($1, $2, $3, $4, $5, $6::montant_eur_non_negatif, $7, $8, $9)
         RETURNING *`,
        [
          String(nom).trim(),
          prenom ? String(prenom).trim() : null,
          role_poste,
          telephone || null,
          email || null,
          salaireValide,
          date_embauche || new Date().toISOString().slice(0, 10),
          statut || 'actif',
          notes || null,
        ]
      );

      await auditerRequete(client, req, {
        typeEvenement: EVENEMENTS.PERSONNEL_CREE,
        resultat: RESULTATS.SUCCES,
        entiteType: 'personnel',
        entiteId: rows[0].id,
        apres: rows[0],
      });

      return rows[0];
    });

    res.status(201).json({ ...fiche, salaire_base: formaterMontant(fiche.salaire_base) });
  })
);

/**
 * @swagger
 * /api/personnel/{id}:
 *   put:
 *     summary: Modifier une fiche personnel
 *     tags: [Ressources Humaines]
 *     responses:
 *       200:
 *         description: Fiche modifiée
 *       400:
 *         description: Données invalides
 *       404:
 *         description: Employé introuvable
 *       500:
 *         description: Erreur serveur
 */
// PUT /api/personnel/:id — modifier une fiche
router.put('/:id(\\d+)', auth, async (req, res, next) => {
  const { nom, prenom, role_poste, telephone, email,
          salaire_base, date_embauche, statut, notes } = req.body;

  if (nom !== undefined && !nom.trim()) {
    return res.status(400).json({ message: 'Le nom ne peut pas être vide.' });
  }
  if (role_poste && !ROLES_VALIDES.includes(role_poste)) {
    return res.status(400).json({ message: `Rôle invalide. Valeurs acceptées : ${ROLES_VALIDES.join(', ')}` });
  }

  try {
    const result = await pool.query(
      `UPDATE personnel SET
         nom          = COALESCE($1, nom),
         prenom       = COALESCE($2, prenom),
         role_poste   = COALESCE($3, role_poste),
         telephone    = COALESCE($4, telephone),
         email        = COALESCE($5, email),
         salaire_base = COALESCE($6, salaire_base),
         date_embauche= COALESCE($7, date_embauche),
         statut       = COALESCE($8, statut),
         notes        = COALESCE($9, notes),
         updated_at   = NOW()
       WHERE id = $10
       RETURNING *`,
      [
        nom?.trim()    || null,
        prenom?.trim() || null,
        role_poste     || null,
        telephone      || null,
        email          || null,
        salaire_base != null ? parseFloat(salaire_base) : null,
        date_embauche  || null,
        statut         || null,
        notes          || null,
        req.params.id,
      ]
    );
    if (result.rows.length === 0) {
      throw ApiError.notFound('Employé introuvable.');
    }
    await withTransaction(async (client) => {
      await auditerRequete(client, req, {
        typeEvenement: EVENEMENTS.PERSONNEL_MODIFIE,
        resultat: RESULTATS.SUCCES,
        entiteType: 'personnel',
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
 * /api/personnel/{id}:
 *   delete:
 *     summary: Supprimer une fiche personnel
 *     tags: [Ressources Humaines]
 *     responses:
 *       200:
 *         description: Fiche supprimée
 *       404:
 *         description: Employé introuvable
 *       409:
 *         description: Paiements liés
 *       500:
 *         description: Erreur serveur
 */
// DELETE /api/personnel/:id — suppression (bloquée si paiements liés)
router.delete(
  '/:id(\\d+)',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);

    await withTransaction(async (client) => {
      const { rows } = await client.query('SELECT * FROM personnel WHERE id = $1 FOR UPDATE', [id]);
      const fiche = rows[0];
      if (!fiche) throw ApiError.notFound('Employé introuvable.');

      const { rows: paiements } = await client.query(
        'SELECT COUNT(*)::int AS n FROM paiements_salaires WHERE personnel_id = $1',
        [id]
      );
      if (paiements[0].n > 0) {
        throw ApiError.conflict(
          'HISTORY_EXISTS',
          `Cet employé possède ${paiements[0].n} paiement(s) : désactivez la fiche au lieu de la supprimer.`
        );
      }

      await auditerRequete(client, req, {
        typeEvenement: EVENEMENTS.PERSONNEL_SUPPRIME,
        resultat: RESULTATS.SUCCES,
        entiteType: 'personnel',
        entiteId: id,
        avant: fiche,
      });

      await client.query('DELETE FROM personnel WHERE id = $1', [id]);
    });

    res.json({ message: 'Fiche personnel supprimée.' });
  })
);

// ═══════════════════════════════════════════════════════════════
//  PAIEMENTS DE SALAIRES — /api/personnel/paiements
// ═══════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/personnel/paiements/tous:
 *   get:
 *     summary: Liste tous les paiements de salaires
 *     tags: [Ressources Humaines]
 *     responses:
 *       200:
 *         description: Liste des paiements
 *       500:
 *         description: Erreur serveur
 */
// GET /api/personnel/paiements — tous les paiements, ordre chronologique desc
router.get('/paiements/tous', auth, async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT ps.*,
             p.nom        AS personnel_nom,
             p.prenom     AS personnel_prenom,
             p.role_poste AS personnel_role,
             u.nom        AS utilisateur_nom
      FROM paiements_salaires ps
      JOIN personnel p ON ps.personnel_id = p.id
      LEFT JOIN utilisateurs u ON ps.cree_par = u.id
      ORDER BY ps.date_versement DESC, ps.created_at DESC
    `);
    const totaux = await totauxListe(pool, 'paiements_salaires');

    // Ventilations calculées en SQL : l'interface n'additionne jamais.
    const { rows: parType } = await pool.query(`
      SELECT ps.type_paiement,
             COUNT(*)::int AS nombre,
             COALESCE(SUM(ps.montant_verse) FILTER (
               WHERE ps.ecriture_id IS NOT NULL
                 AND NOT EXISTS (SELECT 1 FROM ecritures_financieres ce
                                  WHERE ce.contre_ecriture_de = ps.ecriture_id)
             ), 0)::TEXT AS montant
        FROM paiements_salaires ps
       GROUP BY ps.type_paiement
       ORDER BY ps.type_paiement
    `);

    const { rows: masse } = await pool.query(`
      SELECT COALESCE(SUM(salaire_base), 0)::TEXT AS masse_salariale,
             COUNT(*)::int AS effectif_actif
        FROM personnel WHERE statut = 'actif'
    `);

    res.json({
      items: result.rows.map((p) => ({
        ...p,
        montant_verse: formaterMontant(p.montant_verse),
        devise: 'EUR',
      })),
      totaux: { ...totaux, montant: formaterMontant(totaux.montant) },
      par_type: parType.map((t) => ({ ...t, montant: formaterMontant(t.montant) })),
      masse_salariale: formaterMontant(masse[0].masse_salariale),
      effectif_actif: masse[0].effectif_actif,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/personnel/paiements:
 *   post:
 *     summary: Enregistrer un paiement de salaire
 *     description: >
 *       Crée le paiement, son écriture DEBIT au grand livre, son audit et sa
 *       clé d'idempotence dans une seule transaction.
 *     tags: [Ressources Humaines]
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
 *             required: [personnel_id, montant_verse]
 *             properties:
 *               personnel_id:   { type: integer }
 *               montant_verse:  { type: string, pattern: '^(0|[1-9][0-9]*)\.[0-9]{2}$' }
 *               type_paiement:  { type: string }
 *               date_versement: { type: string, format: date }
 *               mois_concerne:  { type: string }
 *               commentaire:    { type: string, nullable: true }
 *     responses:
 *       201: { description: Paiement enregistré avec son ecriture_id }
 *       400: { description: VALIDATION_ERROR }
 *       404: { description: Employé introuvable }
 *       409: { description: IDEMPOTENCY_KEY_REUSED }
 *       422: { description: INVALID_MONEY_SCALE }
 */
router.post(
  '/paiements',
  asyncHandler(async (req, res) => {
    const { personnel_id, montant_verse, type_paiement, date_versement, mois_concerne, commentaire } =
      req.body;

    if (!personnel_id) {
      throw ApiError.validation({ personnel_id: "L'employé est requis." });
    }
    const montantValide = validerMontantPositif(montant_verse, 'montant_verse');

    await avecIdempotence(req, res, OPERATIONS.SALAIRE_PAYER, async (client, { idempotencyId }) => {
      const { rows: employes } = await client.query(
        'SELECT id, nom, prenom FROM personnel WHERE id = $1',
        [personnel_id]
      );
      if (employes.length === 0) {
        throw ApiError.notFound('Employé introuvable.');
      }

      const dateEffet = date_versement || new Date().toISOString().slice(0, 10);

      const reference = await resoudreReferenceActive(
        client,
        'types-paiement-rh',
        type_paiement || 'Salaire mensuel',
        'type_paiement'
      );

      const { rows: creees } = await client.query(
        `INSERT INTO paiements_salaires
           (personnel_id, montant_verse, type_paiement, date_versement, mois_concerne,
            commentaire, cree_par, type_paiement_ref_id)
         VALUES ($1, $2::montant_eur_positif, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          parseInt(personnel_id, 10),
          montantValide,
          reference.nom,
          dateEffet,
          mois_concerne || null,
          commentaire || null,
          req.utilisateur.id,
          reference.id,
        ]
      );
      const paiement = creees[0];

      const ecriture = await insererEcriture(client, req, {
        typeEcriture: 'PAIEMENT_SALAIRE',
        perimetre: 'GENERAL',
        sens: 'DEBIT',
        montant: montantValide,
        dateEffet,
        sourceType: 'paiement_salaire',
        sourceId: paiement.id,
        idempotencyId,
      });

      await rattacherSource(client, 'paiement_salaire', paiement.id, ecriture.id);

      const { rows: enrichis } = await client.query(
        `SELECT ps.*, p.nom AS personnel_nom, p.prenom AS personnel_prenom,
                p.role_poste AS personnel_role
           FROM paiements_salaires ps
           JOIN personnel p ON ps.personnel_id = p.id
          WHERE ps.id = $1`,
        [paiement.id]
      );
      const complet = enrichis[0];

      await auditerRequete(client, req, {
        typeEvenement: EVENEMENTS.SALAIRE_PAYE,
        resultat: RESULTATS.SUCCES,
        entiteType: 'paiement_salaire',
        entiteId: paiement.id,
        apres: complet,
      });

      return {
        httpStatus: 201,
        corps: { ...complet, montant_verse: formaterMontant(complet.montant_verse), devise: 'EUR' },
        ressourceType: 'paiement_salaire',
        ressourceId: paiement.id,
      };
    });
  })
);

/**
 * @swagger
 * /api/personnel/paiements/{id}:
 *   delete:
 *     summary: (Interdit) Supprimer un paiement de salaire
 *     description: >
 *       Un paiement comptabilisé est immuable. La correction passe par
 *       POST /api/ecritures-financieres/{id}/contre-ecritures.
 *     tags: [Ressources Humaines]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       405:
 *         description: METHOD_NOT_ALLOWED — utiliser une contre-écriture
 */
router.delete('/paiements/:id(\\d+)', (req, res, next) => {
  next(
    ApiError.methodNotAllowed(
      'Un paiement de salaire comptabilisé ne peut pas être supprimé. Créez une contre-écriture motivée.'
    )
  );
});

module.exports = router;
