const express = require('express');
const router = express.Router();

const { pool } = require('../config/database');
const { ApiError } = require('../utils/errors');
const { formaterMontant } = require('../utils/money');
const { bilanAnnuel, bornesAnnee } = require('../queries/finances');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Année civile validée. La valeur n'est JAMAIS interpolée dans le SQL : elle
 * sert à construire deux bornes de date passées en paramètres.
 */
function anneeDemandee(valeur) {
  const brut = valeur === undefined || valeur === '' ? new Date().getFullYear() : valeur;
  if (!/^\d{4}$/.test(String(brut))) {
    throw ApiError.unprocessable('INVALID_PERIOD', "L'année doit être au format AAAA.");
  }
  const annee = Number.parseInt(brut, 10);
  if (annee < 1970 || annee > 2999) {
    throw ApiError.unprocessable('INVALID_PERIOD', "L'année est hors des bornes acceptées.");
  }
  return annee;
}

/**
 * @swagger
 * /api/bilans/generate:
 *   get:
 *     summary: Bilan financier annuel
 *     description: >
 *       Bilan d'une année civile, bornes `[AAAA-01-01, AAAA+1-01-01)`.
 *       Les totaux viennent du grand livre, contre-écritures déduites, et se
 *       rapprochent ligne à ligne de GET /api/ecritures-financieres.
 *       Le périmètre SOCIAL fait l'objet d'une section séparée et n'entre pas
 *       dans le solde général.
 *     tags: [Bilans]
 *     parameters:
 *       - in: query
 *         name: annee
 *         schema: { type: integer, example: 2026 }
 *         description: Année civile. Par défaut, l'année courante.
 *     responses:
 *       200:
 *         description: Bilan annuel, montants en chaînes EUR.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 annee:   { type: integer }
 *                 periode: { type: object }
 *                 total_dons:        { type: string }
 *                 total_cotisations: { type: string }
 *                 total_madrasa:     { type: string }
 *                 total_entrees:     { type: string }
 *                 total_depenses:    { type: string }
 *                 solde:             { type: string }
 *                 social:            { type: object }
 *                 detail:            { type: object }
 *       401: { description: Session requise }
 *       422: { description: INVALID_PERIOD }
 */
router.get(
  '/generate',
  asyncHandler(async (req, res) => {
    const annee = anneeDemandee(req.query.annee);
    const { debut, fin } = bornesAnnee(annee);

    const bilan = await bilanAnnuel(pool, annee);

    // Détail rapprochable : chaque ventilation est agrégée en SQL sur les
    // mêmes bornes que les totaux.
    const [parCaisse, parCategorie, parTypePaiement] = await Promise.all([
      pool.query(
        `SELECT c.nom AS caisse,
                COUNT(e.id)::int AS nb,
                COALESCE(SUM(e.montant * CASE e.sens WHEN 'CREDIT' THEN 1 ELSE -1 END), 0)::TEXT AS total
           FROM caisses c
           LEFT JOIN ecritures_financieres e
                  ON e.caisse_id = c.id
                 AND e.perimetre = 'GENERAL'
                 AND e.date_effet >= $1::date AND e.date_effet < $2::date
          GROUP BY c.id, c.nom
          HAVING COUNT(e.id) > 0
          ORDER BY c.nom`,
        [debut, fin]
      ),
      pool.query(
        `SELECT COALESCE(d.categorie, 'Non catégorisé') AS categorie,
                COUNT(*)::int AS nb,
                COALESCE(SUM(d.montant), 0)::TEXT AS total
           FROM depenses d
           JOIN ecritures_financieres e ON e.id = d.ecriture_id
          WHERE e.date_effet >= $1::date AND e.date_effet < $2::date
            AND NOT EXISTS (SELECT 1 FROM ecritures_financieres ce WHERE ce.contre_ecriture_de = e.id)
          GROUP BY 1
          ORDER BY 1`,
        [debut, fin]
      ),
      pool.query(
        `SELECT ps.type_paiement,
                COUNT(*)::int AS nb,
                COALESCE(SUM(ps.montant_verse), 0)::TEXT AS total
           FROM paiements_salaires ps
           JOIN ecritures_financieres e ON e.id = ps.ecriture_id
          WHERE e.date_effet >= $1::date AND e.date_effet < $2::date
            AND NOT EXISTS (SELECT 1 FROM ecritures_financieres ce WHERE ce.contre_ecriture_de = e.id)
          GROUP BY 1
          ORDER BY 1`,
        [debut, fin]
      ),
    ]);

    const montants = (lignes, cle = 'total') =>
      lignes.map((l) => ({ ...l, [cle]: formaterMontant(l[cle]) }));

    res.json({
      annee: bilan.annee,
      periode: bilan.periode,

      total_dons: formaterMontant(bilan.total_dons),
      total_cotisations: formaterMontant(bilan.total_cotisations),
      total_madrasa: formaterMontant(bilan.total_madrasa),
      total_entrees: formaterMontant(bilan.total_entrees),
      total_depenses_directes: formaterMontant(bilan.total_depenses_directes),
      total_salaires: formaterMontant(bilan.total_salaires),
      total_depenses: formaterMontant(bilan.total_depenses),
      solde: formaterMontant(bilan.solde),

      social: {
        total_collecte: formaterMontant(bilan.social.total_collecte),
        total_distribue: formaterMontant(bilan.social.total_distribue),
        reste_disponible: formaterMontant(bilan.social.reste_disponible),
        caisses: bilan.social.caisses.map((c) => ({
          ...c,
          total_collecte: formaterMontant(c.total_collecte),
          total_distribue: formaterMontant(c.total_distribue),
          reste_disponible: formaterMontant(c.reste_disponible),
        })),
      },

      detail: {
        dons_par_caisse: montants(parCaisse.rows),
        depenses_par_categorie: montants(parCategorie.rows),
        salaires_par_type: montants(parTypePaiement.rows),
      },

      devise: 'EUR',
    });
  })
);

module.exports = router;
