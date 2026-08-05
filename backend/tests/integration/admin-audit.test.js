/**
 * T073 [US7] — Journal d'audit administrateur : filtres, pagination, erreurs
 * et absence de méthode mutante.
 */
const { createApp } = require('../../src/app');
const { pool } = require('../../src/config/database');
const { sessionPour } = require('../helpers/auth');
const { creerMembre } = require('../helpers/finance');

const app = createApp();

/** Produit quelques événements d'audit variés. */
async function genererEvenements(agent) {
  await agent.post('/api/membres').send({ nom: 'Audit A' });
  await agent.post('/api/membres').send({ nom: 'Audit B' });
  const membre = await creerMembre('Audit C');
  await agent.put(`/api/membres/${membre.id}`).send({ nom: 'Audit C modifié' });
}

describe('GET /api/admin/audit-events', () => {
  it('retourne une page structurée', async () => {
    const { agent } = await sessionPour(app, 'admin');
    await genererEvenements(agent);

    const res = await agent.get('/api/admin/audit-events');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      items: expect.any(Array),
      total: expect.any(Number),
      limit: expect.any(Number),
      offset: expect.any(Number),
    });
    expect(res.body.items.length).toBeGreaterThan(0);
  });

  it('pagine', async () => {
    const { agent } = await sessionPour(app, 'admin');
    await genererEvenements(agent);

    const page1 = await agent.get('/api/admin/audit-events').query({ limit: 1, offset: 0 });
    const page2 = await agent.get('/api/admin/audit-events').query({ limit: 1, offset: 1 });

    expect(page1.body.items).toHaveLength(1);
    expect(page2.body.items).toHaveLength(1);
    expect(page1.body.items[0].id).not.toBe(page2.body.items[0].id);
    expect(page1.body.total).toBe(page2.body.total);
  });

  it('filtre par type d’événement', async () => {
    const { agent } = await sessionPour(app, 'admin');
    await genererEvenements(agent);

    const res = await agent.get('/api/admin/audit-events').query({ event_type: 'member.created' });
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.items.every((e) => e.type_evenement === 'member.created')).toBe(true);
  });

  it('filtre par acteur', async () => {
    const { agent, utilisateur } = await sessionPour(app, 'admin');
    await genererEvenements(agent);

    const res = await agent
      .get('/api/admin/audit-events')
      .query({ actor_user_id: utilisateur.id });
    expect(res.body.items.every((e) => e.utilisateur_id === utilisateur.id)).toBe(true);
  });

  it('filtre par résultat', async () => {
    const { agent } = await sessionPour(app, 'admin');
    await genererEvenements(agent);

    const res = await agent.get('/api/admin/audit-events').query({ resultat: 'SUCCES' });
    expect(res.body.items.every((e) => e.resultat === 'SUCCES')).toBe(true);
  });

  it('filtre par entité', async () => {
    const { agent } = await sessionPour(app, 'admin');
    const membre = await creerMembre('Cible');
    await agent.put(`/api/membres/${membre.id}`).send({ nom: 'Cible modifiée' });

    const res = await agent
      .get('/api/admin/audit-events')
      .query({ entity_type: 'membre', entity_id: String(membre.id) });

    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.items.every((e) => e.entite_type === 'membre')).toBe(true);
  });

  it('filtre par intervalle de dates', async () => {
    const { agent } = await sessionPour(app, 'admin');
    await genererEvenements(agent);

    const aujourdhui = new Date().toISOString().slice(0, 10);
    const res = await agent
      .get('/api/admin/audit-events')
      .query({ date_from: aujourdhui, date_to: aujourdhui });
    expect(res.body.items.length).toBeGreaterThan(0);

    const vide = await agent
      .get('/api/admin/audit-events')
      .query({ date_from: '1999-01-01', date_to: '1999-12-31' });
    expect(vide.body.items).toHaveLength(0);
    expect(vide.body.total).toBe(0);
  });

  it('recherche en texte libre', async () => {
    const { agent } = await sessionPour(app, 'admin');
    await agent.post('/api/membres').send({ nom: 'ChaineTresParticuliere' });

    const res = await agent.get('/api/admin/audit-events').query({ search: 'ChaineTresParticuliere' });
    expect(res.body.items.length).toBeGreaterThan(0);
  });

  it('expose avant et après', async () => {
    const { agent } = await sessionPour(app, 'admin');
    const membre = await creerMembre('Avant Audit');
    await agent.put(`/api/membres/${membre.id}`).send({ nom: 'Après Audit' });

    const res = await agent
      .get('/api/admin/audit-events')
      .query({ event_type: 'member.updated' });
    expect(res.body.items[0].avant.nom).toBe('Avant Audit');
    expect(res.body.items[0].apres.nom).toBe('Après Audit');
  });

  it('refuse un filtre hors liste', async () => {
    const { agent } = await sessionPour(app, 'admin');
    for (const query of [
      { resultat: 'PEUT_ETRE' },
      { limit: '-1' },
      { date_from: 'pas-une-date' },
    ]) {
      const res = await agent.get('/api/admin/audit-events').query(query);
      expect(res.status).toBe(400);
    }
  });

  it('borne la taille de page', async () => {
    const { agent } = await sessionPour(app, 'admin');
    const res = await agent.get('/api/admin/audit-events').query({ limit: 100000 });
    expect(res.status).toBe(200);
    expect(res.body.limit).toBeLessThanOrEqual(500);
  });

  it('ne divulgue jamais de secret', async () => {
    const { agent } = await sessionPour(app, 'admin');
    await agent.post('/api/admin/users').send({
      nom: 'Secret Audit',
      email: `secret.audit.${Date.now()}@test.local`,
      mot_de_passe: 'MotDePasseFort!2026',
      role: 'lecteur',
    });

    const res = await agent.get('/api/admin/audit-events');
    const serialise = JSON.stringify(res.body);
    expect(serialise).not.toMatch(/MotDePasseFort!2026/);
    expect(serialise).not.toMatch(/\$2[aby]\$/);
  });
});

describe('accès', () => {
  it('est réservé à l’administrateur', async () => {
    for (const role of ['lecteur', 'tresorier']) {
      const { agent } = await sessionPour(app, role);
      const res = await agent.get('/api/admin/audit-events');
      expect(res.status).toBe(403);
    }
  });

  it('exige une session', async () => {
    const request = require('supertest');
    const res = await request(app).get('/api/admin/audit-events');
    expect(res.status).toBe(401);
  });
});

describe('aucune méthode mutante', () => {
  it.each(['post', 'put', 'patch', 'delete'])('refuse %s sur le journal', async (methode) => {
    const { agent } = await sessionPour(app, 'admin');
    const res = await agent[methode]('/api/admin/audit-events').send({ type_evenement: 'x' });
    expect([404, 405]).toContain(res.status);
  });

  it('refuse la suppression d’un événement précis', async () => {
    const { agent } = await sessionPour(app, 'admin');
    await agent.post('/api/membres').send({ nom: 'Immuable' });
    const { rows } = await pool.query('SELECT id FROM logs_activite ORDER BY id DESC LIMIT 1');

    const res = await agent.delete(`/api/admin/audit-events/${rows[0].id}`);
    expect([404, 405]).toContain(res.status);

    const { rows: apres } = await pool.query('SELECT id FROM logs_activite WHERE id = $1', [
      rows[0].id,
    ]);
    expect(apres).toHaveLength(1);
  });
});

describe('alias /admin/logs', () => {
  it('reste disponible en lecture', async () => {
    const { agent } = await sessionPour(app, 'admin');
    await genererEvenements(agent);

    const res = await agent.get('/api/admin/logs');
    expect(res.status).toBe(200);
    const items = Array.isArray(res.body) ? res.body : res.body.items;
    expect(items.length).toBeGreaterThan(0);
  });

  it('ne transforme jamais une panne en liste vide', async () => {
    const { agent } = await sessionPour(app, 'admin');

    // La table est rendue inaccessible : l'API doit remonter une erreur.
    try {
      await pool.query('ALTER TABLE logs_activite RENAME TO logs_activite_cache');
      const res = await agent.get('/api/admin/logs');
      expect(res.status).toBeGreaterThanOrEqual(500);
      const items = Array.isArray(res.body) ? res.body : res.body.items;
      expect(items).toBeUndefined();
    } finally {
      await pool.query('ALTER TABLE logs_activite_cache RENAME TO logs_activite');
    }
  });
});
