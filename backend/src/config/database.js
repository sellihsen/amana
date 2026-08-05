const { Pool } = require('pg');
const { obtenirConfig } = require('./env');

// La configuration est validée avant toute tentative de connexion : une
// variable absente interrompt le démarrage plutôt que de produire une
// connexion silencieusement erronée.
const { db } = obtenirConfig();

const pool = new Pool({
  host: db.host,
  port: db.port,
  database: db.database,
  user: db.user,
  password: db.password,
});

// Une erreur sur un client inactif ne doit pas abattre le processus sans trace.
pool.on('error', (err) => {
  console.error('❌ Erreur inattendue sur un client PostgreSQL inactif :', err.message);
});

const testConnection = async () => {
  const client = await pool.connect();
  try {
    console.log('✅ Connexion PostgreSQL établie avec succès');
  } finally {
    client.release();
  }
};

module.exports = { pool, testConnection };
