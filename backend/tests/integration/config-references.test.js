/**
 * T087 [US6] — Référentiels configurables : FK, snapshots, état actif et
 * suppression préservant l'historique.
 *
 * Renommer une référence ne doit JAMAIS réécrire le passé : l'opération
 * historique conserve le libellé qu'elle portait au moment de sa saisie.
 */
const { createApp } = require('../../src/app');
const { pool } = require('../../src/config/database');
const { sessionPour } = require('../helpers/auth');
const { creerEleve, cle } = require('../helpers/finance');

const app = createApp();

const TYPES = ['categories-depenses', 'classes-madrasa', 'types-paiement-rh'];

describe('CRUD des référentiels', () => {
  it.each(TYPES)('liste %s', async (type) => {
    const { agent } = await sessionPour(app, 'admin');
    const res = await agent.get(`/api/admin/config/${type}`);
    expect(res.status).toBe(200);
    const items = Array.isArray(res.body) ? res.body : res.body.items;
    expect(Array.isArray(items)).toBe(true);
  });

  it.each(TYPES)('crée une référence dans %s', async (type) => {
    const { agent } = await sessionPour(app, 'admin');
    const nom = `Ref ${type} ${Date.now()}`;
    const res = await agent.post(`/api/admin/config/${type}`).send({ nom });

    expect(res.status).toBe(201);
    expect(res.body.nom).toBe(nom);
    expect(res.body.actif).toBe(true);
  });

  it('refuse un type de configuration inconnu', async () => {
    const { agent } = await sessionPour(app, 'admin');
    for (const type of ['inconnu', 'utilisateurs', '../../etc']) {
      const res = await agent.get(`/api/admin/config/${encodeURIComponent(type)}`);
      expect([400, 404]).toContain(res.status);
    }
  });

  it('refuse un doublon', async () => {
    const { agent } = await sessionPour(app, 'admin');
    const nom = `Doublon ${Date.now()}`;
    expect((await agent.post('/api/admin/config/categories-depenses').send({ nom })).status).toBe(201);
    expect((await agent.post('/api/admin/config/categories-depenses').send({ nom })).status).toBe(409);
  });

  it('refuse un nom vide', async () => {
    const { agent } = await sessionPour(app, 'admin');
    for (const nom of ['', '   ']) {
      const res = await agent.post('/api/admin/config/categories-depenses').send({ nom });
      expect(res.status).toBe(400);
    }
  });

  it('est réservé à l’administrateur', async () => {
    for (const role of ['lecteur', 'tresorier']) {
      const { agent } = await sessionPour(app, role);
      const res = await agent.post('/api/admin/config/categories-depenses').send({ nom: 'X' });
      expect(res.status).toBe(403);
    }
  });
});

describe('état actif', () => {
  it('désactive une référence sans la supprimer', async () => {
    const { agent } = await sessionPour(app, 'admin');
    const creation = await agent
      .post('/api/admin/config/categories-depenses')
      .send({ nom: `À désactiver ${Date.now()}` });

    const res = await agent
      .put(`/api/admin/config/categories-depenses/${creation.body.id}`)
      .send({ actif: false });

    expect(res.status).toBe(200);
    expect(res.body.actif).toBe(false);
  });

  it('n’expose plus une référence désactivée dans /options', async () => {
    const { agent } = await sessionPour(app, 'admin');
    const nom = `Masquée ${Date.now()}`;
    const creation = await agent.post('/api/admin/config/categories-depenses').send({ nom });

    const avant = await agent.get('/api/options');
    expect(avant.body.categories_depenses.some((c) => c.nom === nom)).toBe(true);

    await agent
      .put(`/api/admin/config/categories-depenses/${creation.body.id}`)
      .send({ actif: false });

    const apres = await agent.get('/api/options');
    expect(apres.body.categories_depenses.some((c) => c.nom === nom)).toBe(false);
  });

  it('refuse une nouvelle opération sur une référence désactivée', async () => {
    const { agent } = await sessionPour(app, 'admin');
    const nom = `Classe inactive ${Date.now()}`;
    const creation = await agent.post('/api/admin/config/classes-madrasa').send({ nom });
    await agent.put(`/api/admin/config/classes-madrasa/${creation.body.id}`).send({ actif: false });

    const res = await agent.post('/api/eleves').send({ nom: 'Élève', classe: nom });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INACTIVE_REFERENCE');
  });

  it('accepte une référence active', async () => {
    const { agent } = await sessionPour(app, 'admin');
    const nom = `Classe active ${Date.now()}`;
    await agent.post('/api/admin/config/classes-madrasa').send({ nom });

    const res = await agent.post('/api/eleves').send({ nom: 'Élève', classe: nom });
    expect(res.status).toBe(201);
  });
});

describe('snapshot historique', () => {
  it('un renommage ne réécrit pas les opérations passées', async () => {
    const { agent } = await sessionPour(app, 'admin');
    const nomInitial = `Catégorie ${Date.now()}`;
    const creation = await agent
      .post('/api/admin/config/categories-depenses')
      .send({ nom: nomInitial });

    const depense = await agent
      .post('/api/depenses')
      .set('Idempotency-Key', cle())
      .send({ libelle: 'Achat', montant: '50.00', categorie: nomInitial });
    expect(depense.status).toBe(201);

    await agent
      .put(`/api/admin/config/categories-depenses/${creation.body.id}`)
      .send({ nom: 'Nom Renommé' });

    // La dépense historique garde son libellé d'origine.
    const { rows } = await pool.query('SELECT categorie FROM depenses WHERE id = $1', [
      depense.body.id,
    ]);
    expect(rows[0].categorie).toBe(nomInitial);
  });

  it('un renommage de classe ne réécrit pas les élèves inscrits', async () => {
    const { agent } = await sessionPour(app, 'admin');
    const nomInitial = `Niveau ${Date.now()}`;
    const creation = await agent.post('/api/admin/config/classes-madrasa').send({ nom: nomInitial });

    const eleve = await agent.post('/api/eleves').send({ nom: 'Élève Snapshot', classe: nomInitial });
    expect(eleve.status).toBe(201);

    await agent
      .put(`/api/admin/config/classes-madrasa/${creation.body.id}`)
      .send({ nom: 'Niveau Renommé' });

    const { rows } = await pool.query('SELECT classe FROM eleves WHERE id = $1', [eleve.body.id]);
    expect(rows[0].classe).toBe(nomInitial);
  });
});

describe('suppression history-safe', () => {
  it('refuse de supprimer une référence utilisée', async () => {
    const { agent } = await sessionPour(app, 'admin');
    const nom = `Utilisée ${Date.now()}`;
    const creation = await agent.post('/api/admin/config/categories-depenses').send({ nom });

    await agent
      .post('/api/depenses')
      .set('Idempotency-Key', cle())
      .send({ libelle: 'Achat', montant: '10.00', categorie: nom });

    const res = await agent.delete(`/api/admin/config/categories-depenses/${creation.body.id}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('HISTORY_EXISTS');
  });

  it('supprime une référence inutilisée', async () => {
    const { agent } = await sessionPour(app, 'admin');
    const creation = await agent
      .post('/api/admin/config/categories-depenses')
      .send({ nom: `Inutilisée ${Date.now()}` });

    const res = await agent.delete(`/api/admin/config/categories-depenses/${creation.body.id}`);
    expect(res.status).toBe(200);
  });

  it('audite création, modification et suppression', async () => {
    const { agent } = await sessionPour(app, 'admin');
    const creation = await agent
      .post('/api/admin/config/categories-depenses')
      .send({ nom: `Auditée ${Date.now()}` });
    await agent
      .put(`/api/admin/config/categories-depenses/${creation.body.id}`)
      .send({ nom: 'Auditée modifiée' });
    await agent.delete(`/api/admin/config/categories-depenses/${creation.body.id}`);

    const { rows } = await pool.query(
      `SELECT type_evenement FROM logs_activite
        WHERE type_evenement LIKE 'config.reference.%'`
    );
    const types = rows.map((r) => r.type_evenement);
    expect(types).toEqual(
      expect.arrayContaining([
        'config.reference.created',
        'config.reference.updated',
        'config.reference.deleted',
      ])
    );
  });
});

describe('GET /api/options', () => {
  it('ne retourne que des références actives', async () => {
    const { agent } = await sessionPour(app, 'lecteur');
    const res = await agent.get('/api/options');

    expect(res.status).toBe(200);
    for (const cle of ['categories_depenses', 'classes_madrasa', 'types_paiement_rh']) {
      expect(Array.isArray(res.body[cle])).toBe(true);
      expect(res.body[cle].every((r) => r.actif !== false)).toBe(true);
    }
  });

  it('ne retourne que les caisses actives', async () => {
    const { agent } = await sessionPour(app, 'admin');
    const res = await agent.get('/api/options');
    if (res.body.caisses) {
      expect(res.body.caisses.every((c) => c.actif !== false)).toBe(true);
    }
  });
});
