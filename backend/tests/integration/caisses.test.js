/**
 * T088 [US6] — Caisses : affectation, désactivation et conservation de
 * l'historique.
 */
const { createApp } = require('../../src/app');
const { pool } = require('../../src/config/database');
const { sessionPour } = require('../helpers/auth');
const { caisseGenerale, caisseSociale, creerFamille, cle } = require('../helpers/finance');

const app = createApp();

describe('CRUD des caisses', () => {
  it('crée une caisse avec son affectation', async () => {
    const { agent } = await sessionPour(app, 'admin');
    const res = await agent
      .post('/api/admin/caisses')
      .send({ nom: `Caisse ${Date.now()}`, affectation: 'Social', description: 'Test' });

    expect(res.status).toBe(201);
    expect(res.body.affectation).toBe('Social');
    expect(res.body.actif).toBe(true);
  });

  it('refuse une affectation hors liste', async () => {
    const { agent } = await sessionPour(app, 'admin');
    const res = await agent
      .post('/api/admin/caisses')
      .send({ nom: `Caisse ${Date.now()}`, affectation: 'Autre' });
    expect(res.status).toBe(400);
  });

  it('refuse un nom vide et un doublon', async () => {
    const { agent } = await sessionPour(app, 'admin');
    expect((await agent.post('/api/admin/caisses').send({ nom: '  ' })).status).toBe(400);

    const nom = `Doublon ${Date.now()}`;
    expect((await agent.post('/api/admin/caisses').send({ nom })).status).toBe(201);
    expect((await agent.post('/api/admin/caisses').send({ nom })).status).toBe(409);
  });

  it('est réservé à l’administrateur', async () => {
    for (const role of ['lecteur', 'tresorier']) {
      const { agent } = await sessionPour(app, role);
      expect((await agent.post('/api/admin/caisses').send({ nom: 'X' })).status).toBe(403);
    }
  });

  it('audite la création et la modification', async () => {
    const { agent } = await sessionPour(app, 'admin');
    const creation = await agent.post('/api/admin/caisses').send({ nom: `Auditée ${Date.now()}` });
    await agent.put(`/api/admin/caisses/${creation.body.id}`).send({ description: 'Modifiée' });

    const { rows } = await pool.query(
      "SELECT type_evenement FROM logs_activite WHERE type_evenement LIKE 'caisse.%'"
    );
    expect(rows.map((r) => r.type_evenement)).toEqual(
      expect.arrayContaining(['caisse.created', 'caisse.updated'])
    );
  });
});

describe('désactivation', () => {
  it('une caisse désactivée n’accepte plus de don', async () => {
    const { agent } = await sessionPour(app, 'admin');
    const caisse = await caisseGenerale();

    await agent.put(`/api/admin/caisses/${caisse.id}`).send({ actif: false });

    const res = await agent
      .post('/api/dons')
      .set('Idempotency-Key', cle())
      .send({ caisse_id: caisse.id, montant: '10.00' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INACTIVE_REFERENCE');
  });

  it('une caisse désactivée disparaît de la liste des caisses actives', async () => {
    const { agent } = await sessionPour(app, 'admin');
    const caisse = await caisseGenerale();
    await agent.put(`/api/admin/caisses/${caisse.id}`).send({ actif: false });

    const res = await agent.get('/api/caisses');
    const items = Array.isArray(res.body) ? res.body : res.body.items;
    expect(items.some((c) => c.id === caisse.id)).toBe(false);
  });

  it('la désactivation conserve l’historique des dons', async () => {
    const { agent } = await sessionPour(app, 'admin');
    const caisse = await caisseGenerale();

    const don = await agent
      .post('/api/dons')
      .set('Idempotency-Key', cle())
      .send({ caisse_id: caisse.id, montant: '100.00' });
    expect(don.status).toBe(201);

    await agent.put(`/api/admin/caisses/${caisse.id}`).send({ actif: false });

    const { rows } = await pool.query('SELECT * FROM dons WHERE id = $1', [don.body.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].caisse_id).toBe(caisse.id);

    // Le total général reste inchangé.
    const resume = await agent.get('/api/finances/resume');
    expect(resume.body.total_dons).toBe('100.00');
  });

  it('la réactivation redonne accès', async () => {
    const { agent } = await sessionPour(app, 'admin');
    const caisse = await caisseGenerale();

    await agent.put(`/api/admin/caisses/${caisse.id}`).send({ actif: false });
    await agent.put(`/api/admin/caisses/${caisse.id}`).send({ actif: true });

    const res = await agent
      .post('/api/dons')
      .set('Idempotency-Key', cle())
      .send({ caisse_id: caisse.id, montant: '10.00' });
    expect(res.status).toBe(201);
  });
});

describe('suppression history-safe', () => {
  it('refuse de supprimer une caisse porteuse d’écritures', async () => {
    const { agent } = await sessionPour(app, 'admin');
    const caisse = await caisseGenerale();

    await agent
      .post('/api/dons')
      .set('Idempotency-Key', cle())
      .send({ caisse_id: caisse.id, montant: '10.00' });

    const res = await agent.delete(`/api/admin/caisses/${caisse.id}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('HISTORY_EXISTS');

    const { rows } = await pool.query('SELECT id FROM caisses WHERE id = $1', [caisse.id]);
    expect(rows).toHaveLength(1);
  });

  it('supprime une caisse jamais utilisée', async () => {
    const { agent } = await sessionPour(app, 'admin');
    const creation = await agent.post('/api/admin/caisses').send({ nom: `Vide ${Date.now()}` });

    const res = await agent.delete(`/api/admin/caisses/${creation.body.id}`);
    expect(res.status).toBe(200);
  });

  it('la contrainte RESTRICT protège en base', async () => {
    const { agent } = await sessionPour(app, 'admin');
    const caisse = await caisseGenerale();
    await agent
      .post('/api/dons')
      .set('Idempotency-Key', cle())
      .send({ caisse_id: caisse.id, montant: '10.00' });

    await expect(pool.query('DELETE FROM caisses WHERE id = $1', [caisse.id])).rejects.toThrow();
  });
});

describe('réaffectation', () => {
  it('ne requalifie jamais les écritures passées', async () => {
    const { agent } = await sessionPour(app, 'admin');
    const caisse = await caisseGenerale();

    await agent
      .post('/api/dons')
      .set('Idempotency-Key', cle())
      .send({ caisse_id: caisse.id, montant: '100.00' });

    // La caisse devient Social APRÈS le don.
    await agent.put(`/api/admin/caisses/${caisse.id}`).send({ affectation: 'Social' });

    // Le don reste dans le périmètre GENERAL où il a été enregistré.
    const { rows } = await pool.query(
      "SELECT perimetre FROM ecritures_financieres WHERE source_type = 'don'"
    );
    expect(rows[0].perimetre).toBe('GENERAL');

    const resume = await agent.get('/api/finances/resume');
    expect(resume.body.total_dons).toBe('100.00');

    const social = await agent.get('/api/social/bilan');
    expect(social.body.total_collecte).toBe('0.00');
  });

  it('les nouveaux dons suivent la nouvelle affectation', async () => {
    const { agent } = await sessionPour(app, 'admin');
    const caisse = await caisseGenerale();
    await agent.put(`/api/admin/caisses/${caisse.id}`).send({ affectation: 'Social' });

    await agent
      .post('/api/dons')
      .set('Idempotency-Key', cle())
      .send({ caisse_id: caisse.id, montant: '50.00' });

    const social = await agent.get('/api/social/bilan');
    expect(social.body.total_collecte).toBe('50.00');
  });
});
