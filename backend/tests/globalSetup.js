/**
 * Exécuté une fois avant la suite d'intégration : crée la base jetable,
 * applique les migrations de production et mémorise l'état de référence.
 */
const { Pool } = require('pg');
const {
  loadEnv,
  testDatabaseName,
  testSettings,
  createTestDatabase,
  migrateTestDatabase,
  writeBaselineFile,
} = require('./helpers/database');

module.exports = async () => {
  loadEnv();
  const name = testDatabaseName();

  await createTestDatabase();
  await migrateTestDatabase();

  const pool = new Pool(testSettings());
  try {
    await writeBaselineFile(pool);
  } finally {
    await pool.end();
  }

  process.env.DB_NAME = name;
};
