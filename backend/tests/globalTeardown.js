/**
 * Exécuté une fois après la suite d'intégration : supprime la base jetable.
 * `KEEP_TEST_DB=1` la conserve pour inspection manuelle après un échec.
 */
const { loadEnv, dropTestDatabase, removeBaselineFile } = require('./helpers/database');

module.exports = async () => {
  loadEnv();
  removeBaselineFile();
  if (process.env.KEEP_TEST_DB === '1') return;
  await dropTestDatabase();
};
