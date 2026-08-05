/**
 * T064 [US4] — Distributions sociales : caisse active/Social, solde,
 * concurrence et rollback.
 *
 * Le grand livre est l'autorité : aucun solde n'est stocké, il est recalculé
 * sous verrou de caisse à chaque mutation.
 */
const request = require('supertest');
const { createApp } = require('../../src/app');
const { pool } = require('../../src/config/database');
const { sessionPour, creerUtilisateur, MOT_DE_PASSE_VALIDE } = require('../helpers/auth');
const { caisseSociale, caisseGenerale, creerFamille, cle } = require('../helpers/finance');

const app = createApp();

/** Crédite une caisse Social d'un don, et retourne la caisse. */
async function crediterSocial(agent, montant = '1000.00') {
  const caisse = await caisseSociale();
  const res = await agent
    .post('/api/dons')
    .set('Idempotency-Key', cle())
    .send({ caisse_id: caisse.id, montant });
  expect(res.status).toBe(201);
  return caisse;
}

describe('validation de la caisse', () => {
  it('refuse une caisse qui n’est pas affectée Social', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const famille = await creerFamille();
    const generale = await caisseGenerale();

    const res = await agent
      .post('/api/social/distributions')
      .set('Idempotency-Key', cle())
      .send({ famille_id: famille.id, caisse_origine_id: generale.id, montant_verse: '10.00' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INACTIVE_REFERENCE');
  });

  it('refuse une caisse désactivée', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const famille = await creerFamille();
    const caisse = await crediterSocial(agent);
    await pool.query('UPDATE caisses SET actif = FALSE WHERE id = $1', [caisse.id]);

    const res = await agent
      .post('/api/social/distributions')
      .set('Idempotency-Key', cle())
      .send({ famille_id: famille.id, caisse_origine_id: caisse.id, montant_verse: '10.00' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INACTIVE_REFERENCE');
  });

  it('refuse une famille inexistante', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const caisse = await crediterSocial(agent);

    const res = await agent
      .post('/api/social/distributions')
      .set('Idempotency-Key', cle())
      .send({ famille_id: 999999, caisse_origine_id: caisse.id, montant_verse: '10.00' });

    expect(res.status).toBe(404);
  });
});

describe('solde disponible', () => {
  it('autorise une distribution partielle et met à jour le bilan', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const famille = await creerFamille();
    const caisse = await crediterSocial(agent, '1000.00');

    const res = await agent
      .post('/api/social/distributions')
      .set('Idempotency-Key', cle())
      .send({ famille_id: famille.id, caisse_origine_id: caisse.id, montant_verse: '250.00' });

    expect(res.status).toBe(201);
    expect(res.body.montant_verse).toBe('250.00');

    const bilan = await agent.get('/api/social/bilan');
    expect(bilan.body.total_collecte).toBe('1000.00');
    expect(bilan.body.total_distribue).toBe('250.00');
    expect(bilan.body.reste_disponible).toBe('750.00');
  });

  it('autorise une distribution égale au disponible', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const famille = await creerFamille();
    const caisse = await crediterSocial(agent, '300.00');

    const res = await agent
      .post('/api/social/distributions')
      .set('Idempotency-Key', cle())
      .send({ famille_id: famille.id, caisse_origine_id: caisse.id, montant_verse: '300.00' });

    expect(res.status).toBe(201);

    const bilan = await agent.get('/api/social/bilan');
    expect(bilan.body.reste_disponible).toBe('0.00');
  });

  it('refuse un dépassement du disponible sans rien écrire', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const famille = await creerFamille();
    const caisse = await crediterSocial(agent, '100.00');

    const res = await agent
      .post('/api/social/distributions')
      .set('Idempotency-Key', cle())
      .send({ famille_id: famille.id, caisse_origine_id: caisse.id, montant_verse: '100.01' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('SOCIAL_BALANCE_INSUFFICIENT');

    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM distributions_sociales');
    expect(rows[0].n).toBe(0);

    const bilan = await agent.get('/api/social/bilan');
    expect(bilan.body.reste_disponible).toBe('100.00');
  });

  it('refuse une distribution sur une caisse vide', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const famille = await creerFamille();
    const caisse = await caisseSociale();

    const res = await agent
      .post('/api/social/distributions')
      .set('Idempotency-Key', cle())
      .send({ famille_id: famille.id, caisse_origine_id: caisse.id, montant_verse: '0.01' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('SOCIAL_BALANCE_INSUFFICIENT');
  });

  it('le disponible ne devient jamais négatif après une série de distributions', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const famille = await creerFamille();
    const caisse = await crediterSocial(agent, '100.00');

    for (let i = 0; i < 5; i += 1) {
      await agent
        .post('/api/social/distributions')
        .set('Idempotency-Key', cle())
        .send({ famille_id: famille.id, caisse_origine_id: caisse.id, montant_verse: '30.00' });
    }

    const { rows } = await pool.query(
      `SELECT COALESCE(SUM(montant * CASE sens WHEN 'CREDIT' THEN 1 ELSE -1 END), 0)::TEXT AS solde
         FROM ecritures_financieres WHERE perimetre = 'SOCIAL' AND caisse_id = $1`,
      [caisse.id]
    );
    expect(Number(rows[0].solde)).toBeGreaterThanOrEqual(0);
  });
});

describe('concurrence', () => {
  it('sérialise deux distributions concurrentes et en refuse une', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const famille = await creerFamille();
    const caisse = await crediterSocial(agent, '100.00');

    // Deux sessions distinctes, deux requêtes réellement simultanées.
    const utilisateurA = await creerUtilisateur({ role: 'tresorier' });
    const utilisateurB = await creerUtilisateur({ role: 'tresorier' });
    const agentA = request.agent(app);
    const agentB = request.agent(app);
    await agentA
      .post('/api/auth/login')
      .send({ email: utilisateurA.email, mot_de_passe: MOT_DE_PASSE_VALIDE });
    await agentB
      .post('/api/auth/login')
      .send({ email: utilisateurB.email, mot_de_passe: MOT_DE_PASSE_VALIDE });

    const corps = {
      famille_id: famille.id,
      caisse_origine_id: caisse.id,
      montant_verse: '80.00',
    };

    const [a, b] = await Promise.all([
      agentA.post('/api/social/distributions').set('Idempotency-Key', cle()).send(corps),
      agentB.post('/api/social/distributions').set('Idempotency-Key', cle()).send(corps),
    ]);

    const statuts = [a.status, b.status].sort();
    // Une seule des deux peut aboutir : 80 + 80 > 100.
    expect(statuts).toEqual([201, 409]);

    const refusee = a.status === 409 ? a : b;
    expect(refusee.body.code).toBe('SOCIAL_BALANCE_INSUFFICIENT');

    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM distributions_sociales');
    expect(rows[0].n).toBe(1);
  });

  it('sérialise dons et distributions sur la même caisse', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const famille = await creerFamille();
    const caisse = await crediterSocial(agent, '100.00');

    const [don, distribution] = await Promise.all([
      agent
        .post('/api/dons')
        .set('Idempotency-Key', cle())
        .send({ caisse_id: caisse.id, montant: '50.00' }),
      agent
        .post('/api/social/distributions')
        .set('Idempotency-Key', cle())
        .send({ famille_id: famille.id, caisse_origine_id: caisse.id, montant_verse: '100.00' }),
    ]);

    expect(don.status).toBe(201);
    expect(distribution.status).toBe(201);

    const bilan = await agent.get('/api/social/bilan');
    expect(bilan.body.reste_disponible).toBe('50.00');
  });
});

describe('idempotence et rollback', () => {
  it('rejoue la même clé sans doubler la distribution', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const famille = await creerFamille();
    const caisse = await crediterSocial(agent, '1000.00');
    const k = cle();
    const corps = {
      famille_id: famille.id,
      caisse_origine_id: caisse.id,
      montant_verse: '100.00',
    };

    const a = await agent.post('/api/social/distributions').set('Idempotency-Key', k).send(corps);
    const b = await agent.post('/api/social/distributions').set('Idempotency-Key', k).send(corps);

    expect(a.status).toBe(201);
    expect(b.body.id).toBe(a.body.id);

    const bilan = await agent.get('/api/social/bilan');
    expect(bilan.body.total_distribue).toBe('100.00');
  });

  it('annule tout lorsque l’audit échoue', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const famille = await creerFamille();
    const caisse = await crediterSocial(agent, '1000.00');

    try {
      await pool.query(`
        CREATE OR REPLACE FUNCTION _audit_ko_social() RETURNS TRIGGER AS $$
        BEGIN RAISE EXCEPTION 'audit indisponible (test)'; END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER _trg_audit_ko_social BEFORE INSERT ON logs_activite
          FOR EACH ROW EXECUTE FUNCTION _audit_ko_social();
      `);

      const res = await agent
        .post('/api/social/distributions')
        .set('Idempotency-Key', cle())
        .send({ famille_id: famille.id, caisse_origine_id: caisse.id, montant_verse: '100.00' });
      expect(res.status).toBeGreaterThanOrEqual(500);

      const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM distributions_sociales');
      expect(rows[0].n).toBe(0);
    } finally {
      await pool.query('DROP TRIGGER IF EXISTS _trg_audit_ko_social ON logs_activite');
      await pool.query('DROP FUNCTION IF EXISTS _audit_ko_social()');
    }
  });

  it('exige une clé d’idempotence', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const famille = await creerFamille();
    const caisse = await crediterSocial(agent);

    const res = await agent
      .post('/api/social/distributions')
      .send({ famille_id: famille.id, caisse_origine_id: caisse.id, montant_verse: '10.00' });
    expect(res.status).toBe(400);
  });
});

describe('séparation des périmètres', () => {
  it('une distribution sociale n’affecte jamais le solde général', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const famille = await creerFamille();
    const caisse = await crediterSocial(agent, '500.00');

    const avant = await agent.get('/api/finances/resume');

    await agent
      .post('/api/social/distributions')
      .set('Idempotency-Key', cle())
      .send({ famille_id: famille.id, caisse_origine_id: caisse.id, montant_verse: '200.00' });

    const apres = await agent.get('/api/finances/resume');
    expect(apres.body.solde).toBe(avant.body.solde);
    expect(apres.body.total_depenses).toBe(avant.body.total_depenses);
  });

  it('un don Social n’entre pas dans les totaux généraux', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const avant = await agent.get('/api/finances/resume');

    await crediterSocial(agent, '500.00');

    const apres = await agent.get('/api/finances/resume');
    expect(apres.body.total_dons).toBe(avant.body.total_dons);
  });
});

describe('permissions', () => {
  it('refuse la distribution à un lecteur', async () => {
    const { agent: tresorier } = await sessionPour(app, 'tresorier');
    const famille = await creerFamille();
    const caisse = await crediterSocial(tresorier);

    const { agent: lecteur } = await sessionPour(app, 'lecteur');
    const res = await lecteur
      .post('/api/social/distributions')
      .set('Idempotency-Key', cle())
      .send({ famille_id: famille.id, caisse_origine_id: caisse.id, montant_verse: '10.00' });

    expect(res.status).toBe(403);
  });

  it('autorise la distribution à un trésorier', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const famille = await creerFamille();
    const caisse = await crediterSocial(agent);

    const res = await agent
      .post('/api/social/distributions')
      .set('Idempotency-Key', cle())
      .send({ famille_id: famille.id, caisse_origine_id: caisse.id, montant_verse: '10.00' });

    expect(res.status).toBe(201);
  });
});

describe('statut de la famille (T067)', () => {
  it('refuse un versement à une famille désactivée', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const famille = await creerFamille();
    const caisse = await crediterSocial(agent, '500.00');

    await pool.query("UPDATE familles_necessiteuses SET statut = 'inactif' WHERE id = $1", [
      famille.id,
    ]);

    const res = await agent
      .post('/api/social/distributions')
      .set('Idempotency-Key', cle())
      .send({ famille_id: famille.id, caisse_origine_id: caisse.id, montant_verse: '10.00' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INACTIVE_REFERENCE');
  });

  it('refuse de supprimer une famille ayant reçu de l’aide', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const famille = await creerFamille();
    const caisse = await crediterSocial(agent, '500.00');

    await agent
      .post('/api/social/distributions')
      .set('Idempotency-Key', cle())
      .send({ famille_id: famille.id, caisse_origine_id: caisse.id, montant_verse: '50.00' });

    const res = await agent.delete(`/api/social/familles/${famille.id}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('HISTORY_EXISTS');

    const { rows } = await pool.query(
      'SELECT COUNT(*)::int AS n FROM distributions_sociales WHERE famille_id = $1',
      [famille.id]
    );
    expect(rows[0].n).toBe(1);
  });

  it('la contrainte RESTRICT protège en base', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const famille = await creerFamille();
    const caisse = await crediterSocial(agent, '500.00');
    await agent
      .post('/api/social/distributions')
      .set('Idempotency-Key', cle())
      .send({ famille_id: famille.id, caisse_origine_id: caisse.id, montant_verse: '50.00' });

    await expect(
      pool.query('DELETE FROM familles_necessiteuses WHERE id = $1', [famille.id])
    ).rejects.toThrow();
  });
});
