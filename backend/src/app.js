const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const swaggerUi = require('swagger-ui-express');

const { obtenirConfig } = require('./config/env');
const { buildSwaggerSpec } = require('./config/swagger');
const { requestId } = require('./middleware/requestId');
const { authentifier } = require('./middleware/auth');
const { autorisationParDefaut, exigerAdmin } = require('./middleware/authorize');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

// Routes
const authRoutes = require('./routes/auth');
const membresRoutes = require('./routes/membres');
const financesRoutes = require('./routes/finances');
const cotisationsRoutes = require('./routes/cotisations');
const depensesRoutes = require('./routes/depenses');
const donsRoutes = require('./routes/dons');
const dashboardRoutes = require('./routes/dashboard');
const { publicRouter: caissesPublic, adminRouter: caissesAdmin } = require('./routes/caisses');
const personnelRoutes = require('./routes/personnel');
const elevesRoutes = require('./routes/eleves');
const bilansRoutes = require('./routes/bilans');
const optionsRoutes = require('./routes/options');
const adminConfigRoutes = require('./routes/admin/config');
const adminProjetRoutes = require('./routes/admin/projet');
const adminLogsRoutes = require('./routes/admin/logs');
const adminUsersRoutes = require('./routes/admin/users');
const stockRoutes = require('./routes/stock');
const socialRoutes = require('./routes/social');
const ecrituresFinancieresRoutes = require('./routes/ecrituresFinancieres');

/**
 * Construit l'application Express sans ouvrir de port.
 *
 * L'ordre des middlewares porte la garantie de sécurité :
 *   corrélation → en-têtes → origine → cookies → corps borné
 *   → authentification (/api) → autorisation par défaut (/api) → routes
 *   → route inconnue → erreurs.
 *
 * Une route ajoutée sans garde explicite est donc protégée d'office.
 */
function createApp() {
  const config = obtenirConfig();
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // 1. Corrélation, disponible jusque dans le gestionnaire d'erreurs.
  app.use(requestId);

  // 2. En-têtes de sécurité (constitution, « Security baseline »).
  app.use(
    helmet({
      // L'API sert du JSON et, en production, la SPA buildée.
      contentSecurityPolicy: config.estProduction ? undefined : false,
      crossOriginEmbedderPolicy: false,
      referrerPolicy: { policy: 'no-referrer' },
    })
  );

  // 3. Origine autorisée, unique et explicite. La session étant portée par un
  //    cookie, `credentials` est indispensable — et interdit le joker `*`.
  app.use(
    cors({
      origin: (origine, callback) => {
        // Requête même-origine ou outil sans en-tête Origin.
        if (!origine) return callback(null, true);
        if (origine === config.frontendUrl) return callback(null, true);
        // L'origine refusée ne reçoit simplement aucun en-tête CORS.
        return callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    })
  );

  app.use(cookieParser());

  // 4. Corps de requête borné.
  app.use(express.json({ limit: config.limiteCorpsRequete }));
  app.use(express.urlencoded({ extended: true, limit: config.limiteCorpsRequete }));

  // 5. Refus par défaut sur toute l'API : authentification puis autorisation.
  //    Monté AVANT les routeurs, il ne peut pas être contourné par oubli.
  app.use('/api', authentifier);
  app.use('/api', autorisationParDefaut);

  // 6. Documentation OpenAPI : réservée aux administrateurs, et désactivée en
  //    production sauf activation explicite (contrats/rest-api.md).
  if (config.apiDocsActives) {
    app.use(
      '/api-docs',
      authentifier,
      exigerAdmin,
      swaggerUi.serve,
      swaggerUi.setup(buildSwaggerSpec())
    );
  }

  // 7. Routes métier.
  app.use('/api/auth', authRoutes);
  app.use('/api/membres', membresRoutes);
  app.use('/api/finances', financesRoutes);
  app.use('/api/cotisations', cotisationsRoutes);
  app.use('/api/depenses', depensesRoutes);
  app.use('/api/dons', donsRoutes);
  // /api/ecritures-financieres → grand livre : recherche et contre-écritures
  app.use('/api/ecritures-financieres', ecrituresFinancieresRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  // /api/caisses       → liste des caisses actives (tout compte connecté)
  // /api/admin/caisses → CRUD complet (admin uniquement)
  app.use('/api/caisses', caissesPublic);
  app.use('/api/admin/caisses', caissesAdmin);
  app.use('/api/personnel', personnelRoutes);
  app.use('/api/eleves', elevesRoutes);
  app.use('/api/bilans', bilansRoutes);
  app.use('/api/options', optionsRoutes);
  app.use('/api/admin/config', adminConfigRoutes);
  app.use('/api/admin/projet', adminProjetRoutes);
  // /api/admin/audit-events → journal d'audit (contrat courant)
  // /api/admin/logs        → alias déprécié, même implémentation
  app.use('/api/admin/audit-events', adminLogsRoutes);
  app.use('/api/admin/logs', adminLogsRoutes);
  app.use('/api/admin/users', adminUsersRoutes);
  app.use('/api/social', socialRoutes);
  app.use('/api/stock', stockRoutes);

  /**
   * @swagger
   * /api/health:
   *   get:
   *     summary: État de l'API
   *     description: Route publique de supervision ; ne divulgue aucune donnée métier.
   *     tags: [Système]
   *     security: []
   *     responses:
   *       200:
   *         description: L'API répond.
   */
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Amana — API opérationnelle', timestamp: new Date() });
  });

  // 8. Frontend buildé servi par le même processus en production.
  if (config.estProduction) {
    const distDir = path.join(__dirname, '../../frontend/dist');
    app.use(express.static(distDir));
    app.get(/^\/(?!api\/|api-docs\/|api-docs$).*/, (req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  // 9. Route inconnue puis gestion centralisée des erreurs. Toujours en dernier.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
