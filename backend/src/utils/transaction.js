/**
 * Exécution transactionnelle sur une connexion unique.
 *
 * Constitution I : « Any operation that writes money, or whose correctness
 * spans more than one statement, MUST execute inside a single transaction on a
 * single connection. Sequential independent pool.query calls are not an
 * acceptable substitute. »
 *
 * C'est le seul point du code qui émet BEGIN / COMMIT / ROLLBACK.
 */

const { pool: poolParDefaut } = require('../config/database');

/**
 * @template T
 * @param {(client: import('pg').PoolClient) => Promise<T>} fn
 *        Corps de la transaction. Reçoit le client : toute requête de
 *        l'opération doit passer par lui, sans quoi elle sortirait de la
 *        transaction.
 * @param {object} [options]
 * @param {import('pg').Pool} [options.pool]  Pool alternatif (tests).
 * @returns {Promise<T>} la valeur retournée par `fn`, après COMMIT.
 */
async function withTransaction(fn, { pool = poolParDefaut } = {}) {
  if (typeof fn !== 'function') {
    throw new Error('withTransaction attend une fonction.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultat = await fn(client);
    await client.query('COMMIT');
    return resultat;
  } catch (err) {
    // Le ROLLBACK ne doit jamais masquer l'erreur d'origine.
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Verrouille une ligne de `caisses` pour la durée de la transaction.
 * Sérialise dons, distributions et contre-écritures d'une même caisse.
 *
 * @returns {Promise<object|null>} la caisse verrouillée, ou null si absente.
 */
async function verrouillerCaisse(client, caisseId) {
  const { rows } = await client.query(
    'SELECT * FROM caisses WHERE id = $1 FOR UPDATE',
    [caisseId]
  );
  return rows[0] || null;
}

module.exports = { withTransaction, verrouillerCaisse };
