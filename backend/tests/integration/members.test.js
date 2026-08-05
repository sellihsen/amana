/**
 * T053 [US3] — Membres : recherche, statut et suppression préservant l'historique.
 */
const { createApp } = require('../../src/app');
const { pool } = require('../../src/config/database');
const { sessionPour } = require('../helpers/auth');
const { caisseGenerale, creerMembre, cle } = require('../helpers/finance');

const app = createApp();

describe('GET /api/membres', () => {
  it('recherche par nom, prénom, email et téléphone', async () => {
    const { agent } = await sessionPour(app, 'lecteur');
    await pool.query(
      `INSERT INTO membres (nom, prenom, email, telephone, statut) VALUES
         ('Benali', 'Ibrahim', 'ibrahim@test.local', '0601020304', 'actif'),
         ('Diallo', 'Aminata', 'aminata@test.local', '0605060708', 'actif')`
    );

    for (const [terme, attendu] of [
      ['Benali', 'Benali'],
      ['ibrahim', 'Benali'],
      ['Aminata', 'Diallo'],
      ['0605060708', 'Diallo'],
    ]) {
      const res = await agent.get('/api/membres').query({ search: terme });
      expect(res.status).toBe(200);
      const items = Array.isArray(res.body) ? res.body : res.body.items;
      expect(items.length).toBeGreaterThan(0);
      expect(items.some((m) => m.nom === attendu)).toBe(true);
    }
  });

  it('filtre par statut', async () => {
    const { agent } = await sessionPour(app, 'lecteur');
    await pool.query(
      `INSERT INTO membres (nom, statut) VALUES ('Actif', 'actif'), ('Inactif', 'inactif')`
    );

    const res = await agent.get('/api/membres').query({ statut: 'inactif' });
    const items = Array.isArray(res.body) ? res.body : res.body.items;
    expect(items.every((m) => m.statut === 'inactif')).toBe(true);
    expect(items.some((m) => m.nom === 'Inactif')).toBe(true);
  });

  it('refuse un statut hors liste', async () => {
    const { agent } = await sessionPour(app, 'lecteur');
    const res = await agent.get('/api/membres').query({ statut: "actif' OR '1'='1" });
    expect([200, 400]).toContain(res.status);
    if (res.status === 200) {
      const items = Array.isArray(res.body) ? res.body : res.body.items;
      expect(items).toHaveLength(0);
    }
  });
});

describe('mutations de membre', () => {
  it('crée un membre et audite', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const res = await agent.post('/api/membres').send({ nom: 'Nouveau', prenom: 'Membre' });

    expect(res.status).toBe(201);
    const { rows } = await pool.query(
      "SELECT * FROM logs_activite WHERE type_evenement = 'member.created'"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].entite_id).toBe(String(res.body.id));
  });

  it('refuse un nom vide', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    for (const nom of ['', '   ', null, undefined]) {
      const res = await agent.post('/api/membres').send({ nom });
      expect(res.status).toBe(400);
    }
  });

  it('modifie un membre et audite avant/après', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const membre = await creerMembre('Avant');

    const res = await agent.put(`/api/membres/${membre.id}`).send({ nom: 'Après' });
    expect(res.status).toBe(200);
    expect(res.body.nom).toBe('Après');

    const { rows } = await pool.query(
      "SELECT * FROM logs_activite WHERE type_evenement = 'member.updated'"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].avant.nom).toBe('Avant');
    expect(rows[0].apres.nom).toBe('Après');
  });

  it('retourne 404 pour un membre inexistant', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    expect((await agent.put('/api/membres/999999').send({ nom: 'X' })).status).toBe(404);
    expect((await agent.delete('/api/membres/999999')).status).toBe(404);
  });
});

describe('suppression et historique', () => {
  it('supprime un membre sans historique', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const membre = await creerMembre('Sans Historique');

    const res = await agent.delete(`/api/membres/${membre.id}`);
    expect(res.status).toBe(200);

    const { rows } = await pool.query('SELECT id FROM membres WHERE id = $1', [membre.id]);
    expect(rows).toHaveLength(0);
  });

  it('refuse de supprimer un membre porteur de cotisations', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const membre = await creerMembre('Avec Cotisation');

    await agent
      .post('/api/cotisations')
      .set('Idempotency-Key', cle())
      .send({ membre_id: membre.id, montant: '120.00', annee: 2026, statut: 'payee' });

    const res = await agent.delete(`/api/membres/${membre.id}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('HISTORY_EXISTS');

    // Ni le membre ni sa cotisation ne disparaissent.
    const { rows: membres } = await pool.query('SELECT id FROM membres WHERE id = $1', [membre.id]);
    expect(membres).toHaveLength(1);
    const { rows: cotis } = await pool.query(
      'SELECT id FROM cotisations WHERE membre_id = $1',
      [membre.id]
    );
    expect(cotis).toHaveLength(1);
  });

  it('refuse de supprimer un membre porteur de dons', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const membre = await creerMembre('Donateur');
    const c = await caisseGenerale();

    await agent
      .post('/api/dons')
      .set('Idempotency-Key', cle())
      .send({ membre_id: membre.id, caisse_id: c.id, montant: '50.00' });

    const res = await agent.delete(`/api/membres/${membre.id}`);
    expect(res.status).toBe(409);

    const { rows } = await pool.query('SELECT id FROM dons WHERE membre_id = $1', [membre.id]);
    expect(rows).toHaveLength(1);
  });

  it('permet la désactivation à la place de la suppression', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const membre = await creerMembre('À Désactiver');

    await agent
      .post('/api/cotisations')
      .set('Idempotency-Key', cle())
      .send({ membre_id: membre.id, montant: '120.00', annee: 2026, statut: 'payee' });

    const res = await agent.put(`/api/membres/${membre.id}`).send({ statut: 'inactif' });
    expect(res.status).toBe(200);
    expect(res.body.statut).toBe('inactif');

    // L'historique reste intact.
    const { rows } = await pool.query('SELECT id FROM cotisations WHERE membre_id = $1', [
      membre.id,
    ]);
    expect(rows).toHaveLength(1);
  });
});

describe('protection en base', () => {
  it('la cascade destructrice est remplacée par RESTRICT', async () => {
    const membre = await creerMembre('FK Test');
    await pool.query(
      `INSERT INTO cotisations (membre_id, montant, annee, statut)
       VALUES ($1, '10.00', 2026, 'en_attente')`,
      [membre.id]
    );

    await expect(pool.query('DELETE FROM membres WHERE id = $1', [membre.id])).rejects.toThrow();
  });
});

describe('unicité des cotisations annuelles', () => {
  it('refuse deux cotisations annuelles sans mois pour le même membre et la même année', async () => {
    const membre = await creerMembre('Doublon Annuel');
    await pool.query(
      `INSERT INTO cotisations (membre_id, montant, annee, mois, statut)
       VALUES ($1, '120.00', 2026, NULL, 'en_attente')`,
      [membre.id]
    );

    // Sans contrainte adaptée, NULL <> NULL autorise le doublon.
    await expect(
      pool.query(
        `INSERT INTO cotisations (membre_id, montant, annee, mois, statut)
         VALUES ($1, '120.00', 2026, NULL, 'en_attente')`,
        [membre.id]
      )
    ).rejects.toThrow();
  });

  it('autorise des mois différents pour la même année', async () => {
    const membre = await creerMembre('Mois Différents');
    for (const mois of [1, 2, 3]) {
      await pool.query(
        `INSERT INTO cotisations (membre_id, montant, annee, mois, statut)
         VALUES ($1, '10.00', 2026, $2, 'en_attente')`,
        [membre.id, mois]
      );
    }
    const { rows } = await pool.query(
      'SELECT COUNT(*)::int AS n FROM cotisations WHERE membre_id = $1',
      [membre.id]
    );
    expect(rows[0].n).toBe(3);
  });
});
