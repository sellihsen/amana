/**
 * T008 — Le runner de migrations est l'autorité unique du schéma.
 *
 * Vérifie : registre suivi, checksum, verrou advisory, reprise après échec,
 * idempotence du runner et idempotence intrinsèque de chaque migration.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Pool } = require('pg');

const {
  connectionSettings,
  createScratchDatabase,
  dropDatabaseByName,
} = require('../helpers/database');

const { runMigrations, checksumOf, MIGRATIONS_DIR } = require('../../migrations/run');

const REAL_MIGRATIONS = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();

/** Base vierge + pool dédié, détruits après le test. */
async function withScratchDb(label, fn) {
  const name = await createScratchDatabase(label);
  const pool = new Pool(connectionSettings(name));
  try {
    return await fn(pool, name);
  } finally {
    await pool.end().catch(() => {});
    await dropDatabaseByName(name);
  }
}

function writeTempMigrations(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
  for (const [name, sql] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), sql, 'utf8');
  }
  return dir;
}

describe('registre de migrations', () => {
  it('crée schema_migrations avec version, checksum, applied_at et execution_ms', async () => {
    await withScratchDb('registre', async (pool) => {
      await runMigrations({ pool, silent: true });

      const { rows } = await pool.query(
        `SELECT column_name, data_type
           FROM information_schema.columns
          WHERE table_name = 'schema_migrations'
          ORDER BY column_name`
      );
      const columns = rows.map((r) => r.column_name);
      expect(columns).toEqual(
        expect.arrayContaining(['version', 'checksum', 'applied_at', 'execution_ms'])
      );

      const { rows: pk } = await pool.query(
        `SELECT a.attname
           FROM pg_index i
           JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
          WHERE i.indrelid = 'schema_migrations'::regclass AND i.indisprimary`
      );
      expect(pk.map((r) => r.attname)).toEqual(['version']);
    });
  });

  it('enregistre toutes les migrations du répertoire, avec leur checksum réel', async () => {
    await withScratchDb('toutes', async (pool) => {
      await runMigrations({ pool, silent: true });

      const { rows } = await pool.query(
        'SELECT version, checksum, execution_ms FROM schema_migrations ORDER BY version'
      );
      expect(rows.map((r) => r.version)).toEqual(REAL_MIGRATIONS);

      for (const row of rows) {
        const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, row.version), 'utf8');
        expect(row.checksum).toBe(checksumOf(sql));
        expect(Number(row.execution_ms)).toBeGreaterThanOrEqual(0);
      }
    });
  });

  it('ne réapplique aucune migration au second passage', async () => {
    await withScratchDb('idempotent', async (pool) => {
      const premier = await runMigrations({ pool, silent: true });
      expect(premier.applied.length).toBe(REAL_MIGRATIONS.length);

      const { rows: avant } = await pool.query(
        'SELECT version, applied_at FROM schema_migrations ORDER BY version'
      );

      const second = await runMigrations({ pool, silent: true });
      expect(second.applied).toEqual([]);
      expect(second.skipped.length).toBe(REAL_MIGRATIONS.length);

      const { rows: apres } = await pool.query(
        'SELECT version, applied_at FROM schema_migrations ORDER BY version'
      );
      expect(apres).toEqual(avant);
    });
  });
});

describe('checksum', () => {
  it('refuse une migration déjà appliquée dont le contenu a changé', async () => {
    await withScratchDb('checksum', async (pool) => {
      const dir = writeTempMigrations({
        '001_a.sql': 'CREATE TABLE IF NOT EXISTS t_a (id INT);',
      });
      await runMigrations({ pool, dir, silent: true });

      fs.writeFileSync(path.join(dir, '001_a.sql'), 'CREATE TABLE IF NOT EXISTS t_b (id INT);');

      await expect(runMigrations({ pool, dir, silent: true })).rejects.toThrow(/checksum/i);

      // La migration falsifiée n'a pas été appliquée.
      const { rows } = await pool.query("SELECT to_regclass('public.t_b') AS t");
      expect(rows[0].t).toBeNull();
    });
  });
});

describe('verrou advisory', () => {
  it('sérialise deux exécutions concurrentes sans doublon ni erreur', async () => {
    await withScratchDb('verrou', async (pool) => {
      const [a, b] = await Promise.all([
        runMigrations({ pool, silent: true }),
        runMigrations({ pool, silent: true }),
      ]);

      // Chaque migration est appliquée exactement une fois, toutes exécutions
      // confondues : le verrou a empêché le recouvrement.
      const total = a.applied.length + b.applied.length;
      expect(total).toBe(REAL_MIGRATIONS.length);

      const { rows } = await pool.query(
        'SELECT version, COUNT(*) AS n FROM schema_migrations GROUP BY version HAVING COUNT(*) > 1'
      );
      expect(rows).toEqual([]);
    });
  });

  it('libère le verrou même lorsque la migration échoue', async () => {
    await withScratchDb('verrou-libere', async (pool) => {
      const dir = writeTempMigrations({ '001_ko.sql': 'CECI NEST PAS DU SQL;' });
      await expect(runMigrations({ pool, dir, silent: true })).rejects.toThrow();

      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS n FROM pg_locks
          WHERE locktype = 'advisory' AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`
      );
      expect(rows[0].n).toBe(0);
    });
  });
});

describe('reprise après échec', () => {
  it('annule la migration fautive et n’enregistre rien', async () => {
    await withScratchDb('reprise', async (pool) => {
      const dir = writeTempMigrations({
        '001_ok.sql': 'CREATE TABLE IF NOT EXISTS t_ok (id INT);',
        '002_ko.sql': 'CREATE TABLE t_partiel (id INT); SELECT 1/0;',
      });

      await expect(runMigrations({ pool, dir, silent: true })).rejects.toThrow();

      const { rows: versions } = await pool.query(
        'SELECT version FROM schema_migrations ORDER BY version'
      );
      expect(versions.map((r) => r.version)).toEqual(['001_ok.sql']);

      // La partie déjà exécutée de la migration fautive a été annulée.
      const { rows: partiel } = await pool.query("SELECT to_regclass('public.t_partiel') AS t");
      expect(partiel[0].t).toBeNull();
    });
  });

  it('reprend là où elle s’est arrêtée une fois la migration corrigée', async () => {
    await withScratchDb('reprise-ok', async (pool) => {
      const dir = writeTempMigrations({
        '001_ok.sql': 'CREATE TABLE IF NOT EXISTS t_ok (id INT);',
        '002_ko.sql': 'SELECT 1/0;',
      });
      await expect(runMigrations({ pool, dir, silent: true })).rejects.toThrow();

      fs.writeFileSync(path.join(dir, '002_ko.sql'), 'CREATE TABLE IF NOT EXISTS t_deux (id INT);');
      const reprise = await runMigrations({ pool, dir, silent: true });

      expect(reprise.applied).toEqual(['002_ko.sql']);
      const { rows } = await pool.query("SELECT to_regclass('public.t_deux') AS t");
      expect(rows[0].t).not.toBeNull();
    });
  });
});

describe('idempotence intrinsèque des migrations', () => {
  it('chaque migration peut être rejouée telle quelle sans erreur', async () => {
    await withScratchDb('rejeu', async (pool) => {
      await runMigrations({ pool, silent: true });

      // Rejeu direct du SQL, hors registre : les migrations doivent converger.
      for (const file of REAL_MIGRATIONS) {
        const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
        await expect(pool.query(sql)).resolves.toBeDefined();
      }
    });
  });
});

describe('baseline des migrations historiques', () => {
  it('enregistre sans les rejouer les versions 001–011 déjà présentes en base', async () => {
    await withScratchDb('baseline', async (pool) => {
      // Simule une base héritée : le schéma historique existe, sans registre.
      const historiques = REAL_MIGRATIONS.filter((f) => /^0(0\d|1[01])_/.test(f));
      for (const file of historiques) {
        await pool.query(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
      }

      const res = await runMigrations({ pool, silent: true });

      const { rows } = await pool.query(
        'SELECT version FROM schema_migrations ORDER BY version'
      );
      expect(rows.map((r) => r.version)).toEqual(REAL_MIGRATIONS);
      // Les historiques sont baselinées, pas rejouées.
      expect(res.baselined).toEqual(expect.arrayContaining(historiques));
    });
  });
});
