const express = require('express');
const router = express.Router();

const { formaterMontant } = require('../utils/money');
const { resumeGeneral } = require('../queries/finances');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * @swagger
 * /api/finances/resume:
 *   get:
 *     summary: Résumé financier général
 *     description: >
 *       Totaux calculés en SQL depuis le grand livre, contre-écritures
 *       déduites. Le périmètre SOCIAL est exclu : il possède son propre bilan
 *       (GET /api/social/bilan). Une période vide retourne des zéros exacts.
 *     tags: [Finances]
 *     responses:
 *       200:
 *         description: Résumé, montants en chaînes EUR.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total_dons:              { type: string, example: '1000.00' }
 *                 total_cotisations:       { type: string, example: '120.00' }
 *                 total_madrasa:           { type: string, example: '50.00' }
 *                 total_entrees:           { type: string, example: '1170.00' }
 *                 total_depenses_directes: { type: string, example: '200.00' }
 *                 total_salaires:          { type: string, example: '800.00' }
 *                 total_depenses:          { type: string, example: '1000.00' }
 *                 solde:                   { type: string, example: '170.00' }
 *                 devise:                  { type: string, example: 'EUR' }
 *       401: { description: Session requise }
 */
router.get(
  '/resume',
  asyncHandler(async (req, res) => {
    const resume = await resumeGeneral();

    // Aucun calcul ici : PostgreSQL a produit les totaux, on ne fait
    // qu'imposer l'échelle d'affichage.
    res.json({
      total_dons: formaterMontant(resume.total_dons),
      total_cotisations: formaterMontant(resume.total_cotisations),
      total_madrasa: formaterMontant(resume.total_madrasa),
      total_entrees: formaterMontant(resume.total_entrees),
      total_depenses_directes: formaterMontant(resume.total_depenses_directes),
      total_salaires: formaterMontant(resume.total_salaires),
      total_depenses: formaterMontant(resume.total_depenses),
      solde: formaterMontant(resume.solde),
      devise: 'EUR',
    });
  })
);

module.exports = router;
