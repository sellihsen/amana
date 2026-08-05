/**
 * T054 [US3] — Personnel : désactivation et protection des paiements.
 */
const { createApp } = require('../../src/app');
const { pool } = require('../../src/config/database');
const { sessionPour } = require('../helpers/auth');
const { creerPersonnel, cle } = require('../helpers/finance');

const app = createApp();

describe('fiches personnel', () => {
  it('crée une fiche et audite', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const res = await agent
      .post('/api/personnel')
      .send({ nom: 'Nouveau', prenom: 'Employé', role_poste: 'Imam', salaire_base: '1500.00' });

    expect(res.status).toBe(201);
    const { rows } = await pool.query(
      "SELECT * FROM logs_activite WHERE type_evenement = 'personnel.created'"
    );
    expect(rows).toHaveLength(1);
  });

  it('valide le salaire de base comme montant EUR exact', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    for (const salaire of ['1500', '1500.5', '1500.456', '-1.00']) {
      const res = await agent
        .post('/api/personnel')
        .send({ nom: 'Salaire KO', role_poste: 'Imam', salaire_base: salaire });
      expect([400, 422]).toContain(res.status);
    }
  });

  it('accepte un salaire de base nul', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const res = await agent
      .post('/api/personnel')
      .send({ nom: 'Bénévole', role_poste: 'Autre', salaire_base: '0.00' });
    expect(res.status).toBe(201);
    expect(res.body.salaire_base).toBe('0.00');
  });

  it('modifie une fiche sans toucher aux paiements', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const employe = await creerPersonnel('Modifiable');

    await agent
      .post('/api/personnel/paiements')
      .set('Idempotency-Key', cle())
      .send({ personnel_id: employe.id, montant_verse: '1000.00', mois_concerne: 'Mars 2026' });

    const res = await agent.put(`/api/personnel/${employe.id}`).send({ nom: 'Renommé' });
    expect(res.status).toBe(200);

    const { rows } = await pool.query(
      'SELECT COUNT(*)::int AS n FROM paiements_salaires WHERE personnel_id = $1',
      [employe.id]
    );
    expect(rows[0].n).toBe(1);
  });
});

describe('suppression et historique', () => {
  it('supprime un employé sans paiement', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const employe = await creerPersonnel('Sans Paiement');

    const res = await agent.delete(`/api/personnel/${employe.id}`);
    expect(res.status).toBe(200);
  });

  it('refuse de supprimer un employé payé et propose la désactivation', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const employe = await creerPersonnel('Payé');

    await agent
      .post('/api/personnel/paiements')
      .set('Idempotency-Key', cle())
      .send({ personnel_id: employe.id, montant_verse: '1000.00', mois_concerne: 'Mars 2026' });

    const res = await agent.delete(`/api/personnel/${employe.id}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('HISTORY_EXISTS');

    // Aucun paiement n'est perdu.
    const { rows } = await pool.query(
      'SELECT COUNT(*)::int AS n FROM paiements_salaires WHERE personnel_id = $1',
      [employe.id]
    );
    expect(rows[0].n).toBe(1);
  });

  it('la désactivation conserve l’historique', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const employe = await creerPersonnel('À Désactiver');

    await agent
      .post('/api/personnel/paiements')
      .set('Idempotency-Key', cle())
      .send({ personnel_id: employe.id, montant_verse: '1000.00', mois_concerne: 'Mars 2026' });

    const res = await agent.put(`/api/personnel/${employe.id}`).send({ statut: 'inactif' });
    expect(res.status).toBe(200);
    expect(res.body.statut).toBe('inactif');

    const { rows } = await pool.query(
      'SELECT COUNT(*)::int AS n FROM paiements_salaires WHERE personnel_id = $1',
      [employe.id]
    );
    expect(rows[0].n).toBe(1);
  });

  it('la cascade destructrice est remplacée par RESTRICT en base', async () => {
    const employe = await creerPersonnel('FK Test');
    await pool.query(
      `INSERT INTO paiements_salaires (personnel_id, montant_verse, mois_concerne)
       VALUES ($1, '100.00', 'Mars 2026')`,
      [employe.id]
    );

    await expect(pool.query('DELETE FROM personnel WHERE id = $1', [employe.id])).rejects.toThrow();
  });
});

describe('GET /api/personnel/actifs', () => {
  it('ne retourne que les employés actifs', async () => {
    const { agent } = await sessionPour(app, 'lecteur');
    await creerPersonnel('Actif A');
    const inactif = await creerPersonnel('Inactif B');
    await pool.query("UPDATE personnel SET statut = 'inactif' WHERE id = $1", [inactif.id]);

    const res = await agent.get('/api/personnel/actifs');
    const items = Array.isArray(res.body) ? res.body : res.body.items;
    expect(items.every((p) => p.statut === 'actif')).toBe(true);
    expect(items.some((p) => p.id === inactif.id)).toBe(false);
  });
});
