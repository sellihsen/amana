/**
 * T036 [US2] — Salaires et écolages : EUR exact, idempotence et rollback.
 */
const { createApp } = require('../../src/app');
const { pool } = require('../../src/config/database');
const { sessionPour } = require('../helpers/auth');
const { creerPersonnel, creerEleve, ecrituresDe, cle } = require('../helpers/finance');

const app = createApp();

describe('paiement de salaire', () => {
  it('crée le paiement et son écriture DEBIT', async () => {
    const { agent, utilisateur } = await sessionPour(app, 'tresorier');
    const employe = await creerPersonnel();

    const res = await agent
      .post('/api/personnel/paiements')
      .set('Idempotency-Key', cle())
      .send({
        personnel_id: employe.id,
        montant_verse: '1200.00',
        type_paiement: 'Salaire mensuel',
        mois_concerne: 'Mars 2026',
      });

    expect(res.status).toBe(201);
    const ecritures = await ecrituresDe('paiement_salaire', res.body.id);
    expect(ecritures).toHaveLength(1);
    expect(ecritures[0]).toMatchObject({
      type_ecriture: 'PAIEMENT_SALAIRE',
      perimetre: 'GENERAL',
      sens: 'DEBIT',
      montant: '1200.00',
    });
    expect(ecritures[0].cree_par).toBe(utilisateur.id);
  });

  it.each(['1200', '1200.5', '1200.456', '0.00', '-5.00'])(
    'refuse le montant %s',
    async (montant) => {
      const { agent } = await sessionPour(app, 'tresorier');
      const employe = await creerPersonnel();

      const res = await agent
        .post('/api/personnel/paiements')
        .set('Idempotency-Key', cle())
        .send({ personnel_id: employe.id, montant_verse: montant, mois_concerne: 'Mars 2026' });

      expect([400, 422]).toContain(res.status);
      const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM paiements_salaires');
      expect(rows[0].n).toBe(0);
    }
  );

  it('rejoue la même clé sans doubler le versement', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const employe = await creerPersonnel();
    const k = cle();
    const corps = {
      personnel_id: employe.id,
      montant_verse: '1200.00',
      mois_concerne: 'Mars 2026',
    };

    const a = await agent.post('/api/personnel/paiements').set('Idempotency-Key', k).send(corps);
    const b = await agent.post('/api/personnel/paiements').set('Idempotency-Key', k).send(corps);

    expect(b.body.id).toBe(a.body.id);
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM paiements_salaires');
    expect(rows[0].n).toBe(1);
  });

  it('refuse la suppression d’un paiement comptabilisé', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const employe = await creerPersonnel();
    const res = await agent
      .post('/api/personnel/paiements')
      .set('Idempotency-Key', cle())
      .send({ personnel_id: employe.id, montant_verse: '1200.00', mois_concerne: 'Mars 2026' });

    const suppression = await agent.delete(`/api/personnel/paiements/${res.body.id}`);
    expect([405, 409]).toContain(suppression.status);
    expect(await ecrituresDe('paiement_salaire', res.body.id)).toHaveLength(1);
  });

  it('refuse un employé inexistant', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const res = await agent
      .post('/api/personnel/paiements')
      .set('Idempotency-Key', cle())
      .send({ personnel_id: 999999, montant_verse: '10.00', mois_concerne: 'Mars 2026' });
    expect([400, 404, 409]).toContain(res.status);
  });
});

describe('écolage', () => {
  it('crée l’écriture CREDIT lorsqu’il est payé', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const eleve = await creerEleve();

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
    const ecritures = await ecrituresDe('cotisation_madrasa', res.body.id);
    expect(ecritures).toHaveLength(1);
    expect(ecritures[0]).toMatchObject({
      type_ecriture: 'ECOLAGE',
      perimetre: 'GENERAL',
      sens: 'CREDIT',
      montant: '50.00',
    });
  });

  it('ne crée aucune écriture tant qu’il est en attente', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const eleve = await creerEleve();

    const res = await agent
      .post('/api/eleves/cotisations')
      .set('Idempotency-Key', cle())
      .send({
        eleve_id: eleve.id,
        montant: '50.00',
        mois_concerne: 'Octobre 2026',
        statut_paiement: 'en attente',
      });

    expect(res.status).toBe(201);
    expect(res.body.ecriture_id).toBeNull();
    expect(await ecrituresDe('cotisation_madrasa', res.body.id)).toHaveLength(0);
  });

  it('crée l’écriture une seule fois au passage à « payé »', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const eleve = await creerEleve();

    const creation = await agent
      .post('/api/eleves/cotisations')
      .set('Idempotency-Key', cle())
      .send({
        eleve_id: eleve.id,
        montant: '50.00',
        mois_concerne: 'Novembre 2026',
        statut_paiement: 'en attente',
      });

    await agent
      .put(`/api/eleves/cotisations/${creation.body.id}`)
      .send({ statut_paiement: 'payé' });

    expect(await ecrituresDe('cotisation_madrasa', creation.body.id)).toHaveLength(1);
  });

  it('refuse la modification d’un écolage comptabilisé', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const eleve = await creerEleve();

    const res = await agent
      .post('/api/eleves/cotisations')
      .set('Idempotency-Key', cle())
      .send({
        eleve_id: eleve.id,
        montant: '50.00',
        mois_concerne: 'Décembre 2026',
        statut_paiement: 'payé',
      });

    const modification = await agent
      .put(`/api/eleves/cotisations/${res.body.id}`)
      .send({ montant: '75.00' });
    expect([405, 409]).toContain(modification.status);

    const suppression = await agent.delete(`/api/eleves/cotisations/${res.body.id}`);
    expect([405, 409]).toContain(suppression.status);
  });

  it.each(['50', '50.5', '50.456', '0.00'])('refuse le montant %s', async (montant) => {
    const { agent } = await sessionPour(app, 'tresorier');
    const eleve = await creerEleve();

    const res = await agent
      .post('/api/eleves/cotisations')
      .set('Idempotency-Key', cle())
      .send({ eleve_id: eleve.id, montant, mois_concerne: 'Janvier 2027', statut_paiement: 'payé' });

    expect([400, 422]).toContain(res.status);
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM cotisations_madrasa');
    expect(rows[0].n).toBe(0);
  });

  it('rejoue la même clé sans doubler l’écolage', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const eleve = await creerEleve();
    const k = cle();
    const corps = {
      eleve_id: eleve.id,
      montant: '50.00',
      mois_concerne: 'Février 2027',
      statut_paiement: 'payé',
    };

    const a = await agent.post('/api/eleves/cotisations').set('Idempotency-Key', k).send(corps);
    const b = await agent.post('/api/eleves/cotisations').set('Idempotency-Key', k).send(corps);

    expect(b.body.id).toBe(a.body.id);
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM cotisations_madrasa');
    expect(rows[0].n).toBe(1);
  });
});
