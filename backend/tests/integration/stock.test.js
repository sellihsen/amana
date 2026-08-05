/**
 * T080 [US5] — Stock : entrées/sorties, idempotence, concurrence, dépassement
 * et audit.
 *
 * Constitution I : la variation est une arithmétique EN BASE, conditionnelle.
 * Un stock ne devient jamais négatif et une sortie excessive est REFUSÉE, pas
 * ramenée à zéro.
 */
const request = require('supertest');
const { createApp } = require('../../src/app');
const { pool } = require('../../src/config/database');
const { sessionPour, creerUtilisateur, MOT_DE_PASSE_VALIDE } = require('../helpers/auth');
const { cle } = require('../helpers/finance');

const app = createApp();

async function creerProduit(agent, quantite = 100, seuil = 10) {
  const res = await agent.post('/api/stock').send({
    nom: `Produit ${Date.now()}-${Math.random()}`,
    categorie: 'Construction',
    quantite_actuelle: quantite,
    quantite_minimale_alerte: seuil,
    unite: 'Sacs',
  });
  expect(res.status).toBe(201);
  return res.body;
}

async function quantite(id) {
  const { rows } = await pool.query('SELECT quantite_actuelle FROM produits_stock WHERE id = $1', [
    id,
  ]);
  return rows[0].quantite_actuelle;
}

describe('POST /api/stock/{id}/mouvements', () => {
  it('enregistre une entrée et retourne avant/après', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const produit = await creerProduit(agent, 100);

    const res = await agent
      .post(`/api/stock/${produit.id}/mouvements`)
      .set('Idempotency-Key', cle())
      .send({ type: 'ENTREE', quantite: 25, motif: 'Livraison' });

    expect(res.status).toBe(201);
    expect(res.body.quantite_avant).toBe(100);
    expect(res.body.quantite_apres).toBe(125);
    expect(await quantite(produit.id)).toBe(125);
  });

  it('enregistre une sortie', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const produit = await creerProduit(agent, 100);

    const res = await agent
      .post(`/api/stock/${produit.id}/mouvements`)
      .set('Idempotency-Key', cle())
      .send({ type: 'SORTIE', quantite: 30, motif: 'Utilisation chantier' });

    expect(res.status).toBe(201);
    expect(res.body.quantite_apres).toBe(70);
    expect(await quantite(produit.id)).toBe(70);
  });

  it('autorise une sortie égale au stock', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const produit = await creerProduit(agent, 40);

    const res = await agent
      .post(`/api/stock/${produit.id}/mouvements`)
      .set('Idempotency-Key', cle())
      .send({ type: 'SORTIE', quantite: 40 });

    expect(res.status).toBe(201);
    expect(await quantite(produit.id)).toBe(0);
  });

  it('REFUSE une sortie excessive au lieu de ramener à zéro', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const produit = await creerProduit(agent, 10);

    const res = await agent
      .post(`/api/stock/${produit.id}/mouvements`)
      .set('Idempotency-Key', cle())
      .send({ type: 'SORTIE', quantite: 11 });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('STOCK_INSUFFICIENT');
    // La quantité est inchangée : aucun écrêtage silencieux.
    expect(await quantite(produit.id)).toBe(10);
  });

  it.each([0, -1, 1.5, 'abc', null])('refuse la quantité %s', async (q) => {
    const { agent } = await sessionPour(app, 'tresorier');
    const produit = await creerProduit(agent, 50);

    const res = await agent
      .post(`/api/stock/${produit.id}/mouvements`)
      .set('Idempotency-Key', cle())
      .send({ type: 'SORTIE', quantite: q });

    expect([400, 422]).toContain(res.status);
    expect(await quantite(produit.id)).toBe(50);
  });

  it('refuse un type de mouvement inconnu', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const produit = await creerProduit(agent, 50);

    const res = await agent
      .post(`/api/stock/${produit.id}/mouvements`)
      .set('Idempotency-Key', cle())
      .send({ type: 'TRANSFERT', quantite: 1 });

    expect(res.status).toBe(400);
  });

  it('exige une clé d’idempotence', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const produit = await creerProduit(agent, 50);

    const res = await agent
      .post(`/api/stock/${produit.id}/mouvements`)
      .send({ type: 'SORTIE', quantite: 1 });
    expect(res.status).toBe(400);
  });

  it('rejoue la même clé sans appliquer deux fois le mouvement', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const produit = await creerProduit(agent, 100);
    const k = cle();
    const corps = { type: 'SORTIE', quantite: 10 };

    const a = await agent.post(`/api/stock/${produit.id}/mouvements`).set('Idempotency-Key', k).send(corps);
    const b = await agent.post(`/api/stock/${produit.id}/mouvements`).set('Idempotency-Key', k).send(corps);

    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(await quantite(produit.id)).toBe(90);
  });

  it('retourne 404 pour un produit inexistant', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const res = await agent
      .post('/api/stock/999999/mouvements')
      .set('Idempotency-Key', cle())
      .send({ type: 'SORTIE', quantite: 1 });
    expect(res.status).toBe(404);
  });

  it('audite le mouvement avec avant/après', async () => {
    const { agent, utilisateur } = await sessionPour(app, 'tresorier');
    const produit = await creerProduit(agent, 100);

    await agent
      .post(`/api/stock/${produit.id}/mouvements`)
      .set('Idempotency-Key', cle())
      .send({ type: 'SORTIE', quantite: 20, motif: 'Chantier' });

    const { rows } = await pool.query(
      "SELECT * FROM logs_activite WHERE type_evenement = 'stock.changed' ORDER BY id DESC LIMIT 1"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].utilisateur_id).toBe(utilisateur.id);
    expect(rows[0].avant.quantite_actuelle).toBe(100);
    expect(rows[0].apres.quantite_actuelle).toBe(80);
  });

  it('refuse le mouvement à un lecteur', async () => {
    const { agent: tresorier } = await sessionPour(app, 'tresorier');
    const produit = await creerProduit(tresorier, 50);

    const { agent: lecteur } = await sessionPour(app, 'lecteur');
    const res = await lecteur
      .post(`/api/stock/${produit.id}/mouvements`)
      .set('Idempotency-Key', cle())
      .send({ type: 'SORTIE', quantite: 1 });
    expect(res.status).toBe(403);
  });
});

describe('concurrence', () => {
  it('deux sorties concurrentes ne peuvent pas dépasser le stock', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const produit = await creerProduit(agent, 10);

    const utilisateurA = await creerUtilisateur({ role: 'tresorier' });
    const utilisateurB = await creerUtilisateur({ role: 'tresorier' });
    const agentA = request.agent(app);
    const agentB = request.agent(app);
    await agentA.post('/api/auth/login').send({ email: utilisateurA.email, mot_de_passe: MOT_DE_PASSE_VALIDE });
    await agentB.post('/api/auth/login').send({ email: utilisateurB.email, mot_de_passe: MOT_DE_PASSE_VALIDE });

    const corps = { type: 'SORTIE', quantite: 8 };
    const [a, b] = await Promise.all([
      agentA.post(`/api/stock/${produit.id}/mouvements`).set('Idempotency-Key', cle()).send(corps),
      agentB.post(`/api/stock/${produit.id}/mouvements`).set('Idempotency-Key', cle()).send(corps),
    ]);

    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await quantite(produit.id)).toBe(2);
  });
});

describe('alias dépréciés', () => {
  it('increment applique les mêmes validations', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const produit = await creerProduit(agent, 10);

    const res = await agent
      .post(`/api/stock/${produit.id}/increment`)
      .set('Idempotency-Key', cle())
      .send({ quantite: 5 });

    expect(res.status).toBe(201);
    expect(await quantite(produit.id)).toBe(15);
  });

  it('decrement refuse un dépassement au lieu de ramener à zéro', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const produit = await creerProduit(agent, 3);

    const res = await agent
      .post(`/api/stock/${produit.id}/decrement`)
      .set('Idempotency-Key', cle())
      .send({ quantite: 10 });

    expect(res.status).toBe(409);
    expect(await quantite(produit.id)).toBe(3);
  });
});

describe('PATCH /api/stock/{id}', () => {
  it('modifie les métadonnées sans toucher à la quantité', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const produit = await creerProduit(agent, 42);

    const res = await agent
      .patch(`/api/stock/${produit.id}`)
      .send({ nom: 'Renommé', quantite_minimale_alerte: 5 });

    expect(res.status).toBe(200);
    expect(res.body.nom).toBe('Renommé');
    expect(await quantite(produit.id)).toBe(42);
  });

  it('refuse une tentative de modification de la quantité', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const produit = await creerProduit(agent, 42);

    const res = await agent.patch(`/api/stock/${produit.id}`).send({ quantite_actuelle: 999 });

    expect(res.status).toBe(400);
    expect(await quantite(produit.id)).toBe(42);
  });
});

describe('contraintes en base', () => {
  it('refuse une quantité négative', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const produit = await creerProduit(agent, 10);

    await expect(
      pool.query('UPDATE produits_stock SET quantite_actuelle = -1 WHERE id = $1', [produit.id])
    ).rejects.toThrow();
  });

  it('refuse un seuil d’alerte négatif', async () => {
    await expect(
      pool.query(
        `INSERT INTO produits_stock (nom, quantite_actuelle, quantite_minimale_alerte)
         VALUES ('KO', 1, -5)`
      )
    ).rejects.toThrow();
  });
});

describe('alertes', () => {
  it('signale un produit au seuil', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const produit = await creerProduit(agent, 10, 10);

    const res = await agent.get('/api/stock/alertes');
    const items = Array.isArray(res.body) ? res.body : res.body.items;
    expect(items.some((p) => p.id === produit.id)).toBe(true);
  });

  it('signale un produit sous le seuil après une sortie', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const produit = await creerProduit(agent, 12, 10);

    await agent
      .post(`/api/stock/${produit.id}/mouvements`)
      .set('Idempotency-Key', cle())
      .send({ type: 'SORTIE', quantite: 5 });

    const res = await agent.get('/api/stock/alertes');
    const items = Array.isArray(res.body) ? res.body : res.body.items;
    expect(items.some((p) => p.id === produit.id)).toBe(true);
  });

  it('expose les alertes dans le tableau de bord', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const produit = await creerProduit(agent, 2, 10);

    const res = await agent.get('/api/dashboard');
    expect(Array.isArray(res.body.alertes_stock)).toBe(true);
    expect(res.body.alertes_stock.some((p) => p.id === produit.id)).toBe(true);
  });
});
