/**
 * T023 [US1] — Socle de sécurité : en-têtes, limitation de débit, taille du
 * corps, liste publique exhaustive, robustesse aux entrées SQL hostiles et
 * refus des identifiants dynamiques.
 */
const fs = require('fs');
const path = require('path');
const request = require('supertest');

const { createApp } = require('../../src/app');
const { pool } = require('../../src/config/database');
const { obtenirConfig } = require('../../src/config/env');
const { creerAdmin, sessionPour, MOT_DE_PASSE_VALIDE } = require('../helpers/auth');

const app = createApp();
const config = obtenirConfig();

describe('en-têtes de sécurité', () => {
  it('émet les en-têtes du socle Helmet', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options'] || res.headers['content-security-policy']).toBeTruthy();
    expect(res.headers['referrer-policy']).toBeTruthy();
  });

  it('ne divulgue pas la technologie serveur', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('liste publique exhaustive', () => {
  const PUBLIQUES = [
    ['post', '/api/auth/login'],
    ['get', '/api/health'],
  ];

  it.each(PUBLIQUES)('%s %s reste accessible sans session', async (methode, chemin) => {
    const res = await request(app)[methode](chemin).send({});
    expect(res.status).not.toBe(401);
  });

  it('accepte le préflight OPTIONS depuis l’origine autorisée', async () => {
    const res = await request(app)
      .options('/api/membres')
      .set('Origin', config.frontendUrl)
      .set('Access-Control-Request-Method', 'POST');
    expect(res.status).toBeLessThan(400);
    expect(res.headers['access-control-allow-origin']).toBe(config.frontendUrl);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('n’autorise pas une origine tierce', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'https://site-malveillant.example');
    expect(res.headers['access-control-allow-origin']).not.toBe(
      'https://site-malveillant.example'
    );
  });

  it('protège toute autre route de l’API', async () => {
    const AUTRES = [
      '/api/membres',
      '/api/dons',
      '/api/depenses',
      '/api/cotisations',
      '/api/personnel',
      '/api/eleves',
      '/api/social/bilan',
      '/api/stock',
      '/api/caisses',
      '/api/options',
      '/api/dashboard',
      '/api/finances/resume',
      '/api/bilans/generate',
      '/api/admin/users',
      '/api/admin/logs',
      '/api/admin/caisses',
      '/api/admin/projet',
      '/api/auth/me',
    ];
    for (const chemin of AUTRES) {
      const res = await request(app).get(chemin);
      expect([401, 404]).toContain(res.status);
      if (res.status === 401) expect(res.body.code).toBe('AUTHENTICATION_REQUIRED');
    }
  });
});

describe('limitation des tentatives de connexion', () => {
  it('finit par répondre 429 à des échecs répétés', async () => {
    const utilisateur = await creerAdmin();
    const agent = request.agent(app);

    let vu429 = false;
    for (let i = 0; i < config.login.maxTentatives + 3; i += 1) {
      const res = await agent
        .post('/api/auth/login')
        .set('X-Forwarded-For', '203.0.113.42')
        .send({ email: utilisateur.email, mot_de_passe: 'MauvaisMotDePasse!1' });
      if (res.status === 429) {
        vu429 = true;
        break;
      }
    }
    expect(vu429).toBe(true);
  });
});

describe('limite de taille du corps', () => {
  it('refuse un corps hors limite sans exposer de détail interne', async () => {
    const enorme = 'x'.repeat(2 * 1024 * 1024);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@b.local', mot_de_passe: enorme });

    expect([400, 413]).toContain(res.status);
    expect(JSON.stringify(res.body)).not.toMatch(/body-parser|entity\.too\.large|PayloadTooLarge/i);
  });
});

describe('entrées SQL hostiles', () => {
  const CHARGES = [
    "' OR '1'='1",
    "'; DROP TABLE utilisateurs; --",
    "1; DELETE FROM membres WHERE 1=1; --",
    "admin'--",
    "\\'; SELECT pg_sleep(5); --",
  ];

  it.each(CHARGES)('ne permet pas de contourner la connexion avec %s', async (charge) => {
    await creerAdmin();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: charge, mot_de_passe: charge });
    expect([400, 401, 429]).toContain(res.status);
  });

  it.each(CHARGES)('ne détruit aucune donnée via un filtre de recherche : %s', async (charge) => {
    const { agent } = await sessionPour(app, 'admin');
    await pool.query("INSERT INTO membres (nom) VALUES ('Temoin')");

    await agent.get('/api/membres').query({ search: charge, statut: charge });

    const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM membres WHERE nom = 'Temoin'");
    expect(rows[0].n).toBe(1);

    const { rows: tables } = await pool.query("SELECT to_regclass('public.utilisateurs') AS t");
    expect(tables[0].t).not.toBeNull();
  });

  it('traite un identifiant non numérique sans erreur interne', async () => {
    const { agent } = await sessionPour(app, 'admin');
    for (const valeur of ['abc', "1 OR 1=1", '../../etc/passwd', '99999999999999999999']) {
      const res = await agent.get(`/api/membres/${encodeURIComponent(valeur)}`);
      expect([400, 404, 422]).toContain(res.status);
      expect(JSON.stringify(res.body)).not.toMatch(/syntax|invalid input|bigint|integer/i);
    }
  });
});

describe('aucun identifiant SQL dynamique', () => {
  const FICHIERS = [];
  const racine = path.join(__dirname, '..', '..', 'src');

  (function parcourir(dir) {
    for (const entree of fs.readdirSync(dir, { withFileTypes: true })) {
      const complet = path.join(dir, entree.name);
      if (entree.isDirectory()) parcourir(complet);
      else if (entree.name.endsWith('.js')) FICHIERS.push(complet);
    }
  })(racine);

  it.each(FICHIERS)('%s n’interpole aucune donnée de requête dans du SQL', (fichier) => {
    const contenu = fs.readFileSync(fichier, 'utf8');

    // Interdit : `${req.…}` ou concaténation de req.* dans un littéral SQL.
    const interpolationRequete = /`[^`]*\$\{\s*req\.(body|params|query|headers)/s;
    expect(contenu).not.toMatch(interpolationRequete);

    // Interdit : ORDER BY / LIMIT construits depuis une variable de requête.
    const triDynamique = /(ORDER\s+BY|LIMIT|OFFSET)\s*\$\{\s*req\./i;
    expect(contenu).not.toMatch(triDynamique);
  });
});

describe('erreurs opaques', () => {
  it('ne révèle pas l’existence d’un compte', async () => {
    const utilisateur = await creerAdmin();
    const connu = await request(app)
      .post('/api/auth/login')
      .send({ email: utilisateur.email, mot_de_passe: 'Faux!MotDePasse1' });
    const inconnu = await request(app)
      .post('/api/auth/login')
      .send({ email: 'inconnu@test.local', mot_de_passe: 'Faux!MotDePasse1' });

    expect(connu.body).toEqual({ ...connu.body, ...inconnu.body, request_id: connu.body.request_id });
  });

  it('ne renvoie jamais de hash de mot de passe', async () => {
    const { agent } = await sessionPour(app, 'admin');
    const res = await agent.get('/api/admin/users');
    expect(JSON.stringify(res.body)).not.toMatch(/\$2[aby]\$/);
    expect(JSON.stringify(res.body)).not.toMatch(/mot_de_passe_hash/);
  });
});

describe('mot de passe', () => {
  it('applique la politique côté serveur, même si le client l’ignore', async () => {
    const { agent } = await sessionPour(app, 'admin');
    const res = await agent
      .post('/api/admin/users')
      .send({ nom: 'Faible', email: 'faible@test.local', mot_de_passe: 'abc', role: 'lecteur' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');

    const { rows } = await pool.query('SELECT * FROM utilisateurs WHERE email = $1', [
      'faible@test.local',
    ]);
    expect(rows).toHaveLength(0);
  });

  it('accepte un mot de passe conforme', async () => {
    const { agent } = await sessionPour(app, 'admin');
    const res = await agent.post('/api/admin/users').send({
      nom: 'Conforme',
      email: 'conforme@test.local',
      mot_de_passe: MOT_DE_PASSE_VALIDE,
      role: 'lecteur',
    });
    expect(res.status).toBe(201);
  });
});

describe('/api-docs', () => {
  it('n’est pas accessible sans session admin', async () => {
    const res = await request(app).get('/api-docs/');
    expect([301, 302, 401, 403, 404]).toContain(res.status);
    if (res.status === 200) throw new Error('/api-docs ne doit pas être public');
  });

  it('est refusé à un lecteur', async () => {
    const { agent } = await sessionPour(app, 'lecteur');
    const res = await agent.get('/api-docs/');
    expect([401, 403, 404]).toContain(res.status);
  });
});

describe('aucune fuite de détail interne depuis les routes', () => {
  const FICHIERS_ROUTES = [];
  const racineRoutes = path.join(__dirname, '..', '..', 'src', 'routes');

  (function parcourir(dir) {
    for (const entree of fs.readdirSync(dir, { withFileTypes: true })) {
      const complet = path.join(dir, entree.name);
      if (entree.isDirectory()) parcourir(complet);
      else if (entree.name.endsWith('.js')) FICHIERS_ROUTES.push(complet);
    }
  })(racineRoutes);

  it.each(FICHIERS_ROUTES)('%s ne renvoie jamais err.message au client', (fichier) => {
    const contenu = fs.readFileSync(fichier, 'utf8');

    // Interdit : rendre le message, le détail ou la pile d'une exception.
    expect(contenu).not.toMatch(/res\s*\.\s*(status\([^)]*\)\s*\.\s*)?json\([^;]*err(or)?\.(message|detail|stack)/s);
    expect(contenu).not.toMatch(/error\s*:\s*err(or)?\.(message|detail|stack)/);
    expect(contenu).not.toMatch(/detail\s*:\s*err(or)?\.(message|detail)/);
  });
});
