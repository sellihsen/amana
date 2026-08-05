const express  = require('express');
const router   = express.Router();
const { pool } = require('../config/database');
const auth     = require('../middleware/auth');
const { ApiError } = require('../utils/errors');
const { validerMontantPositif, formaterMontant } = require('../utils/money');
const { OPERATIONS } = require('../utils/idempotency');
const { auditerRequete, EVENEMENTS, RESULTATS } = require('../utils/audit');
const { avecIdempotence, insererEcriture, rattacherSource } = require('../utils/posting');
const { totauxListe } = require('../queries/finances');
const { resoudreReferenceActive } = require('../utils/references');
const { withTransaction } = require('../utils/transaction');
const { asyncHandler } = require('../middleware/errorHandler');

const METHODES_VALIDES  = ['Espèces', 'Virement', 'Chèque'];
const STATUTS_COTIS     = ['payé', 'en attente'];

// ═══════════════════════════════════════════════════════════════
//  ÉLÈVES — /api/eleves
// ═══════════════════════════════════════════════════════════════

// GET /api/eleves — liste complète avec stats cotisations
/** @swagger
 * /api/eleves:
 *   get:
 *     summary: Liste complète des élèves avec statistiques de cotisations
 *     tags: [Madrasa]
 *     responses:
 *       200:
 *         description: Liste des élèves
 *       500:
 *         description: Erreur serveur
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const classe = req.query.classe ? String(req.query.classe) : null;
    const statut = req.query.statut ? String(req.query.statut) : null;

    if (statut && !['actif', 'inactif'].includes(statut)) {
      throw ApiError.validation({ statut: 'Le statut doit être « actif » ou « inactif ».' });
    }

    const { rows } = await pool.query(
      `SELECT e.*,
              COUNT(cm.id) AS nb_cotisations,
              COALESCE(SUM(cm.montant) FILTER (WHERE cm.statut_paiement = 'payé'), 0)::TEXT
                AS total_paye,
              COALESCE(SUM(cm.montant) FILTER (WHERE cm.statut_paiement = 'en attente'), 0)::TEXT
                AS total_en_attente,
              MAX(cm.periode) AS derniere_periode_payee
         FROM eleves e
         LEFT JOIN cotisations_madrasa cm ON cm.eleve_id = e.id
        WHERE ($1::text IS NULL OR e.classe = $1)
          AND ($2::text IS NULL OR e.statut = $2)
        GROUP BY e.id
        ORDER BY e.statut ASC, e.classe ASC, e.nom ASC`,
      [classe, statut]
    );

    res.json(
      rows.map((e) => ({
        ...e,
        total_paye: formaterMontant(e.total_paye),
        total_en_attente: formaterMontant(e.total_en_attente),
      }))
    );
  })
);

// GET /api/eleves/actifs — uniquement les actifs (pour les selects)
/** @swagger
 * /api/eleves/actifs:
 *   get:
 *     summary: Liste des élèves actifs (pour les selects)
 *     tags: [Madrasa]
 *     responses:
 *       200:
 *         description: Liste des élèves actifs
 *       500:
 *         description: Erreur serveur
 */
router.get('/actifs', auth, async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT id, nom, prenom, classe, nom_parent, statut
      FROM eleves WHERE statut = 'actif'
      ORDER BY classe ASC, nom ASC
    `);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/eleves/:id — fiche détaillée + historique cotisations
/** @swagger
 * /api/eleves/{id}:
 *   get:
 *     summary: Fiche détaillée d'un élève avec historique des cotisations
 *     tags: [Madrasa]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de l'élève
 *     responses:
 *       200:
 *         description: Détails de l'élève
 *       404:
 *         description: Élève introuvable
 *       500:
 *         description: Erreur serveur
 */
router.get('/:id(\\d+)', auth, async (req, res, next) => {
  try {
    const [fiche, cotisations] = await Promise.all([
      pool.query('SELECT * FROM eleves WHERE id = $1', [req.params.id]),
      pool.query(
        `SELECT * FROM cotisations_madrasa WHERE eleve_id = $1 ORDER BY mois_concerne DESC`,
        [req.params.id]
      ),
    ]);
    if (fiche.rows.length === 0) {
      throw ApiError.notFound('Élève introuvable.');
    }
    res.json({ ...fiche.rows[0], cotisations: cotisations.rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/eleves — inscrire un nouvel élève
/** @swagger
 * /api/eleves:
 *   post:
 *     summary: Inscrire un nouvel élève
 *     tags: [Madrasa]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nom:
 *                 type: string
 *               prenom:
 *                 type: string
 *               classe:
 *                 type: string
 *               nom_parent:
 *                 type: string
 *               telephone_parent:
 *                 type: string
 *               date_inscription:
 *                 type: string
 *                 format: date
 *               statut:
 *                 type: string
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Élève créé
 *       400:
 *         description: Données invalides
 *       500:
 *         description: Erreur serveur
 */
router.post('/', auth, async (req, res, next) => {
  const { nom, prenom, classe, nom_parent, telephone_parent,
          date_inscription, statut, notes } = req.body;

  if (!nom?.trim()) return res.status(400).json({ message: 'Le nom est requis.' });
  try {
    const reference = await withTransaction((client) =>
      resoudreReferenceActive(client, 'classes-madrasa', classe || 'Débutants', 'classe')
    );
    const result = await pool.query(
      `INSERT INTO eleves
         (nom, prenom, classe, nom_parent, telephone_parent, date_inscription, statut, notes, classe_ref_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        nom.trim(),
        prenom?.trim()    || null,
        // Libellé figé au moment de l'inscription.
        reference.nom,
        nom_parent?.trim()        || null,
        telephone_parent?.trim()  || null,
        date_inscription || new Date(),
        statut || 'actif',
        notes || null,
        reference.id,
      ]
    );
    await withTransaction(async (client) => {
      await auditerRequete(client, req, {
        typeEvenement: EVENEMENTS.ELEVE_CREE,
        resultat: RESULTATS.SUCCES,
        entiteType: 'eleve',
        entiteId: result.rows[0].id,
        apres: result.rows[0],
      });
    });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// PUT /api/eleves/:id — modifier une fiche élève
/** @swagger
 * /api/eleves/{id}:
 *   put:
 *     summary: Modifier une fiche élève
 *     tags: [Madrasa]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de l'élève
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nom:
 *                 type: string
 *               prenom:
 *                 type: string
 *               classe:
 *                 type: string
 *               nom_parent:
 *                 type: string
 *               telephone_parent:
 *                 type: string
 *               date_inscription:
 *                 type: string
 *                 format: date
 *               statut:
 *                 type: string
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Élève mis à jour
 *       400:
 *         description: Données invalides
 *       404:
 *         description: Élève introuvable
 *       500:
 *         description: Erreur serveur
 */
router.put('/:id(\\d+)', auth, async (req, res, next) => {
  const { nom, prenom, classe, nom_parent, telephone_parent,
          date_inscription, statut, notes } = req.body;

  if (nom !== undefined && !nom?.trim()) {
    return res.status(400).json({ message: 'Le nom ne peut pas être vide.' });
  }
  try {
    const result = await pool.query(
      `UPDATE eleves SET
         nom              = COALESCE($1, nom),
         prenom           = COALESCE($2, prenom),
         classe           = COALESCE($3, classe),
         nom_parent       = COALESCE($4, nom_parent),
         telephone_parent = COALESCE($5, telephone_parent),
         date_inscription = COALESCE($6, date_inscription),
         statut           = COALESCE($7, statut),
         notes            = COALESCE($8, notes),
         updated_at       = NOW()
       WHERE id = $9
       RETURNING *`,
      [
        nom?.trim()      || null,
        prenom?.trim()   || null,
        classe           || null,
        nom_parent?.trim()       || null,
        telephone_parent?.trim() || null,
        date_inscription         || null,
        statut                   || null,
        notes                    || null,
        req.params.id,
      ]
    );
    if (result.rows.length === 0) {
      throw ApiError.notFound('Élève introuvable.');
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/eleves/:id — suppression (bloquée si cotisations liées)
/** @swagger
 * /api/eleves/{id}:
 *   delete:
 *     summary: Supprimer une fiche élève (bloquée si cotisations liées)
 *     tags: [Madrasa]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de l'élève
 *     responses:
 *       200:
 *         description: Fiche élève supprimée
 *       404:
 *         description: Élève introuvable
 *       409:
 *         description: Suppression bloquée (cotisations liées)
 *       500:
 *         description: Erreur serveur
 */
router.delete(
  '/:id(\\d+)',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);

    await withTransaction(async (client) => {
      const { rows } = await client.query('SELECT * FROM eleves WHERE id = $1 FOR UPDATE', [id]);
      const eleve = rows[0];
      if (!eleve) throw ApiError.notFound('Élève introuvable.');

      const { rows: ecolages } = await client.query(
        'SELECT COUNT(*)::int AS n FROM cotisations_madrasa WHERE eleve_id = $1',
        [id]
      );
      if (ecolages[0].n > 0) {
        throw ApiError.conflict(
          'HISTORY_EXISTS',
          `Cet élève possède ${ecolages[0].n} écolage(s) : désactivez la fiche au lieu de la supprimer.`
        );
      }

      await auditerRequete(client, req, {
        typeEvenement: EVENEMENTS.ELEVE_SUPPRIME,
        resultat: RESULTATS.SUCCES,
        entiteType: 'eleve',
        entiteId: id,
        avant: eleve,
      });

      await client.query('DELETE FROM eleves WHERE id = $1', [id]);
    });

    res.json({ message: 'Fiche élève supprimée.' });
  })
);

// ═══════════════════════════════════════════════════════════════
//  COTISATIONS MADRASA — /api/eleves/cotisations
// ═══════════════════════════════════════════════════════════════

// GET /api/eleves/cotisations/toutes — liste chronologique complète
/** @swagger
 * /api/eleves/cotisations/toutes:
 *   get:
 *     summary: Liste chronologique complète des cotisations
 *     tags: [Madrasa]
 *     responses:
 *       200:
 *         description: Liste des cotisations
 *       500:
 *         description: Erreur serveur
 */
router.get('/cotisations/toutes', auth, async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT cm.*,
             e.nom      AS eleve_nom,
             e.prenom   AS eleve_prenom,
             e.classe   AS eleve_classe,
             e.nom_parent
      FROM cotisations_madrasa cm
      JOIN eleves e ON cm.eleve_id = e.id
      ORDER BY cm.mois_concerne DESC, cm.created_at DESC
    `);
    const totaux = await totauxListe(pool, 'cotisations_madrasa');

    const { rows: parMethode } = await pool.query(`
      SELECT cm.methode_paiement,
             COUNT(*) FILTER (WHERE cm.statut_paiement = 'payé')::int AS nombre,
             COALESCE(SUM(cm.montant) FILTER (
               WHERE cm.ecriture_id IS NOT NULL
                 AND NOT EXISTS (SELECT 1 FROM ecritures_financieres ce
                                  WHERE ce.contre_ecriture_de = cm.ecriture_id)
             ), 0)::TEXT AS montant
        FROM cotisations_madrasa cm
       GROUP BY cm.methode_paiement
       ORDER BY cm.methode_paiement
    `);

    const { rows: attente } = await pool.query(`
      SELECT COUNT(*)::int AS nombre_en_attente,
             COALESCE(SUM(montant), 0)::TEXT AS montant_en_attente
        FROM cotisations_madrasa WHERE statut_paiement = 'en attente'
    `);

    res.json({
      items: result.rows.map((c) => ({
        ...c,
        montant: formaterMontant(c.montant),
        devise: 'EUR',
      })),
      totaux: {
        ...totaux,
        montant: formaterMontant(totaux.montant),
        nombre_en_attente: attente[0].nombre_en_attente,
        montant_en_attente: formaterMontant(attente[0].montant_en_attente),
      },
      par_methode: parMethode.map((m) => ({ ...m, montant: formaterMontant(m.montant) })),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/eleves/cotisations/resume — stats financières pour le dashboard
/** @swagger
 * /api/eleves/cotisations/resume:
 *   get:
 *     summary: Statistiques financières des cotisations pour le dashboard
 *     tags: [Madrasa]
 *     responses:
 *       200:
 *         description: Résumé des cotisations
 *       500:
 *         description: Erreur serveur
 */
router.get('/cotisations/resume', auth, async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*)                                                               AS nb_total,
        COALESCE(SUM(montant) FILTER (WHERE statut_paiement = 'payé'), 0)     AS total_paye,
        COALESCE(SUM(montant) FILTER (WHERE statut_paiement = 'en attente'), 0) AS total_en_attente,
        COUNT(*) FILTER (WHERE statut_paiement = 'en attente')                AS nb_en_attente,
        (SELECT COUNT(*) FROM eleves WHERE statut = 'actif')                  AS nb_eleves_actifs,
        (SELECT COUNT(DISTINCT classe) FROM eleves WHERE statut = 'actif')    AS nb_classes
      FROM cotisations_madrasa
    `);
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /api/eleves/cotisations — enregistrer un paiement
/** @swagger
 * /api/eleves/cotisations:
 *   post:
 *     summary: Enregistrer un écolage
 *     description: >
 *       Un écolage au statut « payé » est comptabilisé immédiatement au grand
 *       livre ; « en attente » reste un brouillon modifiable. Le mois est
 *       normalisé en période canonique (1er du mois) : « Septembre 2026 » et
 *       « 2026-09 » désignent la même période, et un doublon est refusé.
 *     tags: [Madrasa]
 *     parameters:
 *       - $ref: '#/components/parameters/IdempotencyKey'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [eleve_id, montant, mois_concerne]
 *             properties:
 *               eleve_id:         { type: integer }
 *               montant:          { $ref: '#/components/schemas/MoneyEUR' }
 *               mois_concerne:    { type: string, example: 'Septembre 2026' }
 *               date_paiement:    { type: string, format: date }
 *               methode_paiement: { type: string, enum: [Espèces, Virement, Chèque] }
 *               statut_paiement:  { type: string, enum: ['payé', 'en attente'] }
 *               commentaire:      { type: string, nullable: true }
 *     responses:
 *       201: { description: 'Écolage créé ; ecriture_id nul si non comptabilisé' }
 *       400: { description: VALIDATION_ERROR }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { description: Élève introuvable }
 *       409: { description: 'DUPLICATE_OPERATION (élève/mois), IDEMPOTENCY_KEY_REUSED' }
 *       422: { description: 'INVALID_MONEY_SCALE, INVALID_PERIOD' }
 */
router.post(
  '/cotisations',
  asyncHandler(async (req, res) => {
    const {
      eleve_id, montant, mois_concerne, date_paiement,
      methode_paiement, statut_paiement, commentaire,
    } = req.body;

    if (!eleve_id) throw ApiError.validation({ eleve_id: "L'élève est requis." });
    const montantValide = validerMontantPositif(montant, 'montant');
    if (!mois_concerne || !String(mois_concerne).trim()) {
      throw ApiError.validation({ mois_concerne: 'Le mois concerné est requis.' });
    }
    if (methode_paiement && !METHODES_VALIDES.includes(methode_paiement)) {
      throw ApiError.validation({
        methode_paiement: `Méthode invalide. Valeurs : ${METHODES_VALIDES.join(', ')}`,
      });
    }
    const statutFinal = statut_paiement || 'payé';
    if (!STATUTS_COTIS.includes(statutFinal)) {
      throw ApiError.validation({
        statut_paiement: `Statut invalide. Valeurs : ${STATUTS_COTIS.join(', ')}`,
      });
    }

    await avecIdempotence(req, res, OPERATIONS.ECOLAGE_CREER, async (client, { idempotencyId }) => {
      const { rows: eleves } = await client.query('SELECT id FROM eleves WHERE id = $1', [eleve_id]);
      if (eleves.length === 0) throw ApiError.notFound('Élève introuvable.');

      const dateEffet = date_paiement || new Date().toISOString().slice(0, 10);

      // La période canonique (1er du mois) est produite par PostgreSQL : la
      // même fonction sert à la migration et à l'API, donc « Septembre 2026 »
      // et « 2026-09 » désignent forcément la même période.
      const { rows: periodes } = await client.query(
        'SELECT periode_canonique($1) AS periode',
        [String(mois_concerne).trim()]
      );
      if (!periodes[0].periode) {
        throw ApiError.unprocessable('INVALID_PERIOD', 
          'Le mois indiqué est ininterprétable. Utilisez « Septembre 2026 » ou « 2026-09 ».');
      }
      const periode = periodes[0].periode;

      // Un seul écolage par élève et par mois.
      const { rows: existants } = await client.query(
        'SELECT id FROM cotisations_madrasa WHERE eleve_id = $1 AND periode = $2',
        [eleve_id, periode]
      );
      if (existants.length > 0) {
        throw ApiError.conflict(
          'DUPLICATE_OPERATION',
          'Un écolage existe déjà pour cet élève et ce mois.'
        );
      }

      const { rows: creees } = await client.query(
        `INSERT INTO cotisations_madrasa
           (eleve_id, montant, mois_concerne, periode, date_paiement, methode_paiement,
            statut_paiement, commentaire, cree_par)
         VALUES ($1, $2::montant_eur_positif, $3, $9, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          parseInt(eleve_id, 10),
          montantValide,
          String(mois_concerne).trim(),
          dateEffet,
          methode_paiement || 'Espèces',
          statutFinal,
          commentaire || null,
          req.utilisateur.id,
          periode,
        ]
      );
      let cotisation = creees[0];

      // Seul un écolage payé est comptabilisé.
      if (statutFinal === 'payé') {
        const ecriture = await insererEcriture(client, req, {
          typeEcriture: 'ECOLAGE',
          perimetre: 'GENERAL',
          sens: 'CREDIT',
          montant: montantValide,
          dateEffet,
          sourceType: 'cotisation_madrasa',
          sourceId: cotisation.id,
          idempotencyId,
        });
        cotisation = await rattacherSource(client, 'cotisation_madrasa', cotisation.id, ecriture.id);
      }

      const { rows: enrichis } = await client.query(
        `SELECT cm.*, e.nom AS eleve_nom, e.prenom AS eleve_prenom,
                e.classe AS eleve_classe, e.nom_parent
           FROM cotisations_madrasa cm
           JOIN eleves e ON cm.eleve_id = e.id
          WHERE cm.id = $1`,
        [cotisation.id]
      );
      const complet = enrichis[0];

      await auditerRequete(client, req, {
        typeEvenement: EVENEMENTS.ECOLAGE_ENREGISTRE,
        resultat: RESULTATS.SUCCES,
        entiteType: 'cotisation_madrasa',
        entiteId: cotisation.id,
        apres: complet,
      });

      return {
        httpStatus: 201,
        corps: { ...complet, montant: formaterMontant(complet.montant), devise: 'EUR' },
        ressourceType: 'cotisation_madrasa',
        ressourceId: cotisation.id,
      };
    });
  })
);

/** @swagger
 * /api/eleves/cotisations/{id}:
 *   put:
 *     summary: Modifier le statut ou le montant d'un paiement
 *     tags: [Madrasa]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la cotisation
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               montant:
 *                 $ref: '#/components/schemas/MoneyEUR'
 *               mois_concerne:
 *                 type: string
 *               date_paiement:
 *                 type: string
 *                 format: date
 *               methode_paiement:
 *                 type: string
 *               statut_paiement:
 *                 type: string
 *               commentaire:
 *                 type: string
 *     responses:
 *       200:
 *         description: Écolage modifié
 *       404:
 *         description: RESOURCE_NOT_FOUND
 *       409:
 *         description: HISTORY_EXISTS — écolage comptabilisé, utiliser une contre-écriture
 *       422:
 *         description: 'INVALID_MONEY_SCALE, INVALID_PERIOD'
 */
router.put(
  '/cotisations/:id(\\d+)',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { montant, mois_concerne, date_paiement, methode_paiement, statut_paiement, commentaire } =
      req.body;

    const montantValide = montant == null ? null : validerMontantPositif(montant, 'montant');
    if (methode_paiement && !METHODES_VALIDES.includes(methode_paiement)) {
      throw ApiError.validation({
        methode_paiement: `Méthode invalide. Valeurs : ${METHODES_VALIDES.join(', ')}`,
      });
    }
    if (statut_paiement && !STATUTS_COTIS.includes(statut_paiement)) {
      throw ApiError.validation({
        statut_paiement: `Statut invalide. Valeurs : ${STATUTS_COTIS.join(', ')}`,
      });
    }

    const resultat = await withTransaction(async (client) => {
      const { rows } = await client.query(
        'SELECT * FROM cotisations_madrasa WHERE id = $1 FOR UPDATE',
        [id]
      );
      const avant = rows[0];
      if (!avant) throw ApiError.notFound('Cotisation introuvable.');

      // Un écolage comptabilisé est immuable.
      if (avant.ecriture_id) {
        throw ApiError.conflict(
          'HISTORY_EXISTS',
          'Cet écolage est comptabilisé : créez une contre-écriture pour le corriger.'
        );
      }

      const statutFinal = statut_paiement || avant.statut_paiement;

      const { rows: modifiees } = await client.query(
        `UPDATE cotisations_madrasa
            SET montant          = COALESCE($2::montant_eur_positif, montant),
                mois_concerne    = COALESCE($3, mois_concerne),
                date_paiement    = COALESCE($4, date_paiement),
                methode_paiement = COALESCE($5, methode_paiement),
                statut_paiement  = $6,
                commentaire      = COALESCE($7, commentaire),
                updated_at       = NOW()
          WHERE id = $1
          RETURNING *`,
        [
          id,
          montantValide,
          mois_concerne ? String(mois_concerne).trim() : null,
          date_paiement || null,
          methode_paiement || null,
          statutFinal,
          commentaire == null ? null : commentaire,
        ]
      );
      let cotisation = modifiees[0];

      // Le passage à « payé » comptabilise, une seule fois.
      if (statutFinal === 'payé') {
        const ecriture = await insererEcriture(client, req, {
          typeEcriture: 'ECOLAGE',
          perimetre: 'GENERAL',
          sens: 'CREDIT',
          montant: formaterMontant(cotisation.montant),
          dateEffet: cotisation.date_paiement || new Date().toISOString().slice(0, 10),
          sourceType: 'cotisation_madrasa',
          sourceId: cotisation.id,
        });
        cotisation = await rattacherSource(client, 'cotisation_madrasa', cotisation.id, ecriture.id);
      }

      await auditerRequete(client, req, {
        typeEvenement: EVENEMENTS.ECOLAGE_MODIFIE,
        resultat: RESULTATS.SUCCES,
        entiteType: 'cotisation_madrasa',
        entiteId: id,
        avant,
        apres: cotisation,
      });

      return cotisation;
    });

    res.json({ ...resultat, montant: formaterMontant(resultat.montant), devise: 'EUR' });
  })
);

/**
 * @swagger
 * /api/eleves/cotisations/{id}:
 *   delete:
 *     summary: Supprimer un écolage non comptabilisé
 *     description: >
 *       Un écolage payé est comptabilisé et retourne 409 : sa correction passe
 *       par POST /api/ecritures-financieres/{id}/contre-ecritures.
 *     tags: [Madrasa]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Écolage supprimé }
 *       404: { description: RESOURCE_NOT_FOUND }
 *       409: { description: HISTORY_EXISTS — utiliser une contre-écriture }
 */
router.delete(
  '/cotisations/:id(\\d+)',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);

    await withTransaction(async (client) => {
      const { rows } = await client.query(
        'SELECT * FROM cotisations_madrasa WHERE id = $1 FOR UPDATE',
        [id]
      );
      const cotisation = rows[0];
      if (!cotisation) throw ApiError.notFound('Cotisation introuvable.');

      if (cotisation.ecriture_id) {
        throw ApiError.conflict(
          'HISTORY_EXISTS',
          'Cet écolage est comptabilisé : créez une contre-écriture pour l’annuler.'
        );
      }

      await auditerRequete(client, req, {
        typeEvenement: EVENEMENTS.ECOLAGE_SUPPRIME,
        resultat: RESULTATS.SUCCES,
        entiteType: 'cotisation_madrasa',
        entiteId: id,
        avant: cotisation,
      });

      await client.query('DELETE FROM cotisations_madrasa WHERE id = $1', [id]);
    });

    res.json({ message: 'Cotisation supprimée.' });
  })
);

module.exports = router;
