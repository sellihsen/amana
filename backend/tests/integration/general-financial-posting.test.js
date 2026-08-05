/**
 * T035 [US2] — Dons, cotisations et dépenses : montants EUR exacts,
 * idempotence, et annulation complète si l'audit échoue.
 */
const { createApp } = require('../../src/app');
const { pool } = require('../../src/config/database');
const { sessionPour } = require('../helpers/auth');
const {
  caisseGenerale,
  creerMembre,
  ecrituresDe,
  cle,
} = require('../helpers/finance');

const app = createApp();

/** Les trois flux généraux partagent le même contrat d'écriture. */
const FLUX = [
  {
    nom: 'don',
    chemin: '/api/dons',
    sourceType: 'don',
    typeEcriture: 'DON',
    sens: 'CREDIT',
    champMontant: 'montant',
    corps: async () => ({ caisse_id: (await caisseGenerale()).id, montant: '150.00' }),
  },
  {
    nom: 'cotisation',
    chemin: '/api/cotisations',
    sourceType: 'cotisation',
    typeEcriture: 'COTISATION_MEMBRE',
    sens: 'CREDIT',
    champMontant: 'montant',
    corps: async () => ({
      membre_id: (await creerMembre()).id,
      montant: '120.00',
      annee: 2026,
      mois: 3,
      statut: 'payee',
    }),
  },
  {
    nom: 'depense',
    chemin: '/api/depenses',
    sourceType: 'depense',
    typeEcriture: 'DEPENSE',
    sens: 'DEBIT',
    champMontant: 'montant',
    corps: async () => ({ libelle: 'Électricité', montant: '89.90', categorie: 'electricite' }),
  },
];

describe.each(FLUX)('$nom', (flux) => {
  it('crée la source et son écriture dans la même transaction', async () => {
    const { agent, utilisateur } = await sessionPour(app, 'tresorier');
    const corps = await flux.corps();

    const res = await agent.post(flux.chemin).set('Idempotency-Key', cle()).send(corps);

    expect(res.status).toBe(201);
    expect(res.body.ecriture_id).toBeDefined();

    const ecritures = await ecrituresDe(flux.sourceType, res.body.id);
    expect(ecritures).toHaveLength(1);
    expect(ecritures[0]).toMatchObject({
      type_ecriture: flux.typeEcriture,
      perimetre: 'GENERAL',
      sens: flux.sens,
      devise: 'EUR',
      montant: corps[flux.champMontant],
    });
    expect(ecritures[0].cree_par).toBe(utilisateur.id);
    expect(ecritures[0].acteur_role).toBe('tresorier');
  });

  it('retourne le montant en chaîne EUR à deux décimales', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const corps = await flux.corps();
    const res = await agent.post(flux.chemin).set('Idempotency-Key', cle()).send(corps);

    expect(res.body[flux.champMontant]).toBe(corps[flux.champMontant]);
    expect(res.body[flux.champMontant]).toMatch(/^\d+\.\d{2}$/);
    expect(res.body.devise).toBe('EUR');
  });

  it.each(['125', '125.4', '125.456', '0.00', '-10.00', 'abc', ''])(
    'refuse le montant %s sans rien écrire',
    async (montant) => {
      const { agent } = await sessionPour(app, 'tresorier');
      const corps = { ...(await flux.corps()), [flux.champMontant]: montant };

      const res = await agent.post(flux.chemin).set('Idempotency-Key', cle()).send(corps);

      expect([400, 422]).toContain(res.status);
      const { rows } = await pool.query(
        'SELECT COUNT(*)::int AS n FROM ecritures_financieres WHERE source_type = $1',
        [flux.sourceType]
      );
      expect(rows[0].n).toBe(0);
    }
  );

  it('refuse un montant transmis en nombre JSON', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const corps = { ...(await flux.corps()), [flux.champMontant]: 125.45 };

    const res = await agent.post(flux.chemin).set('Idempotency-Key', cle()).send(corps);
    expect([400, 422]).toContain(res.status);
  });

  it('exige une clé d’idempotence', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const res = await agent.post(flux.chemin).send(await flux.corps());
    expect(res.status).toBe(400);
  });

  it('rejoue la même clé et le même contenu sans créer de doublon', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const corps = await flux.corps();
    const k = cle();

    const premier = await agent.post(flux.chemin).set('Idempotency-Key', k).send(corps);
    const second = await agent.post(flux.chemin).set('Idempotency-Key', k).send(corps);

    expect(premier.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(premier.body.id);

    const { rows } = await pool.query(
      'SELECT COUNT(*)::int AS n FROM ecritures_financieres WHERE source_type = $1',
      [flux.sourceType]
    );
    expect(rows[0].n).toBe(1);
  });

  it('refuse la même clé avec un contenu différent', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const corps = await flux.corps();
    const k = cle();

    await agent.post(flux.chemin).set('Idempotency-Key', k).send(corps);
    const conflit = await agent
      .post(flux.chemin)
      .set('Idempotency-Key', k)
      .send({ ...corps, [flux.champMontant]: '999.99' });

    expect(conflit.status).toBe(409);
    expect(conflit.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('n’écrit rien lorsque l’audit est indisponible', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const corps = await flux.corps();

    // L'écriture d'audit est rendue impossible. La mutation métier doit être
    // annulée entièrement (constitution II).
    try {
      await pool.query(`
        CREATE OR REPLACE FUNCTION _audit_indisponible() RETURNS TRIGGER AS $$
        BEGIN
          RAISE EXCEPTION 'audit indisponible (test)';
        END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER _trg_audit_ko BEFORE INSERT ON logs_activite
          FOR EACH ROW EXECUTE FUNCTION _audit_indisponible();
      `);

      const res = await agent.post(flux.chemin).set('Idempotency-Key', cle()).send(corps);
      expect(res.status).toBeGreaterThanOrEqual(500);

      const { rows } = await pool.query(
        'SELECT COUNT(*)::int AS n FROM ecritures_financieres WHERE source_type = $1',
        [flux.sourceType]
      );
      expect(rows[0].n).toBe(0);
    } finally {
      // Le nettoyage doit survenir même si une assertion échoue : sans lui,
      // tous les tests suivants perdraient la possibilité d'auditer.
      await pool.query('DROP TRIGGER IF EXISTS _trg_audit_ko ON logs_activite');
      await pool.query('DROP FUNCTION IF EXISTS _audit_indisponible()');
    }
  });

  it('audite la création avec l’acteur et la cible', async () => {
    const { agent, utilisateur } = await sessionPour(app, 'tresorier');
    const res = await agent
      .post(flux.chemin)
      .set('Idempotency-Key', cle())
      .send(await flux.corps());

    const { rows } = await pool.query(
      'SELECT * FROM logs_activite WHERE entite_type = $1 AND entite_id = $2',
      [flux.sourceType, String(res.body.id)]
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].utilisateur_id).toBe(utilisateur.id);
    expect(rows[0].resultat).toBe('SUCCES');
  });

  it('refuse la suppression d’une opération comptabilisée', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const res = await agent
      .post(flux.chemin)
      .set('Idempotency-Key', cle())
      .send(await flux.corps());

    const suppression = await agent.delete(`${flux.chemin}/${res.body.id}`);
    expect([405, 409]).toContain(suppression.status);

    const ecritures = await ecrituresDe(flux.sourceType, res.body.id);
    expect(ecritures).toHaveLength(1);
  });
});

describe('don et caisse', () => {
  it('exige une caisse', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const res = await agent
      .post('/api/dons')
      .set('Idempotency-Key', cle())
      .send({ montant: '10.00' });
    expect(res.status).toBe(400);
  });

  it('refuse une caisse inactive', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const c = await caisseGenerale();
    await pool.query('UPDATE caisses SET actif = FALSE WHERE id = $1', [c.id]);

    const res = await agent
      .post('/api/dons')
      .set('Idempotency-Key', cle())
      .send({ caisse_id: c.id, montant: '10.00' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INACTIVE_REFERENCE');
  });

  it('refuse une caisse inexistante', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const res = await agent
      .post('/api/dons')
      .set('Idempotency-Key', cle())
      .send({ caisse_id: 999999, montant: '10.00' });
    expect([400, 404, 409]).toContain(res.status);
  });
});

describe('cotisation non comptabilisée', () => {
  it('reste modifiable tant qu’elle n’est pas payée', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const membre = await creerMembre();

    const creation = await agent
      .post('/api/cotisations')
      .set('Idempotency-Key', cle())
      .send({ membre_id: membre.id, montant: '50.00', annee: 2026, mois: 5, statut: 'en_attente' });

    expect(creation.status).toBe(201);
    expect(creation.body.ecriture_id).toBeNull();

    const modification = await agent
      .put(`/api/cotisations/${creation.body.id}`)
      .send({ montant: '60.00' });
    expect(modification.status).toBe(200);
    expect(modification.body.montant).toBe('60.00');
  });

  it('crée l’écriture une seule fois au passage à « payee »', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const membre = await creerMembre();

    const creation = await agent
      .post('/api/cotisations')
      .set('Idempotency-Key', cle())
      .send({ membre_id: membre.id, montant: '50.00', annee: 2026, mois: 6, statut: 'en_attente' });

    await agent.put(`/api/cotisations/${creation.body.id}`).send({ statut: 'payee' });
    const ecritures = await ecrituresDe('cotisation', creation.body.id);
    expect(ecritures).toHaveLength(1);

    // Une seconde tentative ne peut plus rien changer.
    const reNotification = await agent
      .put(`/api/cotisations/${creation.body.id}`)
      .send({ statut: 'payee' });
    expect([200, 405, 409]).toContain(reNotification.status);
    expect(await ecrituresDe('cotisation', creation.body.id)).toHaveLength(1);
  });
});
