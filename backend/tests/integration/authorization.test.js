/**
 * T022 [US1] — Matrice d'autorisation appliquée côté serveur.
 *
 * | Capacité                            | admin | tresorier | lecteur |
 * |-------------------------------------|-------|-----------|---------|
 * | Lectures métier                     | oui   | oui       | oui     |
 * | Écritures métier                    | oui   | oui       | non     |
 * | Administration, utilisateurs, audit | oui   | non       | non     |
 *
 * Constitution III : « A read-only role MUST NOT be able to create, modify or
 * delete any record. »
 */
const request = require('supertest');
const { createApp } = require('../../src/app');
const { sessionPour } = require('../helpers/auth');

const app = createApp();

/** Lectures métier : accessibles aux trois rôles. */
const LECTURES = [
  '/api/membres',
  '/api/dons',
  '/api/cotisations',
  '/api/depenses',
  '/api/personnel',
  '/api/personnel/actifs',
  '/api/eleves',
  '/api/eleves/actifs',
  '/api/social/familles',
  '/api/social/distributions',
  '/api/social/bilan',
  '/api/stock',
  '/api/stock/alertes',
  '/api/caisses',
  '/api/options',
  '/api/dashboard',
  '/api/finances/resume',
];

/** Écritures métier : admin et trésorier seulement. */
const ECRITURES_METIER = [
  ['post', '/api/membres', { nom: 'Test' }],
  ['put', '/api/membres/1', { nom: 'Test' }],
  ['delete', '/api/membres/1', null],
  ['post', '/api/dons', { montant: '10.00', caisse_id: 1 }],
  ['post', '/api/cotisations', { membre_id: 1, montant: '10.00', annee: 2026 }],
  ['post', '/api/depenses', { libelle: 'Test', montant: '10.00' }],
  ['post', '/api/personnel', { nom: 'Test', role_poste: 'Imam' }],
  ['put', '/api/personnel/1', { nom: 'Test' }],
  ['delete', '/api/personnel/1', null],
  ['post', '/api/eleves', { nom: 'Test' }],
  ['put', '/api/eleves/1', { nom: 'Test' }],
  ['delete', '/api/eleves/1', null],
  ['post', '/api/social/familles', { nom_responsable: 'Test' }],
  ['put', '/api/social/familles/1', { nom_responsable: 'Test' }],
  ['delete', '/api/social/familles/1', null],
  ['post', '/api/social/distributions', { famille_id: 1, caisse_origine_id: 1, montant_verse: '10.00' }],
  ['post', '/api/stock', { nom: 'Test' }],
  ['put', '/api/stock/1', { nom: 'Test' }],
  ['delete', '/api/stock/1', null],
];

/** Administration : admin seulement. */
const ADMINISTRATION = [
  ['get', '/api/admin/users', null],
  ['post', '/api/admin/users', { nom: 'X', email: 'x@test.local', mot_de_passe: 'MotDePasseFort!2026' }],
  ['put', '/api/admin/users/1', { nom: 'X' }],
  ['delete', '/api/admin/users/1', null],
  ['get', '/api/admin/logs', null],
  ['get', '/api/admin/caisses', null],
  ['post', '/api/admin/caisses', { nom: 'X' }],
  ['put', '/api/admin/caisses/1', { nom: 'X' }],
  ['delete', '/api/admin/caisses/1', null],
  ['get', '/api/admin/config/categories_depenses', null],
  ['post', '/api/admin/config/categories_depenses', { nom: 'X' }],
  ['put', '/api/admin/config/categories_depenses/1', { nom: 'X' }],
  ['delete', '/api/admin/config/categories_depenses/1', null],
  ['get', '/api/admin/projet', null],
  ['put', '/api/admin/projet', { budget_previsionnel: '1000.00' }],
];

function envoyer(agent, methode, chemin, corps) {
  const requete = agent[methode](chemin);
  return corps ? requete.send(corps) : requete;
}

describe('sans session', () => {
  it.each(LECTURES)('refuse la lecture %s avec 401', async (chemin) => {
    const res = await request(app).get(chemin);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it.each(ECRITURES_METIER)('refuse %s %s avec 401', async (methode, chemin, corps) => {
    const res = await envoyer(request(app), methode, chemin, corps);
    expect(res.status).toBe(401);
  });

  it.each(ADMINISTRATION)('refuse %s %s avec 401', async (methode, chemin, corps) => {
    const res = await envoyer(request(app), methode, chemin, corps);
    expect(res.status).toBe(401);
  });
});

describe('lecteur', () => {
  it.each(LECTURES)('autorise la lecture %s', async (chemin) => {
    const { agent } = await sessionPour(app, 'lecteur');
    const res = await agent.get(chemin);
    expect(res.status).toBeLessThan(400);
  });

  it.each(ECRITURES_METIER)('refuse %s %s avec 403', async (methode, chemin, corps) => {
    const { agent } = await sessionPour(app, 'lecteur');
    const res = await envoyer(agent, methode, chemin, corps);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it.each(ADMINISTRATION)('refuse %s %s avec 403', async (methode, chemin, corps) => {
    const { agent } = await sessionPour(app, 'lecteur');
    const res = await envoyer(agent, methode, chemin, corps);
    expect(res.status).toBe(403);
  });
});

describe('tresorier', () => {
  it.each(LECTURES)('autorise la lecture %s', async (chemin) => {
    const { agent } = await sessionPour(app, 'tresorier');
    const res = await agent.get(chemin);
    expect(res.status).toBeLessThan(400);
  });

  it.each(ECRITURES_METIER)('autorise %s %s (pas de 403)', async (methode, chemin, corps) => {
    const { agent } = await sessionPour(app, 'tresorier');
    const res = await envoyer(agent, methode, chemin, corps);
    // Le contenu peut être invalide ou la ressource absente ; ce qui est
    // vérifié ici est l'absence de refus d'autorisation.
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });

  it.each(ADMINISTRATION)('refuse %s %s avec 403', async (methode, chemin, corps) => {
    const { agent } = await sessionPour(app, 'tresorier');
    const res = await envoyer(agent, methode, chemin, corps);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });
});

describe('admin', () => {
  it.each(LECTURES)('autorise la lecture %s', async (chemin) => {
    const { agent } = await sessionPour(app, 'admin');
    const res = await agent.get(chemin);
    expect(res.status).toBeLessThan(400);
  });

  it.each(ECRITURES_METIER)('autorise %s %s (pas de 403)', async (methode, chemin, corps) => {
    const { agent } = await sessionPour(app, 'admin');
    const res = await envoyer(agent, methode, chemin, corps);
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });

  it.each(ADMINISTRATION)('autorise %s %s (pas de 403)', async (methode, chemin, corps) => {
    const { agent } = await sessionPour(app, 'admin');
    const res = await envoyer(agent, methode, chemin, corps);
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });
});

describe('distinction 401 / 403', () => {
  it('401 quand la session manque, 403 quand elle est valide mais insuffisante', async () => {
    const sans = await request(app).post('/api/membres').send({ nom: 'Test' });
    expect(sans.status).toBe(401);

    const { agent } = await sessionPour(app, 'lecteur');
    const avec = await agent.post('/api/membres').send({ nom: 'Test' });
    expect(avec.status).toBe(403);
  });

  it('conserve la session après un 403', async () => {
    const { agent } = await sessionPour(app, 'lecteur');
    await agent.post('/api/membres').send({ nom: 'Test' });

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
  });
});

describe('le rôle ne vient jamais du client', () => {
  it('ignore un rôle transmis dans le corps', async () => {
    const { agent } = await sessionPour(app, 'lecteur');
    const res = await agent.post('/api/membres').send({ nom: 'Test', role: 'admin' });
    expect(res.status).toBe(403);
  });

  it('ignore un rôle transmis en en-tête', async () => {
    const { agent } = await sessionPour(app, 'lecteur');
    const res = await agent
      .post('/api/membres')
      .set('X-Role', 'admin')
      .set('X-User-Role', 'admin')
      .send({ nom: 'Test' });
    expect(res.status).toBe(403);
  });

  it('ignore un rôle transmis en paramètre de requête', async () => {
    const { agent } = await sessionPour(app, 'lecteur');
    const res = await agent.post('/api/membres?role=admin').send({ nom: 'Test' });
    expect(res.status).toBe(403);
  });
});

describe('rétrogradation immédiate', () => {
  it('applique la perte du droit d’écriture sur la requête suivante', async () => {
    const { pool } = require('../../src/config/database');
    const { agent, utilisateur } = await sessionPour(app, 'tresorier');

    const avant = await agent.post('/api/membres').send({ nom: 'Avant' });
    expect(avant.status).not.toBe(403);

    await pool.query("UPDATE utilisateurs SET role = 'lecteur' WHERE id = $1", [utilisateur.id]);

    const apres = await agent.post('/api/membres').send({ nom: 'Apres' });
    expect(apres.status).toBe(403);
  });
});
