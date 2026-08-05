/**
 * Garde commune aux scripts de seed.
 *
 * Constitution, « Schema authority » : `backend/migrations/` est l'unique
 * source de vérité du schéma. Un seed ne crée ni ne modifie aucun objet ; il
 * refuse de s'exécuter tant que les migrations ne sont pas toutes appliquées.
 *
 * Constitution III : un seed ne fabrique pas d'identifiants. Le mot de passe
 * administrateur doit être fourni explicitement et le seed est interdit en
 * production.
 */

const { listMigrationFiles, MIGRATIONS_DIR } = require('../migrations/run');

/**
 * Vérifie que le schéma est intégralement migré.
 * @throws {Error} si le registre est absent ou incomplet.
 */
async function assertSchemaMigrated(pool) {
  const { rows: registre } = await pool
    .query('SELECT version FROM schema_migrations')
    .catch(() => ({ rows: null }));

  if (registre === null) {
    throw new Error(
      "Le schéma n'est pas initialisé (table schema_migrations absente).\n" +
        '   Exécutez d\'abord : npm run migrate'
    );
  }

  const appliquees = new Set(registre.map((r) => r.version));
  const manquantes = listMigrationFiles(MIGRATIONS_DIR).filter((f) => !appliquees.has(f));

  if (manquantes.length > 0) {
    throw new Error(
      `Migrations non appliquées : ${manquantes.join(', ')}.\n` +
        "   Exécutez d'abord : npm run migrate"
    );
  }
}

/** Un seed ne doit jamais s'exécuter sur un environnement de production. */
function assertSeedAutorise() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      "Seed interdit : NODE_ENV=production. Les jeux de données de " +
        'démonstration ne doivent jamais atteindre un environnement réel.'
    );
  }
}

/**
 * Mot de passe administrateur du seed. Jamais de valeur par défaut : une
 * absence interrompt le script plutôt que de créer un compte devinable.
 */
function motDePasseAdminSeed() {
  const { validerPolitiqueMotDePasse } = require('../src/utils/password');
  const valeur = process.env.SEED_ADMIN_PASSWORD;

  if (!valeur || valeur.trim() === '') {
    throw new Error(
      'SEED_ADMIN_PASSWORD est requis pour créer le compte administrateur de ' +
        'démonstration. Aucun mot de passe par défaut n\'est fourni.\n' +
        '   Exemple : SEED_ADMIN_PASSWORD=\'…\' npm run seed'
    );
  }

  try {
    return validerPolitiqueMotDePasse(valeur, 'SEED_ADMIN_PASSWORD');
  } catch (err) {
    // Le seed est un outil de ligne de commande : il affiche la règle non
    // satisfaite plutôt que le message générique destiné à l'API.
    const detail = err.fieldErrors && err.fieldErrors.SEED_ADMIN_PASSWORD;
    throw new Error(`SEED_ADMIN_PASSWORD invalide. ${detail || err.message}`);
  }
}

function emailAdminSeed() {
  return process.env.SEED_ADMIN_EMAIL || 'admin@mosquee.local';
}

module.exports = {
  assertSchemaMigrated,
  assertSeedAutorise,
  motDePasseAdminSeed,
  emailAdminSeed,
};
