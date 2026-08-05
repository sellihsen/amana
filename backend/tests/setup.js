/**
 * Exécuté avant chaque fichier d'intégration, avant tout `require` de `src/`.
 *
 * Force la configuration à pointer sur la base jetable et fournit une base
 * remise à l'état « installation neuve » avant chaque test.
 */
const { Pool } = require('pg');
const {
  loadEnv,
  testDatabaseName,
  testSettings,
  restoreBaseline,
  readBaselineFile,
} = require('./helpers/database');

loadEnv();

// La configuration doit être valide et pointer sur la base de test AVANT que
// `src/config/database.js` ne construise son pool.
process.env.NODE_ENV = 'test';
process.env.DB_NAME = testDatabaseName();
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'secret-de-test-suffisamment-long-pour-la-validation';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
process.env.SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'session';

const baseline = readBaselineFile();
const adminPool = new Pool(testSettings());

beforeEach(async () => {
  await restoreBaseline(adminPool, baseline);
});

afterAll(async () => {
  await adminPool.end();
  // Ferme le pool applicatif s'il a été instancié par le test.
  try {
    const { pool } = require('../src/config/database');
    if (pool && !pool.ended) await pool.end();
  } catch (_) {
    /* le test n'a pas touché la base applicative */
  }
});

jest.setTimeout(30000);
