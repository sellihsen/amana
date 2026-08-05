/**
 * Cycle de vie de la base PostgreSQL jetable utilisée par les tests.
 *
 * Garde de sécurité : ce module refuse catégoriquement d'agir sur une base dont
 * le nom ne se termine pas par `_test`. Il est impossible de faire tomber une
 * base de développement ou de production par une variable d'environnement mal
 * renseignée.
 *
 * Le schéma de test est produit par les migrations de production : il n'existe
 * pas de seconde définition du schéma pour les tests.
 */

const fs = require('fs');
const path = require('path');
const { Client, Pool } = require('pg');

const BACKEND_ROOT = path.join(__dirname, '..', '..');
const TEST_DB_SUFFIX = '_test';

// Charge .env.test s'il existe, sinon .env, sans jamais écraser une variable
// déjà positionnée par l'environnement (CI).
function loadEnv() {
  const dotenv = require('dotenv');
  const testEnv = path.join(BACKEND_ROOT, '.env.test');
  if (fs.existsSync(testEnv)) dotenv.config({ path: testEnv });
  const baseEnv = path.join(BACKEND_ROOT, '.env');
  if (fs.existsSync(baseEnv)) dotenv.config({ path: baseEnv });
}

/**
 * Nom de la base de test. Toujours suffixé `_test`.
 */
function testDatabaseName() {
  const name = process.env.TEST_DB_NAME || 'amana_test';
  assertTestDatabaseName(name);
  return name;
}

/**
 * Garde non contournable : refuse tout nom de base qui n'est pas explicitement
 * une base de test.
 */
function assertTestDatabaseName(name) {
  if (typeof name !== 'string' || name.trim() === '') {
    throw new Error('Nom de base de test manquant.');
  }
  if (!name.endsWith(TEST_DB_SUFFIX)) {
    throw new Error(
      `Refus d'opérer sur « ${name} » : le nom d'une base de test doit se ` +
        `terminer par « ${TEST_DB_SUFFIX} ».`
    );
  }
  return name;
}

function connectionSettings(database) {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database,
  };
}

/** Connexion à la base de maintenance, pour créer/supprimer la base de test. */
function maintenanceSettings() {
  return connectionSettings(process.env.MAINTENANCE_DB_NAME || 'postgres');
}

function testSettings() {
  return connectionSettings(testDatabaseName());
}

async function withMaintenanceClient(fn) {
  const client = new Client(maintenanceSettings());
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** Identifiant SQL correctement échappé (noms issus du catalogue PostgreSQL). */
function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

/** Ferme les sessions restantes puis (re)crée une base de test vierge. */
async function createTestDatabase() {
  const name = testDatabaseName();
  await withMaintenanceClient(async (client) => {
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
        WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [name]
    );
    await client.query(`DROP DATABASE IF EXISTS ${quoteIdent(name)}`);
    await client.query(`CREATE DATABASE ${quoteIdent(name)}`);
  });
  return name;
}

/**
 * Base jetable supplémentaire, isolée de la base de test principale.
 * Utilisée par les tests de migrations qui ont besoin d'un schéma vierge.
 * Le nom reste suffixé `_test` : la même garde s'applique.
 */
let scratchCounter = 0;
async function createScratchDatabase(label = 'scratch') {
  const safeLabel = String(label).replace(/[^a-z0-9]/gi, '').toLowerCase() || 'scratch';
  const name = `amana_${safeLabel}_${process.pid}_${++scratchCounter}_test`;
  assertTestDatabaseName(name);
  await withMaintenanceClient(async (client) => {
    await client.query(`DROP DATABASE IF EXISTS ${quoteIdent(name)}`);
    await client.query(`CREATE DATABASE ${quoteIdent(name)}`);
  });
  return name;
}

async function dropDatabaseByName(name) {
  assertTestDatabaseName(name);
  await withMaintenanceClient(async (client) => {
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
        WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [name]
    );
    await client.query(`DROP DATABASE IF EXISTS ${quoteIdent(name)}`);
  });
}

async function dropTestDatabase() {
  const name = testDatabaseName();
  await withMaintenanceClient(async (client) => {
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
        WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [name]
    );
    await client.query(`DROP DATABASE IF EXISTS ${quoteIdent(name)}`);
  });
}

/** Applique les migrations de production sur la base de test. */
async function migrateTestDatabase() {
  const { runMigrations } = require('../../migrations/run');
  const pool = new Pool(testSettings());
  try {
    return await runMigrations({ pool, silent: true });
  } finally {
    await pool.end();
  }
}

// ─── Instantané / restauration ──────────────────────────────────────────────
// Les migrations insèrent des données de référence (caisses, catégories,
// catalogue d'audit…). Un simple TRUNCATE entre deux tests les détruirait.
// On capture donc l'état juste après migration et on le restaure ensuite : les
// tests repartent d'une base identique à une installation neuve.

async function listTables(db) {
  const { rows } = await db.query(
    `SELECT c.relname AS name
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY c.relname`
  );
  return rows.map((r) => r.name);
}

async function captureBaseline(db) {
  const tables = await listTables(db);
  const baseline = { tables, rows: {} };
  for (const table of tables) {
    const { rows } = await db.query(`SELECT * FROM ${quoteIdent(table)}`);
    baseline.rows[table] = rows;
  }
  return baseline;
}

async function resetSequences(db, tables) {
  const { rows } = await db.query(
    `SELECT c.relname AS table_name, a.attname AS column_name
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_attribute a ON a.attrelid = c.oid
       JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND pg_get_expr(d.adbin, d.adrelid) LIKE 'nextval(%'`
  );
  for (const { table_name, column_name } of rows) {
    if (!tables.includes(table_name)) continue;
    await db.query(
      `SELECT setval(
         pg_get_serial_sequence($1, $2),
         COALESCE((SELECT MAX(${quoteIdent(column_name)}) FROM ${quoteIdent(table_name)}), 0) + 1,
         false)`,
      [table_name, column_name]
    );
  }
}

async function restoreBaseline(db, baseline) {
  const { tables, rows } = baseline;
  if (!tables.length) return;

  const list = tables.map(quoteIdent).join(', ');
  await db.query(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);

  for (const table of tables) {
    const tableRows = rows[table];
    if (!tableRows || tableRows.length === 0) continue;

    const columns = Object.keys(tableRows[0]);
    const columnList = columns.map(quoteIdent).join(', ');
    const values = [];
    const tuples = tableRows.map((row) => {
      const placeholders = columns.map((col) => {
        values.push(row[col]);
        return `$${values.length}`;
      });
      return `(${placeholders.join(', ')})`;
    });

    await db.query(
      `INSERT INTO ${quoteIdent(table)} (${columnList}) VALUES ${tuples.join(', ')}`,
      values
    );
  }

  await resetSequences(db, tables);
}

const BASELINE_FILE = path.join(BACKEND_ROOT, 'tests', '.baseline.json');

async function writeBaselineFile(db) {
  const baseline = await captureBaseline(db);
  fs.writeFileSync(BASELINE_FILE, JSON.stringify(baseline), 'utf8');
  return baseline;
}

function readBaselineFile() {
  if (!fs.existsSync(BASELINE_FILE)) {
    throw new Error(
      "Instantané de base absent : le globalSetup Jest n'a pas été exécuté."
    );
  }
  return JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'), (key, value) => {
    // Les dates ont été sérialisées en ISO ; PostgreSQL les réaccepte telles
    // quelles, aucune reconversion n'est nécessaire.
    return value;
  });
}

function removeBaselineFile() {
  if (fs.existsSync(BASELINE_FILE)) fs.unlinkSync(BASELINE_FILE);
}

module.exports = {
  TEST_DB_SUFFIX,
  loadEnv,
  testDatabaseName,
  assertTestDatabaseName,
  connectionSettings,
  maintenanceSettings,
  testSettings,
  createTestDatabase,
  dropTestDatabase,
  createScratchDatabase,
  dropDatabaseByName,
  migrateTestDatabase,
  captureBaseline,
  restoreBaseline,
  listTables,
  writeBaselineFile,
  readBaselineFile,
  removeBaselineFile,
  quoteIdent,
};
