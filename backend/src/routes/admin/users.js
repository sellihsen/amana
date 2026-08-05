const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { body, param } = require('express-validator');

const { pool } = require('../../config/database');
const { obtenirConfig } = require('../../config/env');
const { ApiError } = require('../../utils/errors');
const { withTransaction } = require('../../utils/transaction');
const { auditerRequete, EVENEMENTS, RESULTATS } = require('../../utils/audit');
const { validerPolitiqueMotDePasse, DESCRIPTION_POLITIQUE } = require('../../utils/password');
const { ROLES } = require('../../middleware/authorize');
const { asyncHandler, throwSiValidationEchoue } = require('../../middleware/errorHandler');

// L'accès administrateur est déjà imposé par le refus par défaut de `app.js`.
// Aucune garde locale n'est nécessaire : une seule autorité décide.

const CHAMPS_PUBLICS = 'id, nom, email, role, statut, auth_version, desactive_at, created_at, updated_at';

/** Projection sans secret : le hash ne quitte jamais la base. */
function projeter(utilisateur) {
  if (!utilisateur) return null;
  const { mot_de_passe_hash, ...reste } = utilisateur;
  return reste;
}

/** Nombre d'administrateurs actifs, verrouillés pour la durée de la transaction. */
async function compterAdminsActifs(client, exclureId = null) {
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS n FROM utilisateurs
      WHERE role = 'admin' AND statut = 'actif' AND ($1::int IS NULL OR id <> $1)`,
    [exclureId]
  );
  return rows[0].n;
}

/**
 * Verrouille la table des comptes le temps de décider du « dernier admin ».
 * Sans ce verrou, deux rétrogradations concurrentes pourraient chacune
 * constater qu'un autre administrateur existe encore.
 */
async function verrouillerComptes(client) {
  await client.query('LOCK TABLE utilisateurs IN SHARE ROW EXCLUSIVE MODE');
}

async function chargerUtilisateur(client, id) {
  const { rows } = await client.query('SELECT * FROM utilisateurs WHERE id = $1 FOR UPDATE', [id]);
  return rows[0] || null;
}

const validateurId = [param('id').isInt({ min: 1 }).withMessage('Identifiant invalide.')];

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     summary: Liste des comptes
 *     tags: [Administration]
 *     responses:
 *       200:
 *         description: Comptes, sans aucun secret.
 *       401: { description: Session requise }
 *       403: { description: Réservé au rôle admin }
 */
router.get(
  '/',
  asyncHandler(async (req, res, next) => {
    // Une panne remonte en 500 : elle n'est jamais transformée en liste vide.
    const { rows } = await pool.query(
      `SELECT ${CHAMPS_PUBLICS} FROM utilisateurs ORDER BY created_at ASC, id ASC`
    );
    res.json(rows);
  })
);

/**
 * @swagger
 * /api/admin/users:
 *   post:
 *     summary: Créer un compte
 *     description: >
 *       Le rôle est choisi dans une liste fermée (`admin`, `tresorier`,
 *       `lecteur`). La politique de mot de passe est appliquée côté serveur.
 *     tags: [Administration]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nom, email, mot_de_passe, role]
 *             properties:
 *               nom:          { type: string, minLength: 1, maxLength: 100 }
 *               email:        { type: string, format: email }
 *               mot_de_passe: { type: string, format: password }
 *               role:         { type: string, enum: [admin, tresorier, lecteur] }
 *     responses:
 *       201: { description: Compte créé }
 *       400: { description: VALIDATION_ERROR }
 *       409: { description: Adresse déjà utilisée (DUPLICATE_OPERATION) }
 */
router.post(
  '/',
  [
    body('nom').isString().bail().trim().isLength({ min: 1, max: 100 })
      .withMessage('Le nom est requis (1 à 100 caractères).'),
    body('email').isString().bail().trim().isEmail()
      .withMessage('Une adresse électronique valide est requise.'),
    body('role').optional().isIn(ROLES)
      .withMessage(`Le rôle doit être l'un de : ${ROLES.join(', ')}.`),
  ],
  asyncHandler(async (req, res, next) => {
    throwSiValidationEchoue(req);

    const { nom, email, mot_de_passe, role = 'lecteur' } = req.body;

    // Le rôle vient d'une liste fermée, jamais directement du client.
    if (!ROLES.includes(role)) {
      throw ApiError.validation({ role: `Le rôle doit être l'un de : ${ROLES.join(', ')}.` });
    }
    validerPolitiqueMotDePasse(mot_de_passe, 'mot_de_passe');

    const hash = await bcrypt.hash(mot_de_passe, obtenirConfig().bcryptRounds);

    const cree = await withTransaction(async (client) => {
      const { rows: existants } = await client.query(
        'SELECT id FROM utilisateurs WHERE LOWER(email) = LOWER($1)',
        [String(email).trim()]
      );
      if (existants.length > 0) {
        throw ApiError.conflict('DUPLICATE_OPERATION', 'Cette adresse est déjà utilisée.');
      }

      const { rows } = await client.query(
        `INSERT INTO utilisateurs (nom, email, mot_de_passe_hash, role, statut)
         VALUES ($1, $2, $3, $4, 'actif')
         RETURNING ${CHAMPS_PUBLICS}`,
        [String(nom).trim(), String(email).trim(), hash, role]
      );

      await auditerRequete(client, req, {
        typeEvenement: EVENEMENTS.UTILISATEUR_CREE,
        resultat: RESULTATS.SUCCES,
        entiteType: 'utilisateur',
        entiteId: rows[0].id,
        apres: rows[0],
      });

      return rows[0];
    });

    res.status(201).json(projeter(cree));
  })
);

/** Corps commun à PATCH et à son alias PUT. */
async function modifierUtilisateur(req, res) {
  throwSiValidationEchoue(req);

  const id = parseInt(req.params.id, 10);
  const { nom, email, role, statut, mot_de_passe } = req.body;

  if (role !== undefined && !ROLES.includes(role)) {
    throw ApiError.validation({ role: `Le rôle doit être l'un de : ${ROLES.join(', ')}.` });
  }
  if (statut !== undefined && !['actif', 'inactif'].includes(statut)) {
    throw ApiError.validation({ statut: 'Le statut doit être « actif » ou « inactif ».' });
  }
  if (mot_de_passe !== undefined && mot_de_passe !== null && mot_de_passe !== '') {
    validerPolitiqueMotDePasse(mot_de_passe, 'mot_de_passe');
  }

  const aucunChamp =
    nom === undefined && email === undefined && role === undefined &&
    statut === undefined && (mot_de_passe === undefined || mot_de_passe === '');
  if (aucunChamp) {
    throw ApiError.validation({ body: 'Aucun champ à mettre à jour.' });
  }

  const hash =
    mot_de_passe !== undefined && mot_de_passe !== null && mot_de_passe !== ''
      ? await bcrypt.hash(mot_de_passe, obtenirConfig().bcryptRounds)
      : null;

  const modifie = await withTransaction(async (client) => {
    await verrouillerComptes(client);

    const avant = await chargerUtilisateur(client, id);
    if (!avant) throw ApiError.notFound('Utilisateur introuvable.');

    const perdLeRoleAdmin = role !== undefined && avant.role === 'admin' && role !== 'admin';
    const devientInactif = statut === 'inactif' && avant.statut === 'actif';

    // Le dernier administrateur actif ne peut ni être rétrogradé ni désactivé.
    if ((perdLeRoleAdmin || devientInactif) && avant.role === 'admin' && avant.statut === 'actif') {
      const autresAdmins = await compterAdminsActifs(client, id);
      if (autresAdmins === 0) {
        throw ApiError.conflict(
          'HISTORY_EXISTS',
          "Ce compte est le dernier administrateur actif : désignez d'abord un autre administrateur."
        );
      }
    }

    if (email !== undefined) {
      const { rows: collision } = await client.query(
        'SELECT id FROM utilisateurs WHERE LOWER(email) = LOWER($1) AND id <> $2',
        [String(email).trim(), id]
      );
      if (collision.length > 0) {
        throw ApiError.conflict('DUPLICATE_OPERATION', 'Cette adresse est déjà utilisée.');
      }
    }

    // Rôle, mot de passe ou statut modifiés → toutes les sessions du compte
    // sont révoquées par incrément de `auth_version`.
    const revoqueSessions =
      (role !== undefined && role !== avant.role) ||
      hash !== null ||
      (statut !== undefined && statut !== avant.statut);

    const { rows } = await client.query(
      `UPDATE utilisateurs SET
         nom               = COALESCE($2, nom),
         email             = COALESCE($3, email),
         role              = COALESCE($4, role),
         statut            = COALESCE($5, statut),
         mot_de_passe_hash = COALESCE($6, mot_de_passe_hash),
         auth_version      = auth_version + CASE WHEN $7 THEN 1 ELSE 0 END,
         desactive_at      = CASE WHEN $5 = 'inactif' THEN NOW()
                                  WHEN $5 = 'actif'   THEN NULL
                                  ELSE desactive_at END,
         desactive_par     = CASE WHEN $5 = 'inactif' THEN $8::int
                                  WHEN $5 = 'actif'   THEN NULL
                                  ELSE desactive_par END,
         updated_at        = NOW()
       WHERE id = $1
       RETURNING ${CHAMPS_PUBLICS}`,
      [
        id,
        nom === undefined ? null : String(nom).trim(),
        email === undefined ? null : String(email).trim(),
        role === undefined ? null : role,
        statut === undefined ? null : statut,
        hash,
        revoqueSessions,
        req.utilisateur.id,
      ]
    );

    const apres = rows[0];

    await auditerRequete(client, req, {
      typeEvenement: EVENEMENTS.UTILISATEUR_MODIFIE,
      resultat: RESULTATS.SUCCES,
      entiteType: 'utilisateur',
      entiteId: id,
      avant: projeter(avant),
      apres,
    });

    if (role !== undefined && role !== avant.role) {
      await auditerRequete(client, req, {
        typeEvenement: EVENEMENTS.UTILISATEUR_ROLE_CHANGE,
        resultat: RESULTATS.SUCCES,
        entiteType: 'utilisateur',
        entiteId: id,
        avant: { role: avant.role },
        apres: { role: apres.role },
      });
    }

    if (statut !== undefined && statut !== avant.statut) {
      await auditerRequete(client, req, {
        typeEvenement: EVENEMENTS.UTILISATEUR_STATUT_CHANGE,
        resultat: RESULTATS.SUCCES,
        entiteType: 'utilisateur',
        entiteId: id,
        avant: { statut: avant.statut },
        apres: { statut: apres.statut },
      });
    }

    if (hash !== null) {
      await auditerRequete(client, req, {
        typeEvenement: EVENEMENTS.UTILISATEUR_MOT_DE_PASSE_CHANGE,
        resultat: RESULTATS.SUCCES,
        entiteType: 'utilisateur',
        entiteId: id,
      });
    }

    return apres;
  });

  res.json(projeter(modifie));
}

/**
 * @swagger
 * /api/admin/users/{id}:
 *   patch:
 *     summary: Modifier un compte
 *     description: >
 *       Modifie nom, adresse, rôle, statut ou mot de passe. Un changement de
 *       rôle, de statut ou de mot de passe révoque les sessions du compte.
 *       Le dernier administrateur actif ne peut être ni rétrogradé ni désactivé.
 *     tags: [Administration]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200: { description: Compte modifié }
 *       400: { description: VALIDATION_ERROR }
 *       404: { description: RESOURCE_NOT_FOUND }
 *       409: { description: Adresse déjà utilisée ou dernier administrateur }
 *   put:
 *     summary: Alias déprécié de PATCH
 *     deprecated: true
 *     tags: [Administration]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200: { description: Compte modifié }
 */
router.patch('/:id(\\d+)', validateurId, asyncHandler(modifierUtilisateur));
router.put('/:id(\\d+)', validateurId, asyncHandler(modifierUtilisateur));

/**
 * @swagger
 * /api/admin/users/{id}:
 *   delete:
 *     summary: Supprimer un compte
 *     description: >
 *       Suppression réservée aux comptes sans historique. Un compte porteur
 *       d'audit ou d'opérations retourne 409 HISTORY_EXISTS et doit être
 *       désactivé. Un administrateur ne peut ni se supprimer lui-même, ni
 *       supprimer le dernier administrateur actif.
 *     tags: [Administration]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200: { description: Compte supprimé }
 *       404: { description: RESOURCE_NOT_FOUND }
 *       409: { description: HISTORY_EXISTS ou dernier administrateur }
 */
router.delete(
  '/:id',
  validateurId,
  asyncHandler(async (req, res, next) => {
    throwSiValidationEchoue(req);
    const id = parseInt(req.params.id, 10);

    if (id === req.utilisateur.id) {
      throw ApiError.conflict(
        'HISTORY_EXISTS',
        'Vous ne pouvez pas supprimer votre propre compte.'
      );
    }

    await withTransaction(async (client) => {
      await verrouillerComptes(client);

      const cible = await chargerUtilisateur(client, id);
      if (!cible) throw ApiError.notFound('Utilisateur introuvable.');

      if (cible.role === 'admin' && cible.statut === 'actif') {
        const autres = await compterAdminsActifs(client, id);
        if (autres === 0) {
          throw ApiError.conflict(
            'HISTORY_EXISTS',
            'Ce compte est le dernier administrateur actif.'
          );
        }
      }

      // Un compte porteur d'historique est désactivé, jamais effacé.
      const { rows: historique } = await client.query(
        `SELECT
           (SELECT COUNT(*) FROM logs_activite       WHERE utilisateur_id = $1)
         + (SELECT COUNT(*) FROM demandes_idempotentes WHERE utilisateur_id = $1)
           AS n`,
        [id]
      );
      if (parseInt(historique[0].n, 10) > 0) {
        throw ApiError.conflict(
          'HISTORY_EXISTS',
          "Ce compte possède un historique : désactivez-le au lieu de le supprimer."
        );
      }

      await auditerRequete(client, req, {
        typeEvenement: EVENEMENTS.UTILISATEUR_SUPPRIME,
        resultat: RESULTATS.SUCCES,
        entiteType: 'utilisateur',
        entiteId: id,
        avant: projeter(cible),
      });

      await client.query('DELETE FROM utilisateurs WHERE id = $1', [id]);
    });

    res.json({ message: 'Utilisateur supprimé.' });
  })
);

module.exports = router;
module.exports.DESCRIPTION_POLITIQUE = DESCRIPTION_POLITIQUE;
