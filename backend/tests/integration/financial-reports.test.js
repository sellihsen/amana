/**
 * T038 [US2] — Rapports : agrégats SQL, douze mois, période vide, indicateurs
 * RH/Madrasa, opérations récentes et bilan annuel rapprochable.
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
  ecrituresDe,
  cle,
} = require('../helpers/finance');

const app = createApp();

/** Jeu de données couvrant les six flux, en périmètre GENERAL et SOCIAL. */
async function jeuComplet(agent) {
  const cg = await caisseGenerale();
  const cs = await caisseSociale();
  const membre = await creerMembre();
  const employe = await creerPersonnel();
  const eleve = await creerEleve();
  const famille = await creerFamille();

  const don = await agent
    .post('/api/dons')
    .set('Idempotency-Key', cle())
    .send({ caisse_id: cg.id, montant: '1000.00', date_don: '2026-03-10' });

  const donSocial = await agent
    .post('/api/dons')
    .set('Idempotency-Key', cle())
    .send({ caisse_id: cs.id, montant: '500.00', date_don: '2026-03-11' });

  const cotisation = await agent
    .post('/api/cotisations')
    .set('Idempotency-Key', cle())
    .send({
      membre_id: membre.id,
      montant: '120.00',
      annee: 2026,
      mois: 3,
      statut: 'payee',
      date_paiement: '2026-03-12',
    });

  const ecolage = await agent
    .post('/api/eleves/cotisations')
    .set('Idempotency-Key', cle())
    .send({
      eleve_id: eleve.id,
      montant: '50.00',
      mois_concerne: 'Mars 2026',
      statut_paiement: 'payé',
      date_paiement: '2026-03-13',
    });

  const depense = await agent
    .post('/api/depenses')
    .set('Idempotency-Key', cle())
    .send({ libelle: 'Électricité', montant: '200.00', date_depense: '2026-03-14' });

  const salaire = await agent
    .post('/api/personnel/paiements')
    .set('Idempotency-Key', cle())
    .send({
      personnel_id: employe.id,
      montant_verse: '800.00',
      mois_concerne: 'Mars 2026',
      date_versement: '2026-03-15',
    });

  const distribution = await agent
    .post('/api/social/distributions')
    .set('Idempotency-Key', cle())
    .send({
      famille_id: famille.id,
      caisse_origine_id: cs.id,
      montant_verse: '200.00',
      date_versement: '2026-03-16',
    });

  for (const r of [don, donSocial, cotisation, ecolage, depense, salaire, distribution]) {
    expect(r.status).toBe(201);
  }

  return { don, donSocial, cotisation, ecolage, depense, salaire, distribution, cg, cs };
}

describe('GET /api/finances/resume', () => {
  it('retourne des chaînes EUR et exclut SOCIAL des totaux généraux', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    await jeuComplet(agent);

    const res = await agent.get('/api/finances/resume');
    expect(res.status).toBe(200);

    // Entrées GENERAL : don 1000 + cotisation 120 + écolage 50 = 1170
    expect(res.body.total_dons).toBe('1000.00');
    expect(res.body.total_cotisations).toBe('120.00');
    expect(res.body.total_madrasa).toBe('50.00');
    expect(res.body.total_entrees).toBe('1170.00');

    // Sorties GENERAL : dépense 200 + salaire 800 = 1000
    expect(res.body.total_depenses_directes).toBe('200.00');
    expect(res.body.total_salaires).toBe('800.00');
    expect(res.body.total_depenses).toBe('1000.00');

    expect(res.body.solde).toBe('170.00');

    // Le don Social (500) et la distribution (200) n'entrent pas dans le général.
    expect(res.body.total_dons).not.toBe('1500.00');
  });

  it('retourne des zéros exacts quand aucune opération n’existe', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const res = await agent.get('/api/finances/resume');

    for (const champ of [
      'total_dons',
      'total_cotisations',
      'total_madrasa',
      'total_entrees',
      'total_depenses_directes',
      'total_salaires',
      'total_depenses',
      'solde',
    ]) {
      expect(res.body[champ]).toBe('0.00');
    }
  });

  it('déduit une contre-écriture du total', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const jeu = await jeuComplet(agent);
    const [origine] = await ecrituresDe('don', jeu.don.body.id);

    await agent
      .post(`/api/ecritures-financieres/${origine.id}/contre-ecritures`)
      .set('Idempotency-Key', cle())
      .send({ motif: 'Don annulé' });

    const res = await agent.get('/api/finances/resume');
    expect(res.body.total_dons).toBe('0.00');
    expect(res.body.total_entrees).toBe('170.00');
    expect(res.body.solde).toBe('-830.00');
  });
});

describe('GET /api/dashboard', () => {
  it('expose douze mois, même sans opération', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const res = await agent.get('/api/dashboard').query({ annee: 2026 });

    expect(res.status).toBe(200);
    expect(res.body.evolution_mensuelle).toHaveLength(12);
    for (const mois of res.body.evolution_mensuelle) {
      expect(mois.entrees).toMatch(/^\d+\.\d{2}$/);
      expect(mois.sorties).toMatch(/^\d+\.\d{2}$/);
    }
  });

  it('place chaque opération dans son mois', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    await jeuComplet(agent);

    const res = await agent.get('/api/dashboard').query({ annee: 2026 });
    const mars = res.body.evolution_mensuelle.find((m) => m.mois === 3);

    expect(mars.entrees).toBe('1170.00');
    expect(mars.sorties).toBe('1000.00');

    const janvier = res.body.evolution_mensuelle.find((m) => m.mois === 1);
    expect(janvier.entrees).toBe('0.00');
    expect(janvier.sorties).toBe('0.00');
  });

  it('fournit les indicateurs RH et Madrasa', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    await jeuComplet(agent);

    const res = await agent.get('/api/dashboard').query({ annee: 2026 });
    expect(res.body.rh).toMatchObject({ total_salaires_verses: '800.00' });
    expect(res.body.rh.effectif_actif).toBeGreaterThanOrEqual(1);
    expect(res.body.madrasa).toMatchObject({ total_ecolages: '50.00' });
    expect(res.body.madrasa.eleves_actifs).toBeGreaterThanOrEqual(1);
  });

  it('liste les opérations récentes en chaînes EUR', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    await jeuComplet(agent);

    const res = await agent.get('/api/dashboard').query({ annee: 2026 });
    expect(Array.isArray(res.body.operations_recentes)).toBe(true);
    expect(res.body.operations_recentes.length).toBeGreaterThan(0);
    for (const op of res.body.operations_recentes) {
      expect(op.montant).toMatch(/^\d+\.\d{2}$/);
      expect(op.type).toBeDefined();
      expect(op.date_effet).toBeDefined();
    }
  });

  it('sépare le périmètre Social du solde général', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    await jeuComplet(agent);

    const res = await agent.get('/api/dashboard').query({ annee: 2026 });
    expect(res.body.general.solde).toBe('170.00');
    expect(res.body.social.total_collecte).toBe('500.00');
    expect(res.body.social.total_distribue).toBe('200.00');
    expect(res.body.social.reste_disponible).toBe('300.00');
  });
});

describe('GET /api/bilans/generate', () => {
  it('utilise l’année civile [1er janvier, 1er janvier suivant)', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const cg = await caisseGenerale();

    await agent
      .post('/api/dons')
      .set('Idempotency-Key', cle())
      .send({ caisse_id: cg.id, montant: '10.00', date_don: '2025-12-31' });
    await agent
      .post('/api/dons')
      .set('Idempotency-Key', cle())
      .send({ caisse_id: cg.id, montant: '20.00', date_don: '2026-01-01' });
    await agent
      .post('/api/dons')
      .set('Idempotency-Key', cle())
      .send({ caisse_id: cg.id, montant: '40.00', date_don: '2026-12-31' });
    await agent
      .post('/api/dons')
      .set('Idempotency-Key', cle())
      .send({ caisse_id: cg.id, montant: '80.00', date_don: '2027-01-01' });

    const res = await agent.get('/api/bilans/generate').query({ annee: 2026 });
    expect(res.status).toBe(200);
    expect(res.body.total_dons).toBe('60.00');
  });

  it('contient une section Social séparée', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    await jeuComplet(agent);

    const res = await agent.get('/api/bilans/generate').query({ annee: 2026 });
    expect(res.body.social).toMatchObject({
      total_collecte: '500.00',
      total_distribue: '200.00',
      reste_disponible: '300.00',
    });
    expect(res.body.total_dons).toBe('1000.00');
  });

  it('se rapproche du détail du grand livre', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    await jeuComplet(agent);

    const bilan = await agent.get('/api/bilans/generate').query({ annee: 2026 });
    const livre = await agent
      .get('/api/ecritures-financieres')
      .query({ perimetre: 'GENERAL', date_from: '2026-01-01', date_to: '2026-12-31', limit: 500 });

    // Somme signée du grand livre = solde du bilan, calculée en SQL.
    const { rows } = await pool.query(`
      SELECT COALESCE(SUM(montant * CASE sens WHEN 'CREDIT' THEN 1 ELSE -1 END), 0)::TEXT AS solde
        FROM ecritures_financieres
       WHERE perimetre = 'GENERAL'
         AND date_effet >= DATE '2026-01-01' AND date_effet < DATE '2027-01-01'
    `);

    expect(bilan.body.solde).toBe(Number(rows[0].solde).toFixed(2));
    expect(livre.body.total).toBeGreaterThan(0);
  });

  it('retourne des zéros exacts pour une année sans opération', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const res = await agent.get('/api/bilans/generate').query({ annee: 1999 });

    expect(res.status).toBe(200);
    expect(res.body.total_dons).toBe('0.00');
    expect(res.body.solde).toBe('0.00');
    expect(res.body.social.reste_disponible).toBe('0.00');
  });

  it('refuse une année invalide sans l’interpoler', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    for (const annee of ['abc', "2026'; DROP TABLE dons; --", '99999', '-1']) {
      const res = await agent.get('/api/bilans/generate').query({ annee });
      expect([400, 422]).toContain(res.status);
    }

    const { rows } = await pool.query("SELECT to_regclass('public.dons') AS t");
    expect(rows[0].t).not.toBeNull();
  });
});

describe('aucun calcul monétaire en JavaScript', () => {
  const fs = require('fs');
  const path = require('path');
  const FICHIERS = [
    'routes/dashboard.js',
    'routes/finances.js',
    'routes/bilans.js',
    'routes/social.js',
    'queries/finances.js',
  ].map((f) => path.join(__dirname, '..', '..', 'src', f));

  /** Retire commentaires de bloc et de ligne : la règle porte sur le code. */
  function codeSeul(source) {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  }

  it.each(FICHIERS)('%s ne totalise aucun montant en JS', (fichier) => {
    if (!fs.existsSync(fichier)) return;
    const contenu = codeSeul(fs.readFileSync(fichier, 'utf8'));

    expect(contenu).not.toMatch(/parseFloat/);
    expect(contenu).not.toMatch(/Number\([^)]*(montant|total|solde)/i);
    expect(contenu).not.toMatch(/\.reduce\(/);
  });
});

describe('totaux des listes calculés en SQL', () => {
  /** Chaque liste financière expose ses totaux, calculés par PostgreSQL. */
  const LISTES = [
    ['/api/dons', 'montant'],
    ['/api/depenses', 'montant'],
    ['/api/cotisations', 'montant'],
    ['/api/personnel/paiements/tous', 'montant_verse'],
    ['/api/eleves/cotisations/toutes', 'montant'],
  ];

  it.each(LISTES)('%s retourne { items, totaux }', async (chemin) => {
    const { agent } = await sessionPour(app, 'tresorier');
    const res = await agent.get(chemin);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.totaux).toBeDefined();
    expect(res.body.totaux.montant).toMatch(/^-?\d+\.\d{2}$/);
    expect(res.body.totaux.nombre).toEqual(expect.any(Number));
  });

  it.each(LISTES)('%s retourne un zéro exact sur une liste vide', async (chemin) => {
    const { agent } = await sessionPour(app, 'tresorier');
    const res = await agent.get(chemin);

    expect(res.body.items).toHaveLength(0);
    expect(res.body.totaux.montant).toBe('0.00');
    expect(res.body.totaux.nombre).toBe(0);
  });

  it('totalise les dons exactement, sans arrondi flottant', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const cg = await caisseGenerale();

    // 0.1 + 0.2 est le cas classique où le flottant dérive.
    for (const montant of ['0.10', '0.20']) {
      await agent
        .post('/api/dons')
        .set('Idempotency-Key', cle())
        .send({ caisse_id: cg.id, montant });
    }

    const res = await agent.get('/api/dons');
    expect(res.body.totaux.montant).toBe('0.30');
    expect(res.body.totaux.nombre).toBe(2);
  });

  it('exclut une opération annulée du total', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const cg = await caisseGenerale();

    const don = await agent
      .post('/api/dons')
      .set('Idempotency-Key', cle())
      .send({ caisse_id: cg.id, montant: '500.00' });
    await agent
      .post('/api/dons')
      .set('Idempotency-Key', cle())
      .send({ caisse_id: cg.id, montant: '100.00' });

    const [origine] = await ecrituresDe('don', don.body.id);
    await agent
      .post(`/api/ecritures-financieres/${origine.id}/contre-ecritures`)
      .set('Idempotency-Key', cle())
      .send({ motif: 'Erreur' });

    const res = await agent.get('/api/dons');
    expect(res.body.totaux.montant).toBe('100.00');
    // La ligne annulée reste visible, marquée comme telle.
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items.some((d) => d.est_annulee)).toBe(true);
  });
});

describe('aucun total monétaire calculé dans l’interface', () => {
  const fs = require('fs');
  const path = require('path');
  const racine = path.join(__dirname, '..', '..', '..', 'frontend', 'src');

  const FICHIERS = [];
  (function parcourir(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entree of fs.readdirSync(dir, { withFileTypes: true })) {
      const complet = path.join(dir, entree.name);
      if (entree.isDirectory() && entree.name !== 'test') parcourir(complet);
      else if (/\.(js|jsx)$/.test(entree.name)) FICHIERS.push(complet);
    }
  })(racine);

  function codeSeul(source) {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  }

  it.each(FICHIERS)('%s ne somme aucun montant', (fichier) => {
    const contenu = codeSeul(fs.readFileSync(fichier, 'utf8'));

    // Constitution I : l'interface met en forme, elle ne totalise pas.
    expect(contenu).not.toMatch(/\.reduce\(\s*\([^)]*\)\s*=>[^)]*parseFloat/s);
    expect(contenu).not.toMatch(/parseFloat\([^)]*\)\s*[+\-]/);
    expect(contenu).not.toMatch(/[+\-]\s*parseFloat\(/);
  });
});
