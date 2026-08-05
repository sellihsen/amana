/**
 * T065 [US4] — Contre-écritures Social après désactivation ou réaffectation
 * de caisse.
 *
 * Une contre-écriture utilise le périmètre HISTORIQUE de son origine : elle
 * reste possible même si la caisse a changé depuis. Seules les nouvelles
 * opérations exigent une caisse actuellement active et Social.
 */
const { createApp } = require('../../src/app');
const { pool } = require('../../src/config/database');
const { sessionPour } = require('../helpers/auth');
const { caisseSociale, creerFamille, ecrituresDe, cle } = require('../helpers/finance');

const app = createApp();

async function donSocial(agent, caisse, montant) {
  const res = await agent
    .post('/api/dons')
    .set('Idempotency-Key', cle())
    .send({ caisse_id: caisse.id, montant });
  expect(res.status).toBe(201);
  return res.body;
}

async function distribution(agent, caisse, famille, montant) {
  const res = await agent
    .post('/api/social/distributions')
    .set('Idempotency-Key', cle())
    .send({ famille_id: famille.id, caisse_origine_id: caisse.id, montant_verse: montant });
  expect(res.status).toBe(201);
  return res.body;
}

describe('contre-écriture d’une distribution', () => {
  it('restitue le montant au disponible', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const caisse = await caisseSociale();
    const famille = await creerFamille();

    await donSocial(agent, caisse, '1000.00');
    const dist = await distribution(agent, caisse, famille, '400.00');
    const [ecriture] = await ecrituresDe('distribution_sociale', dist.id);

    const avant = await agent.get('/api/social/bilan');
    expect(avant.body.reste_disponible).toBe('600.00');

    const res = await agent
      .post(`/api/ecritures-financieres/${ecriture.id}/contre-ecritures`)
      .set('Idempotency-Key', cle())
      .send({ motif: 'Versement annulé' });
    expect(res.status).toBe(201);

    const apres = await agent.get('/api/social/bilan');
    expect(apres.body.reste_disponible).toBe('1000.00');
    expect(apres.body.total_distribue).toBe('0.00');
  });

  it('reste possible après désactivation de la caisse', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const caisse = await caisseSociale();
    const famille = await creerFamille();

    await donSocial(agent, caisse, '500.00');
    const dist = await distribution(agent, caisse, famille, '200.00');
    const [ecriture] = await ecrituresDe('distribution_sociale', dist.id);

    await pool.query('UPDATE caisses SET actif = FALSE WHERE id = $1', [caisse.id]);

    const res = await agent
      .post(`/api/ecritures-financieres/${ecriture.id}/contre-ecritures`)
      .set('Idempotency-Key', cle())
      .send({ motif: 'Correction après clôture de la caisse' });

    expect(res.status).toBe(201);
    expect(res.body.contre_ecriture.perimetre).toBe('SOCIAL');
  });

  it('reste possible après réaffectation de la caisse', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const caisse = await caisseSociale();
    const famille = await creerFamille();

    await donSocial(agent, caisse, '500.00');
    const dist = await distribution(agent, caisse, famille, '200.00');
    const [ecriture] = await ecrituresDe('distribution_sociale', dist.id);

    await pool.query("UPDATE caisses SET affectation = 'Fonctionnement' WHERE id = $1", [caisse.id]);

    const res = await agent
      .post(`/api/ecritures-financieres/${ecriture.id}/contre-ecritures`)
      .set('Idempotency-Key', cle())
      .send({ motif: 'Correction après réaffectation' });

    expect(res.status).toBe(201);
    // Le périmètre historique est conservé : l'écriture reste SOCIAL.
    expect(res.body.contre_ecriture.perimetre).toBe('SOCIAL');
  });

  it('une caisse réaffectée n’accepte plus de nouvelle distribution', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const caisse = await caisseSociale();
    const famille = await creerFamille();

    await donSocial(agent, caisse, '500.00');
    await pool.query("UPDATE caisses SET affectation = 'Fonctionnement' WHERE id = $1", [caisse.id]);

    const res = await agent
      .post('/api/social/distributions')
      .set('Idempotency-Key', cle())
      .send({ famille_id: famille.id, caisse_origine_id: caisse.id, montant_verse: '10.00' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INACTIVE_REFERENCE');
  });
});

describe('contre-écriture d’un don Social', () => {
  it('est refusée si elle rendrait le disponible négatif', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const caisse = await caisseSociale();
    const famille = await creerFamille();

    const don = await donSocial(agent, caisse, '500.00');
    // La quasi-totalité est distribuée : annuler le don creuserait le solde.
    await distribution(agent, caisse, famille, '450.00');

    const [ecriture] = await ecrituresDe('don', don.id);
    const res = await agent
      .post(`/api/ecritures-financieres/${ecriture.id}/contre-ecritures`)
      .set('Idempotency-Key', cle())
      .send({ motif: 'Don erroné' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('SOCIAL_BALANCE_INSUFFICIENT');

    // Rien n'a bougé.
    const bilan = await agent.get('/api/social/bilan');
    expect(bilan.body.reste_disponible).toBe('50.00');
  });

  it('est acceptée si le disponible reste non négatif', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const caisse = await caisseSociale();
    const famille = await creerFamille();

    // Deux dons couvrent la distribution : annuler l'un laisse un solde ≥ 0.
    const don = await donSocial(agent, caisse, '500.00');
    await donSocial(agent, caisse, '400.00');
    await distribution(agent, caisse, famille, '100.00');

    const [ecriture] = await ecrituresDe('don', don.id);
    const res = await agent
      .post(`/api/ecritures-financieres/${ecriture.id}/contre-ecritures`)
      .set('Idempotency-Key', cle())
      .send({ motif: 'Don erroné' });

    expect(res.status).toBe(201);

    // 900 collectés − 500 annulés − 100 distribués = 300.
    const bilan = await agent.get('/api/social/bilan');
    expect(bilan.body.reste_disponible).toBe('300.00');
    expect(bilan.body.total_collecte).toBe('400.00');
    expect(bilan.body.total_distribue).toBe('100.00');
  });

  it('le disponible ne devient jamais négatif, quelle que soit la séquence', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const caisse = await caisseSociale();
    const famille = await creerFamille();

    await donSocial(agent, caisse, '300.00');
    await distribution(agent, caisse, famille, '300.00');

    const { rows: dons } = await pool.query(
      "SELECT id FROM ecritures_financieres WHERE type_ecriture = 'DON' ORDER BY id LIMIT 1"
    );
    const res = await agent
      .post(`/api/ecritures-financieres/${dons[0].id}/contre-ecritures`)
      .set('Idempotency-Key', cle())
      .send({ motif: 'Tentative' });
    expect(res.status).toBe(409);

    const bilan = await agent.get('/api/social/bilan');
    expect(bilan.body.reste_disponible).toBe('0.00');
  });
});

describe('cohérence du bilan', () => {
  it('le bilan Social se rapproche du grand livre', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const caisse = await caisseSociale();
    const famille = await creerFamille();

    await donSocial(agent, caisse, '750.00');
    await distribution(agent, caisse, famille, '125.50');

    const bilan = await agent.get('/api/social/bilan');
    const { rows } = await pool.query(
      `SELECT COALESCE(SUM(montant * CASE sens WHEN 'CREDIT' THEN 1 ELSE -1 END), 0)::TEXT AS solde
         FROM ecritures_financieres WHERE perimetre = 'SOCIAL'`
    );

    expect(bilan.body.reste_disponible).toBe(Number(rows[0].solde).toFixed(2));
    expect(bilan.body.total_collecte).toBe('750.00');
    expect(bilan.body.total_distribue).toBe('125.50');
  });

  it('ventile le bilan par caisse sans démultiplier les montants', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const caisse = await caisseSociale();
    const famille = await creerFamille();

    // Un seul don, plusieurs distributions : sans le correctif de fan-out, le
    // total collecté serait multiplié par le nombre de distributions.
    await donSocial(agent, caisse, '600.00');
    for (let i = 0; i < 3; i += 1) {
      await distribution(agent, caisse, famille, '100.00');
    }

    const bilan = await agent.get('/api/social/bilan');
    expect(bilan.body.total_collecte).toBe('600.00');
    expect(bilan.body.total_distribue).toBe('300.00');
    expect(bilan.body.reste_disponible).toBe('300.00');

    const ligne = bilan.body.caisses.find((c) => c.caisse_id === caisse.id);
    expect(ligne.total_collecte).toBe('600.00');
    expect(ligne.total_distribue).toBe('300.00');
    expect(ligne.nb_distributions).toBe(3);
  });
});
