require('dotenv').config();

const { createApp } = require('./app');
const { testConnection } = require('./config/database');

const PORT = parseInt(process.env.PORT, 10) || 3001;

const app = createApp();

app.listen(PORT, async () => {
  console.log(`\n🕌 Amana — API démarrée sur http://localhost:${PORT}`);
  console.log(`📖 Documentation Swagger : http://localhost:${PORT}/api-docs`);
  await testConnection();
});
