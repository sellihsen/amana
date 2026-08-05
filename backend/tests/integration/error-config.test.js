/**
 * T011 — Configuration obligatoire au démarrage, identifiant de corrélation et
 * erreurs API opaques.
 *
 * Constitution III : une configuration requise absente doit interrompre le
 * démarrage ; une réponse d'erreur ne révèle jamais le détail interne.
 */
const request = require('supertest');
const { createApp } = require('../../src/app');
const { chargerConfig, VARIABLES_REQUISES } = require('../../src/config/env');

const app = createApp();

describe('validation de la configuration au démarrage', () => {
  const base = {
    DB_HOST: 'localhost',
    DB_PORT: '5432',
    DB_NAME: 'mosquee_test',
    DB_USER: 'postgres',
    DB_PASSWORD: 'postgres',
    JWT_SECRET: 'une-cle-de-test-suffisamment-longue-pour-passer',
    JWT_EXPIRES_IN: '8h',
    FRONTEND_URL: 'http://localhost:5173',
  };

  it('accepte une configuration complète', () => {
    expect(() => chargerConfig(base)).not.toThrow();
  });

  it.each(Object.keys(base).filter((k) => VARIABLES_REQUISES.includes(k)))(
    'interrompt le démarrage si %s est absente',
    (variable) => {
      const env = { ...base };
      delete env[variable];
      expect(() => chargerConfig(env)).toThrow(new RegExp(variable));
    }
  );

  it.each(VARIABLES_REQUISES)('interrompt le démarrage si %s est vide', (variable) => {
    expect(() => chargerConfig({ ...base, [variable]: '' })).toThrow(new RegExp(variable));
  });

  it('refuse un JWT_SECRET trop court plutôt que de le compléter', () => {
    expect(() => chargerConfig({ ...base, JWT_SECRET: 'court' })).toThrow(/JWT_SECRET/);
  });

  it('ne fournit aucune valeur de repli pour un secret', () => {
    const env = { ...base };
    delete env.JWT_SECRET;
    expect(() => chargerConfig(env)).toThrow();
  });

  it('signale toutes les variables manquantes en une seule fois', () => {
    try {
      chargerConfig({});
      throw new Error('aurait dû échouer');
    } catch (err) {
      for (const variable of VARIABLES_REQUISES) {
        expect(err.message).toContain(variable);
      }
    }
  });

  it('documente chaque variable requise dans .env.example', () => {
    const fs = require('fs');
    const path = require('path');
    const exemple = fs.readFileSync(
      path.join(__dirname, '..', '..', '.env.example'),
      'utf8'
    );
    for (const variable of VARIABLES_REQUISES) {
      expect(exemple).toMatch(new RegExp(`^${variable}=`, 'm'));
    }
  });

  it('ne contient aucun secret réel dans .env.example', () => {
    const fs = require('fs');
    const path = require('path');
    const exemple = fs.readFileSync(
      path.join(__dirname, '..', '..', '.env.example'),
      'utf8'
    );
    // Toute valeur de JWT_SECRET fournie doit être un marqueur, pas une clé.
    const ligne = exemple.split('\n').find((l) => l.startsWith('JWT_SECRET='));
    expect(ligne).toBeDefined();
    expect(ligne.replace('JWT_SECRET=', '')).toMatch(/^$|remplacez|changez|votre|<.*>/i);
  });
});

describe('identifiant de corrélation', () => {
  it('renvoie un X-Request-Id sur une réponse nominale', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it('renvoie un identifiant différent à chaque requête', async () => {
    const a = await request(app).get('/api/health');
    const b = await request(app).get('/api/health');
    expect(a.headers['x-request-id']).not.toBe(b.headers['x-request-id']);
  });

  it('reprend le X-Request-Id fourni par le client s’il est un UUID', async () => {
    const id = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
    const res = await request(app).get('/api/health').set('X-Request-Id', id);
    expect(res.headers['x-request-id']).toBe(id);
  });

  it('ignore un X-Request-Id client mal formé', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('X-Request-Id', '<script>alert(1)</script>');
    expect(res.headers['x-request-id']).not.toContain('script');
  });
});

describe('forme des erreurs', () => {
  it('ne divulgue pas la carte des routes à un anonyme : 401 avant 404', async () => {
    // Refus par défaut : sans session, une route inconnue est indiscernable
    // d'une route existante. Répondre 404 ici révélerait la surface de l'API.
    const res = await request(app).get('/api/route-qui-nexiste-pas');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      code: 'AUTHENTICATION_REQUIRED',
      message: expect.any(String),
      request_id: expect.any(String),
    });
    expect(res.body.request_id).toBe(res.headers['x-request-id']);
  });

  it('retourne code, message et request_id sur une route inconnue authentifiée', async () => {
    const { sessionPour } = require('../helpers/auth');
    const { agent } = await sessionPour(app, 'admin');

    const res = await agent.get('/api/route-qui-nexiste-pas');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
      message: expect.any(String),
      request_id: expect.any(String),
    });
    expect(res.body.request_id).toBe(res.headers['x-request-id']);
  });

  it('retourne VALIDATION_ERROR avec field_errors sur un corps invalide', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'pas-un-email' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.field_errors).toBeDefined();
  });

  it('ne divulgue jamais le détail interne d’une erreur serveur', async () => {
    // Une erreur base est provoquée en interrogeant une ressource avec un id
    // syntaxiquement inacceptable ; quelle que soit la cause, la réponse reste
    // opaque.
    const res = await request(app).get('/api/membres/999999999999999999999999');
    const serialise = JSON.stringify(res.body);

    expect(serialise).not.toMatch(/pg_|pgsql|relation |column |constraint/i);
    expect(serialise).not.toMatch(/at Object\.|at Module\.|node_modules/);
    expect(res.body).not.toHaveProperty('stack');
    expect(res.body).not.toHaveProperty('detail');
    expect(res.body).not.toHaveProperty('sql');
  });

  it('ne renvoie jamais de JSON de pile Express par défaut', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');
    expect([400, 401]).toContain(res.status);
    expect(JSON.stringify(res.body)).not.toMatch(/SyntaxError|JSON at position|body-parser/i);
  });
});
