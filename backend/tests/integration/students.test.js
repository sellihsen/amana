/**
 * T055 [US3] — Élèves : filtres, période canonique et unicité mensuelle.
 */
const { createApp } = require('../../src/app');
const { pool } = require('../../src/config/database');
const { sessionPour } = require('../helpers/auth');
const { creerEleve, cle } = require('../helpers/finance');

const app = createApp();

describe('filtres élèves', () => {
  it('filtre par classe et par statut', async () => {
    const { agent } = await sessionPour(app, 'lecteur');
    await pool.query(
      `INSERT INTO eleves (nom, classe, statut) VALUES
         ('Un',    'Débutants', 'actif'),
         ('Deux',  'Niveau 1',  'actif'),
         ('Trois', 'Débutants', 'inactif')`
    );

    const parClasse = await agent.get('/api/eleves').query({ classe: 'Débutants' });
    const items = Array.isArray(parClasse.body) ? parClasse.body : parClasse.body.items;
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items.every((e) => e.classe === 'Débutants')).toBe(true);

    const actifs = await agent.get('/api/eleves/actifs');
    const actifsItems = Array.isArray(actifs.body) ? actifs.body : actifs.body.items;
    expect(actifsItems.every((e) => e.statut === 'actif')).toBe(true);
  });
});

describe('période canonique des écolages', () => {
  it('normalise le mois en date du premier jour', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const eleve = await creerEleve('Période');

    const res = await agent
      .post('/api/eleves/cotisations')
      .set('Idempotency-Key', cle())
      .send({
        eleve_id: eleve.id,
        montant: '50.00',
        mois_concerne: 'Septembre 2026',
        statut_paiement: 'payé',
      });

    expect(res.status).toBe(201);

    const { rows } = await pool.query(
      'SELECT periode FROM cotisations_madrasa WHERE id = $1',
      [res.body.id]
    );
    expect(rows[0].periode).toBeDefined();
    expect(new Date(rows[0].periode).toISOString().slice(0, 10)).toBe('2026-09-01');
  });

  it.each([
    ['Septembre 2026', '2026-09-01'],
    ['septembre 2026', '2026-09-01'],
    ['Janvier 2027', '2027-01-01'],
    ['Décembre 2026', '2026-12-01'],
    ['2026-09', '2026-09-01'],
    ['2026-09-15', '2026-09-01'],
  ])('interprète « %s » comme %s', async (saisie, attendu) => {
    const { agent } = await sessionPour(app, 'tresorier');
    const eleve = await creerEleve(`P-${saisie}`);

    const res = await agent
      .post('/api/eleves/cotisations')
      .set('Idempotency-Key', cle())
      .send({ eleve_id: eleve.id, montant: '50.00', mois_concerne: saisie, statut_paiement: 'payé' });

    expect(res.status).toBe(201);
    const { rows } = await pool.query(
      'SELECT periode FROM cotisations_madrasa WHERE id = $1',
      [res.body.id]
    );
    expect(new Date(rows[0].periode).toISOString().slice(0, 10)).toBe(attendu);
  });

  it('refuse une période ininterprétable', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const eleve = await creerEleve('Période KO');

    for (const saisie of ['pas un mois', 'Foobar 2026', '2026-13', '']) {
      const res = await agent
        .post('/api/eleves/cotisations')
        .set('Idempotency-Key', cle())
        .send({ eleve_id: eleve.id, montant: '50.00', mois_concerne: saisie, statut_paiement: 'payé' });
      expect([400, 422]).toContain(res.status);
    }
  });
});

describe('unicité mensuelle', () => {
  it('refuse deux écolages pour le même élève et le même mois', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const eleve = await creerEleve('Doublon');

    const premier = await agent
      .post('/api/eleves/cotisations')
      .set('Idempotency-Key', cle())
      .send({
        eleve_id: eleve.id,
        montant: '50.00',
        mois_concerne: 'Octobre 2026',
        statut_paiement: 'payé',
      });
    expect(premier.status).toBe(201);

    const second = await agent
      .post('/api/eleves/cotisations')
      .set('Idempotency-Key', cle())
      .send({
        eleve_id: eleve.id,
        montant: '50.00',
        mois_concerne: 'Octobre 2026',
        statut_paiement: 'payé',
      });
    expect(second.status).toBe(409);
  });

  it('refuse le doublon même écrit différemment', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const eleve = await creerEleve('Doublon Variante');

    await agent
      .post('/api/eleves/cotisations')
      .set('Idempotency-Key', cle())
      .send({
        eleve_id: eleve.id,
        montant: '50.00',
        mois_concerne: 'Octobre 2026',
        statut_paiement: 'payé',
      });

    // Même mois, autre orthographe : la période canonique les rapproche.
    const second = await agent
      .post('/api/eleves/cotisations')
      .set('Idempotency-Key', cle())
      .send({
        eleve_id: eleve.id,
        montant: '50.00',
        mois_concerne: '2026-10',
        statut_paiement: 'payé',
      });
    expect(second.status).toBe(409);
  });

  it('autorise le même mois pour deux élèves différents', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const a = await creerEleve('Élève A');
    const b = await creerEleve('Élève B');

    for (const eleve of [a, b]) {
      const res = await agent
        .post('/api/eleves/cotisations')
        .set('Idempotency-Key', cle())
        .send({
          eleve_id: eleve.id,
          montant: '50.00',
          mois_concerne: 'Novembre 2026',
          statut_paiement: 'payé',
        });
      expect(res.status).toBe(201);
    }
  });
});

describe('suppression et historique', () => {
  it('refuse de supprimer un élève porteur d’écolages', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const eleve = await creerEleve('Avec Écolage');

    await agent
      .post('/api/eleves/cotisations')
      .set('Idempotency-Key', cle())
      .send({
        eleve_id: eleve.id,
        montant: '50.00',
        mois_concerne: 'Mars 2026',
        statut_paiement: 'payé',
      });

    const res = await agent.delete(`/api/eleves/${eleve.id}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('HISTORY_EXISTS');

    const { rows } = await pool.query(
      'SELECT COUNT(*)::int AS n FROM cotisations_madrasa WHERE eleve_id = $1',
      [eleve.id]
    );
    expect(rows[0].n).toBe(1);
  });

  it('supprime un élève sans écolage', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const eleve = await creerEleve('Sans Écolage');
    expect((await agent.delete(`/api/eleves/${eleve.id}`)).status).toBe(200);
  });

  it('la cascade destructrice est remplacée par RESTRICT en base', async () => {
    const eleve = await creerEleve('FK Test');
    await pool.query(
      `INSERT INTO cotisations_madrasa (eleve_id, montant, mois_concerne, statut_paiement)
       VALUES ($1, '50.00', 'Mars 2026', 'en attente')`,
      [eleve.id]
    );
    await expect(pool.query('DELETE FROM eleves WHERE id = $1', [eleve.id])).rejects.toThrow();
  });
});
