/**
 * Deux projets :
 *  - `unit`        : règles pures, aucune base, exécution parallèle;
 *  - `integration` : API + PostgreSQL réel, exécution séquentielle imposée par
 *                    `--runInBand` (une seule base jetable partagée).
 */
module.exports = {
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
    },
    {
      displayName: 'integration',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/integration/**/*.test.js'],
      globalSetup: '<rootDir>/tests/globalSetup.js',
      globalTeardown: '<rootDir>/tests/globalTeardown.js',
      setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
      maxWorkers: 1,
    },
  ],
  clearMocks: true,
  restoreMocks: true,
  testTimeout: 30000,
};
