require('dotenv').config();

const { createApp } = require('./app');
const { testConnection } = require('./config/database');

const PORT = parseInt(process.env.PORT, 10) || 3001;

/**
 * Interface d'écoute.
 *
 * Par défaut, l'application n'écoute que sur la boucle locale : en production
 * elle est joignable exclusivement à travers le reverse proxy, qui termine TLS
 * et transmet l'adresse réelle du client. Écouter sur 0.0.0.0 exposerait
 * directement le port applicatif, en clair, quel que soit l'état du pare-feu.
 */
const HOST = process.env.HOST || '127.0.0.1';

const app = createApp();

app.listen(PORT, HOST, async () => {
  console.log(`\n🕌 Amana — API démarrée sur http://${HOST}:${PORT}`);
  console.log(`📖 Documentation Swagger : http://localhost:${PORT}/api-docs`);
  await testConnection();
});
