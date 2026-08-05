const express = require('express');
const router = express.Router();

const { pool } = require('../config/database');
const { ApiError } = require('../utils/errors');
const { formaterMontant } = require('../utils/money');
const {
  resumeGeneral,
  bilanSocial,
  evolutionMensuelle,
  indicateursRhMadrasa,
  operationsRecentes,
  bornesAnnee,
} = require('../queries/finances');
const { asyncHandler } = require('../middleware/errorHandler');

/** Année civile demandée, validée comme entier. Jamais interpolée. */
function anneeDemandee(valeur) {
  if (valeur === undefined || valeur === '') return new Date().getFullYear();
  if (!/^\d{4}$/.test(String(valeur))) {
    throw ApiError.unprocessable('INVALID_PERIOD', "L'année doit être au format AAAA.");
  }
  const annee = Number.parseInt(valeur, 10);
  if (annee < 1970 || annee > 2999) {
    throw ApiError.unprocessable('INVALID_PERIOD', "L'année est hors des bornes acceptées.");
  }
  return annee;
}

/**
 * @swagger
 * /api/dashboard:
 *   get:
 *     summary: Tableau de bord
 *     description: >
 *       Synthèse calculée en SQL depuis le grand livre. Le périmètre SOCIAL est
 *       présenté séparément et n'entre jamais dans le solde général. Une année
 *       sans opération retourne des zéros exacts et douze mois complets.
 *       Une panne remonte en erreur : elle n'est jamais présentée comme un
 *       tableau de bord à zéro.
 *     tags: [Dashboard]
 *     parameters:
 *       - in: query
 *         name: annee
 *         schema: { type: integer, example: 2026 }
 *     responses:
 *       200:
 *         description: Tableau de bord, montants en chaînes EUR.
 *       401: { description: Session requise }
 *       422: { description: INVALID_PERIOD }
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const annee = anneeDemandee(req.query.annee);
    const { debut, fin } = bornesAnnee(annee);

    const [general, social, evolution, indicateurs, recentes] = await Promise.all([
      resumeGeneral(pool, {}),
      bilanSocial(pool, {}),
      evolutionMensuelle(pool, annee),
      indicateursRhMadrasa(pool, annee),
      operationsRecentes(pool, 10),
    ]);

    const [membres, madrasaDetail, projetConfig, alertesStock, chantier] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE statut = 'actif')::int AS actifs
           FROM membres`
      ),
      pool.query(
        `SELECT COUNT(DISTINCT classe)::int AS nb_classes,
                COALESCE(SUM(montant) FILTER (WHERE statut_paiement = 'en attente'), 0)::TEXT
                  AS total_en_attente,
                COUNT(*) FILTER (WHERE statut_paiement = 'en attente')::int AS nb_en_attente
           FROM cotisations_madrasa cm
           LEFT JOIN eleves e ON e.id = cm.eleve_id`
      ),
      pool.query('SELECT * FROM projet_config WHERE id = 1'),
      pool.query(
        `SELECT id, nom, quantite_actuelle, quantite_minimale_alerte, unite
           FROM produits_stock
          WHERE quantite_actuelle <= quantite_minimale_alerte
          ORDER BY (quantite_actuelle - quantite_minimale_alerte) ASC, nom
          LIMIT 20`
      ),
      pool.query(
        `SELECT COALESCE(SUM(e.montant * CASE e.sens WHEN 'CREDIT' THEN 1 ELSE -1 END), 0)::TEXT
                  AS total_collecte,
                COUNT(DISTINCT d.membre_id)::int AS nb_donateurs
           FROM ecritures_financieres e
           JOIN caisses c ON c.id = e.caisse_id
           LEFT JOIN dons d ON d.ecriture_id = e.id
          WHERE c.affectation = 'Chantier'`
      ),
    ]);

    const projet = projetConfig.rows[0] || {};

    res.json({
      annee,
      periode: { debut, fin },

      general: {
        total_dons: formaterMontant(general.total_dons),
        total_cotisations: formaterMontant(general.total_cotisations),
        total_madrasa: formaterMontant(general.total_madrasa),
        total_entrees: formaterMontant(general.total_entrees),
        total_depenses_directes: formaterMontant(general.total_depenses_directes),
        total_salaires: formaterMontant(general.total_salaires),
        total_depenses: formaterMontant(general.total_depenses),
        solde: formaterMontant(general.solde),
      },

      social: {
        total_collecte: formaterMontant(social.total_collecte),
        total_distribue: formaterMontant(social.total_distribue),
        reste_disponible: formaterMontant(social.reste_disponible),
        caisses: social.caisses.map((c) => ({
          ...c,
          total_collecte: formaterMontant(c.total_collecte),
          total_distribue: formaterMontant(c.total_distribue),
          reste_disponible: formaterMontant(c.reste_disponible),
        })),
      },

      evolution_mensuelle: evolution.map((m) => ({
        mois: Number(m.mois),
        entrees: formaterMontant(m.entrees),
        sorties: formaterMontant(m.sorties),
        solde: formaterMontant(m.solde),
      })),

      rh: {
        effectif_actif: indicateurs.effectif_actif,
        total_salaires_verses: formaterMontant(indicateurs.total_salaires_verses),
      },

      madrasa: {
        eleves_actifs: indicateurs.eleves_actifs,
        nb_classes: madrasaDetail.rows[0].nb_classes,
        total_ecolages: formaterMontant(indicateurs.total_ecolages),
        total_en_attente: formaterMontant(madrasaDetail.rows[0].total_en_attente),
        nb_en_attente: madrasaDetail.rows[0].nb_en_attente,
      },

      operations_recentes: recentes.map((o) => ({
        ...o,
        montant: formaterMontant(o.montant),
        devise: 'EUR',
      })),

      membres: {
        total: membres.rows[0].total,
        actifs: membres.rows[0].actifs,
      },

      alertes_stock: alertesStock.rows,

      projet: {
        budget_previsionnel: formaterMontant(projet.budget_previsionnel),
        capacite_totale: projet.capacite_totale ?? null,
        capacite_salle_priere: projet.capacite_salle_priere ?? null,
        capacite_etages: projet.capacite_etages ?? null,
        total_collecte: formaterMontant(chantier.rows[0].total_collecte),
        nb_donateurs: chantier.rows[0].nb_donateurs,
      },

      devise: 'EUR',
    });
  })
);

module.exports = router;
