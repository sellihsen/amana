/**
 * Journal d'audit — écriture transactionnelle.
 *
 * Constitution II (NON-NÉGOCIABLE) :
 *  - toute mutation d'état écrit une entrée d'audit;
 *  - l'entrée commite dans la MÊME transaction que la mutation décrite;
 *  - une mutation dont l'audit ne peut pas être écrit doit échouer;
 *  - les identifiants d'action viennent d'une énumération partagée unique.
 *
 * `enregistrerAudit` exige donc le client de transaction et ne rattrape jamais
 * son erreur : le « fire-and-forget » est structurellement impossible ici.
 */

const { ApiError } = require('./errors');

/**
 * Catalogue unique des événements. Les valeurs sont stables, non localisées et
 * jamais réutilisées ; elles sont référencées en base par
 * `types_evenement_audit` (migration 012).
 */
const EVENEMENTS = Object.freeze({
  // Authentification et session
  AUTH_CONNEXION_REUSSIE: 'auth.login.succeeded',
  AUTH_CONNEXION_REFUSEE: 'auth.login.failed',
  AUTH_DECONNEXION: 'auth.logout',
  AUTH_SESSION_REFUSEE: 'auth.session.rejected',

  // Comptes utilisateurs
  UTILISATEUR_CREE: 'user.created',
  UTILISATEUR_MODIFIE: 'user.updated',
  UTILISATEUR_SUPPRIME: 'user.deleted',
  UTILISATEUR_ROLE_CHANGE: 'user.role.changed',
  UTILISATEUR_STATUT_CHANGE: 'user.status.changed',
  UTILISATEUR_MOT_DE_PASSE_CHANGE: 'user.password.changed',

  // Membres
  MEMBRE_CREE: 'member.created',
  MEMBRE_MODIFIE: 'member.updated',
  MEMBRE_SUPPRIME: 'member.deleted',

  // Personnel
  PERSONNEL_CREE: 'personnel.created',
  PERSONNEL_MODIFIE: 'personnel.updated',
  PERSONNEL_SUPPRIME: 'personnel.deleted',
  SALAIRE_PAYE: 'salary-payment.posted',

  // Madrasa
  ELEVE_CREE: 'student.created',
  ELEVE_MODIFIE: 'student.updated',
  ELEVE_SUPPRIME: 'student.deleted',
  ECOLAGE_ENREGISTRE: 'tuition.recorded',
  ECOLAGE_MODIFIE: 'tuition.updated',
  ECOLAGE_SUPPRIME: 'tuition.deleted',

  // Flux financiers généraux
  DON_ENREGISTRE: 'don.posted',
  COTISATION_ENREGISTREE: 'membership-fee.recorded',
  COTISATION_MODIFIEE: 'membership-fee.updated',
  COTISATION_SUPPRIMEE: 'membership-fee.deleted',
  DEPENSE_ENREGISTREE: 'expense.posted',
  ECRITURE_CONTREPASSEE: 'financial-entry.reversed',

  // Social
  FAMILLE_CREEE: 'social-family.created',
  FAMILLE_MODIFIEE: 'social-family.updated',
  FAMILLE_SUPPRIMEE: 'social-family.deleted',
  DISTRIBUTION_SOCIALE_ENREGISTREE: 'social-distribution.posted',

  // Stock
  PRODUIT_CREE: 'stock.product.created',
  PRODUIT_MODIFIE: 'stock.product.updated',
  PRODUIT_SUPPRIME: 'stock.product.deleted',
  STOCK_VARIATION: 'stock.changed',

  // Référentiels et administration
  CAISSE_CREEE: 'caisse.created',
  CAISSE_MODIFIEE: 'caisse.updated',
  CAISSE_SUPPRIMEE: 'caisse.deleted',
  REFERENCE_CREEE: 'config.reference.created',
  REFERENCE_MODIFIEE: 'config.reference.updated',
  REFERENCE_SUPPRIMEE: 'config.reference.deleted',
  PROJET_MODIFIE: 'project.updated',

  // Historique
  LEGACY: 'legacy.activity',
});

const RESULTATS = Object.freeze({
  SUCCES: 'SUCCES',
  REFUS: 'REFUS',
  ECHEC: 'ECHEC',
});

const TYPES_ACTEUR = Object.freeze({
  UTILISATEUR: 'UTILISATEUR',
  SYSTEME: 'SYSTEME',
  MIGRATION: 'MIGRATION',
});

/**
 * Clés dont la valeur ne doit jamais atteindre le journal.
 * La comparaison est insensible à la casse et aux séparateurs, afin que
 * `mot_de_passe`, `motDePasse` et `MOT-DE-PASSE` soient traités identiquement.
 */
const CLES_INTERDITES = [
  'motdepasse',
  'motdepassehash',
  'motdepasseconfirmation',
  'password',
  'passwordhash',
  'passwordconfirmation',
  'hash',
  'token',
  'accesstoken',
  'refreshtoken',
  'jwt',
  'secret',
  'jwtsecret',
  'authorization',
  'cookie',
  'setcookie',
  'session',
  'apikey',
  'cle',
  'clesecrete',
];

const MARQUEUR = '[supprimé]';

function normaliserCle(cle) {
  return String(cle).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Retire récursivement toute valeur sensible d'une structure destinée aux
 * colonnes `avant` / `apres`.
 */
function redigerDonneesSensibles(valeur, profondeur = 0) {
  if (valeur === null || valeur === undefined) return valeur;
  if (profondeur > 12) return MARQUEUR;

  if (Array.isArray(valeur)) {
    return valeur.map((v) => redigerDonneesSensibles(v, profondeur + 1));
  }

  if (valeur instanceof Date) return valeur.toISOString();

  if (typeof valeur === 'object') {
    const sortie = {};
    for (const [cle, v] of Object.entries(valeur)) {
      sortie[cle] = CLES_INTERDITES.includes(normaliserCle(cle))
        ? MARQUEUR
        : redigerDonneesSensibles(v, profondeur + 1);
    }
    return sortie;
  }

  return valeur;
}

function jsonbOuNull(valeur) {
  if (valeur === null || valeur === undefined) return null;
  return JSON.stringify(redigerDonneesSensibles(valeur));
}

/**
 * Écrit une entrée d'audit dans la transaction en cours.
 *
 * @param {import('pg').PoolClient} client  Client de la transaction métier.
 * @param {object} evenement
 * @param {string} evenement.typeEvenement  Code du catalogue.
 * @param {string} evenement.resultat       SUCCES | REFUS | ECHEC.
 * @param {object} evenement.acteur         { type, id, nom, role }.
 * @param {string} [evenement.entiteType]
 * @param {string|number} [evenement.entiteId]
 * @param {object} [evenement.avant]
 * @param {object} [evenement.apres]
 * @param {string} [evenement.requestId]
 * @param {string} [evenement.ip]
 * @param {string} [evenement.userAgent]
 * @returns {Promise<object>} la ligne insérée.
 */
async function enregistrerAudit(client, evenement) {
  if (!client || typeof client.query !== 'function') {
    throw new Error(
      "enregistrerAudit exige le client de la transaction métier : l'audit doit " +
        'commiter avec la mutation qu\'il décrit.'
    );
  }

  const {
    typeEvenement,
    resultat = RESULTATS.SUCCES,
    acteur = {},
    entiteType = null,
    entiteId = null,
    avant = null,
    apres = null,
    requestId = null,
    ip = null,
    userAgent = null,
    // Colonne libre héritée, alimentée uniquement par le chemin `legacy.activity`.
    actionHeritee = null,
  } = evenement || {};

  if (!typeEvenement) {
    throw new Error('enregistrerAudit exige un typeEvenement.');
  }

  const acteurType = acteur.type || (acteur.id ? TYPES_ACTEUR.UTILISATEUR : TYPES_ACTEUR.SYSTEME);

  const { rows } = await client.query(
    `INSERT INTO logs_activite
       (utilisateur_id, utilisateur_nom, acteur_type, acteur_role,
        type_evenement, resultat, entite_type, entite_id,
        avant, apres, request_id, ip, user_agent, action)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING *`,
    [
      acteur.id || null,
      acteur.nom || null,
      acteurType,
      acteur.role || null,
      typeEvenement,
      resultat,
      entiteType,
      entiteId === null || entiteId === undefined ? null : String(entiteId),
      jsonbOuNull(avant),
      jsonbOuNull(apres),
      requestId,
      ip,
      userAgent ? String(userAgent).slice(0, 500) : null,
      actionHeritee,
    ]
  );

  return rows[0];
}

/**
 * Construit le descripteur d'acteur à partir d'une requête Express.
 * Un utilisateur absent produit un acteur `SYSTEME`.
 */
function acteurDeRequete(req) {
  const utilisateur = req && req.utilisateur;
  if (!utilisateur) {
    return { type: TYPES_ACTEUR.SYSTEME, id: null, nom: 'Système', role: null };
  }
  return {
    type: TYPES_ACTEUR.UTILISATEUR,
    id: utilisateur.id,
    nom: utilisateur.nom || utilisateur.email || null,
    role: utilisateur.role || null,
  };
}

/** Contexte client (corrélation, IP, agent) extrait d'une requête Express. */
function contexteDeRequete(req) {
  if (!req) return { requestId: null, ip: null, userAgent: null };
  return {
    requestId: req.id || null,
    ip: req.ip || null,
    userAgent: req.get ? req.get('user-agent') || null : null,
  };
}

/**
 * Raccourci : audit d'une mutation issue d'une requête HTTP.
 */
async function auditerRequete(client, req, evenement) {
  return enregistrerAudit(client, {
    ...evenement,
    acteur: evenement.acteur || acteurDeRequete(req),
    ...contexteDeRequete(req),
  });
}

module.exports = {
  EVENEMENTS,
  RESULTATS,
  TYPES_ACTEUR,
  CLES_INTERDITES,
  MARQUEUR,
  redigerDonneesSensibles,
  enregistrerAudit,
  auditerRequete,
  acteurDeRequete,
  contexteDeRequete,
  ApiError,
};
