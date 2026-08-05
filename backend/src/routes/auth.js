const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');

const { pool } = require('../config/database');
const { obtenirConfig } = require('../config/env');
const { ApiError } = require('../utils/errors');
const { withTransaction } = require('../utils/transaction');
const { enregistrerAudit, EVENEMENTS, RESULTATS, contexteDeRequete } = require('../utils/audit');
const { emettreSession, effacerSession } = require('../middleware/auth');
const { asyncHandler, throwSiValidationEchoue } = require('../middleware/errorHandler');

const config = obtenirConfig();

/**
 * Limitation des tentatives de connexion (constitution, « Security baseline »).
 * Compte par adresse IP ; les tentatives réussies ne sont pas décomptées.
 */
const limiteurConnexion = rateLimit({
  windowMs: config.login.fenetreMs,
  max: config.login.maxTentatives,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (req, res, next) => next(new ApiError('TOO_MANY_REQUESTS')),
});

const validateursLogin = [
  body('email')
    .isString()
    .withMessage('Une adresse électronique valide est requise.')
    .bail()
    .trim()
    .isEmail()
    .withMessage('Une adresse électronique valide est requise.'),
  body('mot_de_passe')
    .isString()
    .withMessage('Le mot de passe est requis.')
    .bail()
    .notEmpty()
    .withMessage('Le mot de passe est requis.'),
];

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Ouvrir une session
 *     description: >
 *       Dépose un cookie de session HttpOnly, SameSite=Strict, valable huit
 *       heures. Aucun jeton n'est retourné dans le corps de la réponse.
 *       Les tentatives sont limitées par adresse IP.
 *     tags: [Authentification]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, mot_de_passe]
 *             properties:
 *               email:        { type: string, format: email }
 *               mot_de_passe: { type: string, format: password }
 *     responses:
 *       200:
 *         description: Session ouverte ; le compte courant est retourné.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:    { type: integer }
 *                     nom:   { type: string }
 *                     email: { type: string }
 *                     role:  { type: string, enum: [admin, tresorier, lecteur] }
 *       400: { description: Corps invalide (VALIDATION_ERROR) }
 *       401: { description: Identifiants incorrects ou compte inactif }
 *       429: { description: Trop de tentatives (TOO_MANY_REQUESTS) }
 */
router.post(
  '/login',
  limiteurConnexion,
  validateursLogin,
  asyncHandler(async (req, res, next) => {
    throwSiValidationEchoue(req);

    const { email, mot_de_passe } = req.body;
    const { rows } = await pool.query(
      `SELECT id, nom, email, role, statut, auth_version, mot_de_passe_hash
         FROM utilisateurs WHERE LOWER(email) = LOWER($1)`,
      [String(email).trim()]
    );
    const utilisateur = rows[0];

    const motDePasseValide =
      utilisateur && (await bcrypt.compare(mot_de_passe, utilisateur.mot_de_passe_hash));
    const compteActif = utilisateur && utilisateur.statut === 'actif';

    if (!motDePasseValide || !compteActif) {
      // Le refus est audité, sans jamais consigner le secret présenté.
      await withTransaction(async (client) => {
        await enregistrerAudit(client, {
          typeEvenement: EVENEMENTS.AUTH_CONNEXION_REFUSEE,
          resultat: RESULTATS.REFUS,
          acteur: utilisateur
            ? {
                type: 'UTILISATEUR',
                id: utilisateur.id,
                nom: utilisateur.nom,
                role: utilisateur.role,
              }
            : { type: 'SYSTEME', nom: 'Anonyme' },
          entiteType: 'utilisateur',
          entiteId: utilisateur ? utilisateur.id : null,
          apres: {
            email_tente: String(email).trim().toLowerCase(),
            motif: !utilisateur
              ? 'compte_inconnu'
              : !motDePasseValide
                ? 'mot_de_passe_invalide'
                : 'compte_inactif',
          },
          ...contexteDeRequete(req),
        });
      });

      // Message identique dans les trois cas : aucune énumération de comptes.
      throw ApiError.authenticationRequired('Identifiants incorrects.');
    }

    await withTransaction(async (client) => {
      await enregistrerAudit(client, {
        typeEvenement: EVENEMENTS.AUTH_CONNEXION_REUSSIE,
        resultat: RESULTATS.SUCCES,
        acteur: {
          type: 'UTILISATEUR',
          id: utilisateur.id,
          nom: utilisateur.nom,
          role: utilisateur.role,
        },
        entiteType: 'utilisateur',
        entiteId: utilisateur.id,
        ...contexteDeRequete(req),
      });
    });

    emettreSession(res, utilisateur);

    res.json({
      user: {
        id: utilisateur.id,
        nom: utilisateur.nom,
        email: utilisateur.email,
        role: utilisateur.role,
      },
    });
  })
);

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Compte et rôle courants
 *     description: >
 *       Relit le compte en base : le rôle retourné est toujours le rôle actuel,
 *       jamais celui capturé à la connexion.
 *     tags: [Authentification]
 *     responses:
 *       200:
 *         description: Compte courant.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:    { type: integer }
 *                 nom:   { type: string }
 *                 email: { type: string }
 *                 role:  { type: string, enum: [admin, tresorier, lecteur] }
 *       401: { description: 'Session absente, expirée, révoquée ou compte inactif' }
 */
router.get(
  '/me',
  asyncHandler(async (req, res, next) => {
    const { id, nom, email, role } = req.utilisateur;
    res.json({ id, nom, email, role });
  })
);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Fermer la session
 *     tags: [Authentification]
 *     responses:
 *       200: { description: Session close ; le cookie est invalidé. }
 *       401: { description: Aucune session à fermer }
 */
router.post(
  '/logout',
  asyncHandler(async (req, res, next) => {
    const utilisateur = req.utilisateur;

    await withTransaction(async (client) => {
      await enregistrerAudit(client, {
        typeEvenement: EVENEMENTS.AUTH_DECONNEXION,
        resultat: RESULTATS.SUCCES,
        acteur: {
          type: 'UTILISATEUR',
          id: utilisateur.id,
          nom: utilisateur.nom,
          role: utilisateur.role,
        },
        entiteType: 'utilisateur',
        entiteId: utilisateur.id,
        ...contexteDeRequete(req),
      });
    });

    effacerSession(res);
    res.json({ message: 'Session fermée.' });
  })
);

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: (Supprimé) Inscription anonyme
 *     description: >
 *       L'inscription anonyme est fermée. Les comptes sont créés exclusivement
 *       par un administrateur via POST /api/admin/users.
 *     tags: [Authentification]
 *     security: []
 *     responses:
 *       410: { description: Route supprimée (REGISTRATION_CLOSED) }
 */
router.all('/register', (req, res, next) => {
  next(
    new ApiError(
      'REGISTRATION_CLOSED',
      "L'inscription anonyme est fermée. Un administrateur crée les comptes."
    )
  );
});

module.exports = router;
