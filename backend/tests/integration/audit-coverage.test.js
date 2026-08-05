/**
 * T072 [US7] — Couverture d'audit de TOUTES les routes mutantes.
 *
 * Constitution II : « Every state-changing request MUST record an audit entry. »
 * Ce test parcourt la matrice complète des mutations : une route qui muterait
 * sans laisser de trace fait échouer la suite.
 */
const { createApp } = require('../../src/app');
const { pool } = require('../../src/config/database');
const { sessionPour } = require('../helpers/auth');
const {
  caisseGenerale,
  caisseSociale,
  creerMembre,
  creerPersonnel,
  creerEleve,
  creerFamille,
  cle,
} = require('../helpers/finance');

const app = createApp();

async function nbAudits() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM logs_activite');
  return rows[0].n;
}

/**
 * Matrice des mutations. Chaque entrée prépare son contexte puis exécute la
 * mutation ; le test vérifie qu'au moins une entrée d'audit en résulte.
 */
const MUTATIONS = [
  {
    nom: 'création de membre',
    executer: (agent) => agent.post('/api/membres').send({ nom: 'Audit Membre' }),
  },
  {
    nom: 'modification de membre',
    executer: async (agent) => {
      const m = await creerMembre('Audit Modif');
      return agent.put(`/api/membres/${m.id}`).send({ nom: 'Modifié' });
    },
  },
  {
    nom: 'suppression de membre',
    executer: async (agent) => {
      const m = await creerMembre('Audit Suppr');
      return agent.delete(`/api/membres/${m.id}`);
    },
  },
  {
    nom: 'création de personnel',
    executer: (agent) =>
      agent.post('/api/personnel').send({ nom: 'Audit RH', role_poste: 'Imam' }),
  },
  {
    nom: 'suppression de personnel',
    executer: async (agent) => {
      const p = await creerPersonnel('Audit RH Suppr');
      return agent.delete(`/api/personnel/${p.id}`);
    },
  },
  {
    nom: 'paiement de salaire',
    executer: async (agent) => {
      const p = await creerPersonnel('Audit Paie');
      return agent
        .post('/api/personnel/paiements')
        .set('Idempotency-Key', cle())
        .send({ personnel_id: p.id, montant_verse: '100.00', mois_concerne: 'Mars 2026' });
    },
  },
  {
    nom: 'création d’élève',
    executer: (agent) => agent.post('/api/eleves').send({ nom: 'Audit Élève' }),
  },
  {
    nom: 'suppression d’élève',
    executer: async (agent) => {
      const e = await creerEleve('Audit Élève Suppr');
      return agent.delete(`/api/eleves/${e.id}`);
    },
  },
  {
    nom: 'écolage',
    executer: async (agent) => {
      const e = await creerEleve('Audit Écolage');
      return agent
        .post('/api/eleves/cotisations')
        .set('Idempotency-Key', cle())
        .send({ eleve_id: e.id, montant: '50.00', mois_concerne: 'Mars 2026', statut_paiement: 'payé' });
    },
  },
  {
    nom: 'don',
    executer: async (agent) => {
      const c = await caisseGenerale();
      return agent
        .post('/api/dons')
        .set('Idempotency-Key', cle())
        .send({ caisse_id: c.id, montant: '10.00' });
    },
  },
  {
    nom: 'cotisation de membre',
    executer: async (agent) => {
      const m = await creerMembre('Audit Cotis');
      return agent
        .post('/api/cotisations')
        .set('Idempotency-Key', cle())
        .send({ membre_id: m.id, montant: '10.00', annee: 2026, statut: 'payee' });
    },
  },
  {
    nom: 'dépense',
    executer: (agent) =>
      agent
        .post('/api/depenses')
        .set('Idempotency-Key', cle())
        .send({ libelle: 'Audit Dépense', montant: '10.00' }),
  },
  {
    nom: 'famille bénéficiaire',
    executer: (agent) => agent.post('/api/social/familles').send({ nom_responsable: 'Audit Famille' }),
  },
  {
    nom: 'modification de famille',
    executer: async (agent) => {
      const f = await creerFamille('Audit Famille Modif');
      return agent.put(`/api/social/familles/${f.id}`).send({ nom_responsable: 'Modifiée' });
    },
  },
  {
    nom: 'suppression de famille',
    executer: async (agent) => {
      const f = await creerFamille('Audit Famille Suppr');
      return agent.delete(`/api/social/familles/${f.id}`);
    },
  },
  {
    nom: 'distribution sociale',
    executer: async (agent) => {
      const c = await caisseSociale();
      const f = await creerFamille('Audit Distrib');
      await agent.post('/api/dons').set('Idempotency-Key', cle()).send({ caisse_id: c.id, montant: '100.00' });
      return agent
        .post('/api/social/distributions')
        .set('Idempotency-Key', cle())
        .send({ famille_id: f.id, caisse_origine_id: c.id, montant_verse: '10.00' });
    },
  },
  {
    nom: 'création de produit en stock',
    executer: (agent) => agent.post('/api/stock').send({ nom: 'Audit Produit' }),
  },
  {
    nom: 'modification de produit',
    executer: async (agent) => {
      const creation = await agent.post('/api/stock').send({ nom: 'Audit Produit Modif' });
      return agent.put(`/api/stock/${creation.body.id}`).send({ nom: 'Modifié' });
    },
  },
  {
    nom: 'suppression de produit',
    executer: async (agent) => {
      const creation = await agent.post('/api/stock').send({ nom: 'Audit Produit Suppr' });
      return agent.delete(`/api/stock/${creation.body.id}`);
    },
  },
  {
    nom: 'contre-écriture',
    executer: async (agent) => {
      const c = await caisseGenerale();
      const don = await agent
        .post('/api/dons')
        .set('Idempotency-Key', cle())
        .send({ caisse_id: c.id, montant: '10.00' });
      const { rows } = await pool.query(
        "SELECT id FROM ecritures_financieres WHERE source_type = 'don' AND source_id = $1",
        [don.body.id]
      );
      return agent
        .post(`/api/ecritures-financieres/${rows[0].id}/contre-ecritures`)
        .set('Idempotency-Key', cle())
        .send({ motif: 'Audit contre-écriture' });
    },
  },
];

/** Mutations réservées aux administrateurs. */
const MUTATIONS_ADMIN = [
  {
    nom: 'création de caisse',
    executer: (agent) => agent.post('/api/admin/caisses').send({ nom: `Caisse Audit ${Date.now()}` }),
  },
  {
    nom: 'modification de caisse',
    executer: async (agent) => {
      const c = await caisseGenerale();
      return agent.put(`/api/admin/caisses/${c.id}`).send({ description: 'Modifiée' });
    },
  },
  {
    nom: 'création de référence de configuration',
    executer: (agent) =>
      agent.post('/api/admin/config/categories-depenses').send({ nom: `Audit ${Date.now()}` }),
  },
  {
    nom: 'modification du projet',
    executer: (agent) => agent.put('/api/admin/projet').send({ capacite_totale: 8000 }),
  },
  {
    nom: 'création d’utilisateur',
    executer: (agent) =>
      agent.post('/api/admin/users').send({
        nom: 'Audit User',
        email: `audit.${Date.now()}@test.local`,
        mot_de_passe: 'MotDePasseFort!2026',
        role: 'lecteur',
      }),
  },
];

describe.each(MUTATIONS)('$nom', ({ executer }) => {
  it('laisse une trace d’audit', async () => {
    const { agent, utilisateur } = await sessionPour(app, 'tresorier');
    const avant = await nbAudits();

    const res = await executer(agent);
    expect(res.status).toBeLessThan(400);

    const apres = await nbAudits();
    expect(apres).toBeGreaterThan(avant);

    const { rows } = await pool.query(
      'SELECT * FROM logs_activite ORDER BY id DESC LIMIT 1'
    );
    expect(rows[0].utilisateur_id).toBe(utilisateur.id);
    expect(rows[0].acteur_role).toBe('tresorier');
    expect(rows[0].type_evenement).not.toBe('legacy.activity');
    expect(rows[0].entite_type).not.toBeNull();
  });
});

describe.each(MUTATIONS_ADMIN)('$nom (admin)', ({ executer }) => {
  it('laisse une trace d’audit', async () => {
    const { agent, utilisateur } = await sessionPour(app, 'admin');
    const avant = await nbAudits();

    const res = await executer(agent);
    expect(res.status).toBeLessThan(400);

    expect(await nbAudits()).toBeGreaterThan(avant);

    const { rows } = await pool.query('SELECT * FROM logs_activite ORDER BY id DESC LIMIT 1');
    expect(rows[0].utilisateur_id).toBe(utilisateur.id);
    expect(rows[0].type_evenement).not.toBe('legacy.activity');
  });
});

describe('qualité des traces', () => {
  it('aucune route mutante n’utilise encore le chemin hérité', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    await agent.post('/api/membres').send({ nom: 'Vérif Legacy' });

    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS n FROM logs_activite WHERE type_evenement = 'legacy.activity'"
    );
    expect(rows[0].n).toBe(0);
  });

  it('enregistre l’adresse IP et le request id', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    await agent.post('/api/membres').send({ nom: 'Vérif Contexte' });

    const { rows } = await pool.query(
      "SELECT * FROM logs_activite WHERE type_evenement = 'member.created' ORDER BY id DESC LIMIT 1"
    );
    expect(rows[0].ip).not.toBeNull();
    expect(rows[0].request_id).not.toBeNull();
  });

  it('conserve l’état avant et après une modification', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const membre = await creerMembre('État Avant');
    await agent.put(`/api/membres/${membre.id}`).send({ nom: 'État Après' });

    const { rows } = await pool.query(
      "SELECT * FROM logs_activite WHERE type_evenement = 'member.updated' ORDER BY id DESC LIMIT 1"
    );
    expect(rows[0].avant.nom).toBe('État Avant');
    expect(rows[0].apres.nom).toBe('État Après');
  });

  it('ne consigne jamais de secret', async () => {
    const { agent } = await sessionPour(app, 'admin');
    await agent.post('/api/admin/users').send({
      nom: 'Secret',
      email: `secret.${Date.now()}@test.local`,
      mot_de_passe: 'MotDePasseFort!2026',
      role: 'lecteur',
    });

    const { rows } = await pool.query('SELECT * FROM logs_activite');
    const serialise = JSON.stringify(rows);
    expect(serialise).not.toMatch(/MotDePasseFort!2026/);
    expect(serialise).not.toMatch(/\$2[aby]\$/);
  });

  it('n’enregistre rien pour une lecture', async () => {
    const { agent } = await sessionPour(app, 'lecteur');
    const avant = await nbAudits();

    await agent.get('/api/membres');
    await agent.get('/api/dons');
    await agent.get('/api/dashboard');

    expect(await nbAudits()).toBe(avant);
  });
});
