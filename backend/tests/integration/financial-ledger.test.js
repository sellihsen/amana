/**
 * T037 [US2] — Grand livre : immutabilité, contre-écriture unique, reprise de
 * l'historique.
 */
const { createApp } = require('../../src/app');
const { pool } = require('../../src/config/database');
const { sessionPour } = require('../helpers/auth');
const { caisseGenerale, ecrituresDe, cle } = require('../helpers/finance');

const app = createApp();

async function unDon(agent, montant = '100.00') {
  const c = await caisseGenerale();
  const res = await agent
    .post('/api/dons')
    .set('Idempotency-Key', cle())
    .send({ caisse_id: c.id, montant });
  expect(res.status).toBe(201);
  return res.body;
}

describe('immutabilité du grand livre', () => {
  it('refuse UPDATE et DELETE en base', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const don = await unDon(agent);
    const [ecriture] = await ecrituresDe('don', don.id);

    await expect(
      pool.query('UPDATE ecritures_financieres SET montant = $1 WHERE id = $2', ['1.00', ecriture.id])
    ).rejects.toThrow();
    await expect(
      pool.query('DELETE FROM ecritures_financieres WHERE id = $1', [ecriture.id])
    ).rejects.toThrow();
  });

  it('n’expose aucune route de modification du grand livre', async () => {
    const { agent } = await sessionPour(app, 'admin');
    const don = await unDon(agent);
    const [ecriture] = await ecrituresDe('don', don.id);

    for (const methode of ['put', 'patch', 'delete']) {
      const res = await agent[methode](`/api/ecritures-financieres/${ecriture.id}`).send({
        montant: '1.00',
      });
      expect([404, 405]).toContain(res.status);
    }
  });
});

describe('contre-écriture', () => {
  it('crée une écriture opposée et laisse l’originale intacte', async () => {
    const { agent, utilisateur } = await sessionPour(app, 'tresorier');
    const don = await unDon(agent, '250.00');
    const [origine] = await ecrituresDe('don', don.id);

    const res = await agent
      .post(`/api/ecritures-financieres/${origine.id}/contre-ecritures`)
      .set('Idempotency-Key', cle())
      .send({ motif: 'Erreur de caisse lors de la saisie' });

    expect(res.status).toBe(201);
    expect(res.body.origine.id).toBe(origine.id);
    expect(res.body.contre_ecriture).toMatchObject({
      type_ecriture: 'CONTRE_ECRITURE',
      montant: '250.00',
      perimetre: origine.perimetre,
      sens: origine.sens === 'CREDIT' ? 'DEBIT' : 'CREDIT',
      motif: 'Erreur de caisse lors de la saisie',
    });
    expect(res.body.contre_ecriture.cree_par).toBe(utilisateur.id);

    const { rows } = await pool.query('SELECT * FROM ecritures_financieres WHERE id = $1', [
      origine.id,
    ]);
    expect(rows[0].montant).toBe('250.00');
  });

  it('exige un motif', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const don = await unDon(agent);
    const [origine] = await ecrituresDe('don', don.id);

    for (const motif of [undefined, '', '   ']) {
      const res = await agent
        .post(`/api/ecritures-financieres/${origine.id}/contre-ecritures`)
        .set('Idempotency-Key', cle())
        .send(motif === undefined ? {} : { motif });
      expect(res.status).toBe(400);
    }
  });

  it('exige une clé d’idempotence', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const don = await unDon(agent);
    const [origine] = await ecrituresDe('don', don.id);

    const res = await agent
      .post(`/api/ecritures-financieres/${origine.id}/contre-ecritures`)
      .send({ motif: 'Erreur' });
    expect(res.status).toBe(400);
  });

  it('refuse une seconde contre-écriture', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const don = await unDon(agent);
    const [origine] = await ecrituresDe('don', don.id);

    await agent
      .post(`/api/ecritures-financieres/${origine.id}/contre-ecritures`)
      .set('Idempotency-Key', cle())
      .send({ motif: 'Première correction' });

    const seconde = await agent
      .post(`/api/ecritures-financieres/${origine.id}/contre-ecritures`)
      .set('Idempotency-Key', cle())
      .send({ motif: 'Seconde correction' });

    expect(seconde.status).toBe(409);
    expect(seconde.body.code).toBe('ALREADY_REVERSED');
  });

  it('refuse de contrepasser une contre-écriture', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const don = await unDon(agent);
    const [origine] = await ecrituresDe('don', don.id);

    const premiere = await agent
      .post(`/api/ecritures-financieres/${origine.id}/contre-ecritures`)
      .set('Idempotency-Key', cle())
      .send({ motif: 'Correction' });

    const res = await agent
      .post(`/api/ecritures-financieres/${premiere.body.contre_ecriture.id}/contre-ecritures`)
      .set('Idempotency-Key', cle())
      .send({ motif: 'Correction de la correction' });

    expect([400, 409]).toContain(res.status);
  });

  it('rejoue la même clé sans créer deux contre-écritures', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const don = await unDon(agent);
    const [origine] = await ecrituresDe('don', don.id);
    const k = cle();

    const a = await agent
      .post(`/api/ecritures-financieres/${origine.id}/contre-ecritures`)
      .set('Idempotency-Key', k)
      .send({ motif: 'Erreur' });
    const b = await agent
      .post(`/api/ecritures-financieres/${origine.id}/contre-ecritures`)
      .set('Idempotency-Key', k)
      .send({ motif: 'Erreur' });

    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.body.contre_ecriture.id).toBe(a.body.contre_ecriture.id);

    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS n FROM ecritures_financieres WHERE type_ecriture = 'CONTRE_ECRITURE'"
    );
    expect(rows[0].n).toBe(1);
  });

  it('audite la contre-écriture', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const don = await unDon(agent);
    const [origine] = await ecrituresDe('don', don.id);

    await agent
      .post(`/api/ecritures-financieres/${origine.id}/contre-ecritures`)
      .set('Idempotency-Key', cle())
      .send({ motif: 'Erreur de saisie' });

    const { rows } = await pool.query(
      "SELECT * FROM logs_activite WHERE type_evenement = 'financial-entry.reversed'"
    );
    expect(rows).toHaveLength(1);
  });

  it('retourne 404 pour une écriture inexistante', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const res = await agent
      .post('/api/ecritures-financieres/999999/contre-ecritures')
      .set('Idempotency-Key', cle())
      .send({ motif: 'Erreur' });
    expect(res.status).toBe(404);
  });

  it('refuse la contre-écriture à un lecteur', async () => {
    const { agent: tresorier } = await sessionPour(app, 'tresorier');
    const don = await unDon(tresorier);
    const [origine] = await ecrituresDe('don', don.id);

    const { agent: lecteur } = await sessionPour(app, 'lecteur');
    const res = await lecteur
      .post(`/api/ecritures-financieres/${origine.id}/contre-ecritures`)
      .set('Idempotency-Key', cle())
      .send({ motif: 'Erreur' });
    expect(res.status).toBe(403);
  });
});

describe('consultation du grand livre', () => {
  it('pagine et filtre', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    await unDon(agent, '10.00');
    await unDon(agent, '20.00');

    const res = await agent.get('/api/ecritures-financieres').query({ limit: 1, offset: 0 });
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.total).toBeGreaterThanOrEqual(2);
    expect(res.body.limit).toBe(1);
    expect(res.body.offset).toBe(0);
    expect(res.body.items[0].montant).toMatch(/^\d+\.\d{2}$/);
  });

  it.each([
    ['type', 'DON'],
    ['perimetre', 'GENERAL'],
    ['sens', 'CREDIT'],
  ])('filtre par %s', async (champ, valeur) => {
    const { agent } = await sessionPour(app, 'tresorier');
    await unDon(agent);

    const res = await agent.get('/api/ecritures-financieres').query({ [champ]: valeur });
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
  });

  it('refuse une valeur de filtre hors liste', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const res = await agent.get('/api/ecritures-financieres').query({ perimetre: 'AUTRE' });
    expect(res.status).toBe(400);
  });

  it('expose la relation origine / contre-écriture', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const don = await unDon(agent);
    const [origine] = await ecrituresDe('don', don.id);

    const contre = await agent
      .post(`/api/ecritures-financieres/${origine.id}/contre-ecritures`)
      .set('Idempotency-Key', cle())
      .send({ motif: 'Erreur' });

    const res = await agent.get(`/api/ecritures-financieres/${origine.id}`);
    expect(res.status).toBe(200);
    expect(res.body.contre_ecriture.id).toBe(contre.body.contre_ecriture.id);
    expect(res.body.est_annulee).toBe(true);
  });

  it('filtre par état d’annulation', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const annule = await unDon(agent, '11.00');
    await unDon(agent, '12.00');
    const [origine] = await ecrituresDe('don', annule.id);

    await agent
      .post(`/api/ecritures-financieres/${origine.id}/contre-ecritures`)
      .set('Idempotency-Key', cle())
      .send({ motif: 'Erreur' });

    const annulees = await agent.get('/api/ecritures-financieres').query({ annulee: 'true' });
    expect(annulees.body.items.every((e) => e.est_annulee)).toBe(true);
    expect(annulees.body.items.length).toBe(1);
  });
});

describe('reprise de l’historique', () => {
  it('rattache chaque source héritée à une écriture unique', async () => {
    // Lignes insérées hors API, comme dans une base antérieure au grand livre.
    const c = await caisseGenerale();
    const { rows: don } = await pool.query(
      `INSERT INTO dons (montant, caisse_id, date_don) VALUES ('75.00', $1, CURRENT_DATE) RETURNING *`,
      [c.id]
    );
    expect(don[0].ecriture_id).toBeNull();

    // Rejeu du backfill de la migration 015.
    const fs = require('fs');
    const path = require('path');
    const sql = fs.readFileSync(
      path.join(__dirname, '..', '..', 'migrations', '015_financial_ledger.sql'),
      'utf8'
    );
    await pool.query(sql);

    const { rows: apres } = await pool.query('SELECT * FROM dons WHERE id = $1', [don[0].id]);
    expect(apres[0].ecriture_id).not.toBeNull();

    const ecritures = await ecrituresDe('don', don[0].id);
    expect(ecritures).toHaveLength(1);
    expect(ecritures[0].montant).toBe('75.00');
    expect(ecritures[0].acteur_nom).toBe('Système');
  });
});
