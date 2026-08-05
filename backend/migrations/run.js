/**
 * Runner de migrations — autorité unique du schéma.
 *
 * Garanties (constitution, « Schema authority ») :
 *  - forward-only : un fichier appliqué n'est jamais rejoué;
 *  - transactionnel : une migration réussit entièrement ou pas du tout;
 *  - suivi : `schema_migrations` enregistre version, checksum et durée;
 *  - verrouillé : un advisory lock sérialise deux exécutions concurrentes;
 *  - vérifié : un fichier déjà appliqué dont le contenu change est refusé.
 *
 * Les migrations historiques 001–011 sont *baselinées* (enregistrées sans être
 * rejouées) lorsque les objets qu'elles créent sont déjà présents : une base
 * existante est adoptée sans être réécrite.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MIGRATIONS_DIR = __dirname;

// Clé arbitraire mais stable : toutes les instances utilisent le même verrou.
const ADVISORY_LOCK_KEY = 4198253001;

/** Empreinte du contenu appliqué. */
function checksumOf(sql) {
  return crypto.createHash('sha256').update(sql, 'utf8').digest('hex');
}

function listMigrationFiles(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

/**
 * Objets attendus par chaque migration historique. Une version n'est baselinée
 * que si TOUS ses objets sont déjà présents ; sinon elle est appliquée.
 */
const BASELINE_PROBES = {
  '001_init.sql': {
    tables: ['utilisateurs', 'membres', 'dons', 'cotisations', 'depenses'],
  },
  '002_caisses.sql': {
    tables: ['caisses'],
    columns: [['dons', 'caisse_id']],
  },
  '003_rh.sql': {
    tables: ['personnel', 'paiements_salaires'],
  },
  '004_madrasa.sql': {
    tables: ['eleves', 'cotisations_madrasa'],
  },
  '005_config.sql': {
    tables: ['categories_depenses', 'classes_madrasa', 'types_paiement_rh'],
  },
  '006_stock.sql': {
    tables: ['produits_stock'],
  },
  '007_projet.sql': {
    tables: ['projet_config'],
    columns: [['caisses', 'affectation']],
  },
  '008_social.sql': {
    tables: ['familles_necessiteuses', 'distributions_sociales'],
  },
  '009_logs.sql': {
    tables: ['logs_activite'],
  },
  '010_paiements_cree_par.sql': {
    columns: [['paiements_salaires', 'cree_par']],
  },
  '011_add_numero_facture_to_depenses.sql': {
    columns: [['depenses', 'numero_facture']],
  },
};

async function tableExists(client, table) {
  const { rows } = await client.query('SELECT to_regclass($1) AS oid', [`public.${table}`]);
  return rows[0].oid !== null;
}

async function columnExists(client, table, column) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column]
  );
  return rows.length > 0;
}

async function probeSatisfied(client, probe) {
  if (!probe) return false;
  for (const table of probe.tables || []) {
    if (!(await tableExists(client, table))) return false;
  }
  for (const [table, column] of probe.columns || []) {
    if (!(await columnExists(client, table, column))) return false;
  }
  return true;
}

async function ensureRegistry(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version      TEXT PRIMARY KEY,
      checksum     TEXT NOT NULL,
      applied_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      execution_ms INTEGER NOT NULL DEFAULT 0 CHECK (execution_ms >= 0)
    )
  `);
}

/**
 * Applique les migrations en attente.
 *
 * @param {object}  options
 * @param {import('pg').Pool} options.pool  Pool cible (obligatoire).
 * @param {string} [options.dir]            Répertoire des migrations.
 * @param {boolean}[options.silent]         Supprime la sortie console.
 * @returns {Promise<{applied: string[], skipped: string[], baselined: string[]}>}
 */
async function runMigrations({ pool, dir = MIGRATIONS_DIR, silent = false } = {}) {
  if (!pool) throw new Error('runMigrations requiert un pool PostgreSQL.');

  const log = silent ? () => {} : (...args) => console.log(...args);
  const files = listMigrationFiles(dir);
  const useBaseline = path.resolve(dir) === path.resolve(MIGRATIONS_DIR);

  const client = await pool.connect();
  let lockHeld = false;

  const result = { applied: [], skipped: [], baselined: [] };

  try {
    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY]);
    lockHeld = true;

    await ensureRegistry(client);

    const { rows: dejaAppliquees } = await client.query(
      'SELECT version, checksum FROM schema_migrations'
    );
    const registre = new Map(dejaAppliquees.map((r) => [r.version, r.checksum]));

    // 1. Vérification d'intégrité : aucun fichier appliqué n'a été modifié.
    for (const file of files) {
      if (!registre.has(file)) continue;
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      const attendu = registre.get(file);
      const obtenu = checksumOf(sql);
      if (attendu !== obtenu) {
        throw new Error(
          `Checksum divergent pour « ${file} » : la migration a été modifiée ` +
            `après application (attendu ${attendu}, obtenu ${obtenu}). ` +
            `Les migrations sont forward-only : créez une nouvelle version.`
        );
      }
    }

    const enAttente = files.filter((f) => !registre.has(f));
    if (enAttente.length === 0) {
      result.skipped = files.slice();
      log('✅ Schéma déjà à jour.');
      return result;
    }

    log(`📦 ${enAttente.length} migration(s) en attente…`);

    for (const file of files) {
      if (registre.has(file)) {
        result.skipped.push(file);
        continue;
      }

      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      const checksum = checksumOf(sql);

      // 2. Adoption d'une base existante : les objets sont déjà là.
      if (useBaseline && (await probeSatisfied(client, BASELINE_PROBES[file]))) {
        await client.query(
          `INSERT INTO schema_migrations (version, checksum, execution_ms)
           VALUES ($1, $2, 0) ON CONFLICT (version) DO NOTHING`,
          [file, checksum]
        );
        result.baselined.push(file);
        log(`  ≡ ${file} (déjà présente, enregistrée sans rejeu)`);
        continue;
      }

      // 3. Application transactionnelle.
      const debut = Date.now();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          `INSERT INTO schema_migrations (version, checksum, execution_ms)
           VALUES ($1, $2, $3)`,
          [file, checksum, Date.now() - debut]
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw new Error(`Migration « ${file} » échouée : ${err.message}`);
      }

      result.applied.push(file);
      log(`  → ${file} (${Date.now() - debut} ms)`);
    }

    log('✅ Migrations terminées.');
    return result;
  } finally {
    if (lockHeld) {
      await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]).catch(() => {});
    }
    client.release();
  }
}

module.exports = {
  runMigrations,
  checksumOf,
  listMigrationFiles,
  MIGRATIONS_DIR,
  ADVISORY_LOCK_KEY,
  BASELINE_PROBES,
};

// ─── Exécution en ligne de commande ─────────────────────────────────────────
if (require.main === module) {
  require('dotenv').config();
  const { pool } = require('../src/config/database');

  runMigrations({ pool })
    .then(async () => {
      await pool.end();
    })
    .catch(async (err) => {
      console.error('❌ Erreur lors des migrations :', err.message);
      await pool.end().catch(() => {});
      process.exit(1);
    });
}
