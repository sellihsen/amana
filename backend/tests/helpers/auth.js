/**
 * Fabriques de comptes et sessions pour les tests d'intégration.
 */
const bcrypt = require('bcryptjs');
const request = require('supertest');

const { pool } = require('../../src/config/database');
const { obtenirConfig } = require('../../src/config/env');

/** Mot de passe conforme à la politique serveur, réutilisé par défaut. */
const MOT_DE_PASSE_VALIDE = 'MotDePasseFort!2026';

let compteur = 0;

/**
 * Crée un utilisateur directement en base.
 * @returns {Promise<object>} l'utilisateur, augmenté de `motDePasse` en clair.
 */
async function creerUtilisateur({
  nom,
  email,
  motDePasse = MOT_DE_PASSE_VALIDE,
  role = 'lecteur',
  statut = 'actif',
} = {}) {
  compteur += 1;
  const nomFinal = nom || `Utilisateur ${role} ${compteur}`;
  const emailFinal = email || `${role}.${compteur}.${Date.now()}@test.local`;
  const hash = await bcrypt.hash(motDePasse, obtenirConfig().bcryptRounds);

  const { rows } = await pool.query(
    `INSERT INTO utilisateurs (nom, email, mot_de_passe_hash, role, statut)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, nom, email, role, statut, auth_version, created_at`,
    [nomFinal, emailFinal, hash, role, statut]
  );

  return { ...rows[0], motDePasse };
}

const creerAdmin = (options) => creerUtilisateur({ ...options, role: 'admin' });
const creerTresorier = (options) => creerUtilisateur({ ...options, role: 'tresorier' });
const creerLecteur = (options) => creerUtilisateur({ ...options, role: 'lecteur' });

/**
 * Ouvre une session et retourne un agent Supertest porteur du cookie.
 * @returns {Promise<{agent: import('supertest').SuperAgentTest, utilisateur: object, reponse: object}>}
 */
async function ouvrirSession(app, utilisateur) {
  const agent = request.agent(app);
  const reponse = await agent
    .post('/api/auth/login')
    .send({ email: utilisateur.email, mot_de_passe: utilisateur.motDePasse });
  return { agent, utilisateur, reponse };
}

/**
 * Crée un compte du rôle demandé et ouvre sa session.
 * @returns {Promise<{agent, utilisateur}>}
 */
async function sessionPour(app, role, options = {}) {
  const utilisateur = await creerUtilisateur({ ...options, role });
  const { agent, reponse } = await ouvrirSession(app, utilisateur);
  if (reponse.status !== 200) {
    throw new Error(
      `Connexion impossible pour le rôle ${role} : ${reponse.status} ${JSON.stringify(reponse.body)}`
    );
  }
  return { agent, utilisateur };
}

/** Extrait la valeur brute du cookie de session d'une réponse. */
function cookieDeSession(reponse) {
  const nom = obtenirConfig().session.cookieName;
  const entetes = reponse.headers['set-cookie'] || [];
  return entetes.find((c) => c.startsWith(`${nom}=`)) || null;
}

module.exports = {
  MOT_DE_PASSE_VALIDE,
  creerUtilisateur,
  creerAdmin,
  creerTresorier,
  creerLecteur,
  ouvrirSession,
  sessionPour,
  cookieDeSession,
};
