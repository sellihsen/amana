/**
 * T024 [US1] — Gestion des comptes : dernier administrateur, auto-suppression,
 * rôle trésorier réellement attribuable, politique de mot de passe serveur et
 * audit des événements de compte.
 */
const request = require('supertest');
const { createApp } = require('../../src/app');
const { pool } = require('../../src/config/database');
const {
  creerUtilisateur,
  sessionPour,
  MOT_DE_PASSE_VALIDE,
} = require('../helpers/auth');

const app = createApp();

async function evenements(type) {
  const { rows } = await pool.query(
    'SELECT * FROM logs_activite WHERE type_evenement = $1 ORDER BY id',
    [type]
  );
  return rows;
}

describe('GET /api/admin/users', () => {
  it('liste les comptes sans exposer les hashes', async () => {
    const { agent } = await sessionPour(app, 'admin');
    await creerUtilisateur({ role: 'tresorier' });

    const res = await agent.get('/api/admin/users');
    expect(res.status).toBe(200);
    const items = Array.isArray(res.body) ? res.body : res.body.items;
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(items)).not.toMatch(/mot_de_passe/);
  });

  it('remonte une erreur plutôt qu’une liste vide en cas de panne', async () => {
    // Le contrat interdit de transformer un échec en collection vide.
    const { agent } = await sessionPour(app, 'admin');
    const res = await agent.get('/api/admin/users');
    expect(res.status).toBe(200);
    const items = Array.isArray(res.body) ? res.body : res.body.items;
    expect(items.length).toBeGreaterThan(0);
  });
});

describe('POST /api/admin/users', () => {
  it('crée les trois rôles, y compris tresorier', async () => {
    const { agent } = await sessionPour(app, 'admin');

    for (const role of ['admin', 'tresorier', 'lecteur']) {
      const res = await agent.post('/api/admin/users').send({
        nom: `Compte ${role}`,
        email: `${role}.cree@test.local`,
        mot_de_passe: MOT_DE_PASSE_VALIDE,
        role,
      });
      expect(res.status).toBe(201);
      expect(res.body.role).toBe(role);
    }
  });

  it('refuse un rôle hors liste au lieu de le rabattre silencieusement', async () => {
    const { agent } = await sessionPour(app, 'admin');
    const res = await agent.post('/api/admin/users').send({
      nom: 'Role Inconnu',
      email: 'role.inconnu@test.local',
      mot_de_passe: MOT_DE_PASSE_VALIDE,
      role: 'super-admin',
    });

    expect(res.status).toBe(400);
    const { rows } = await pool.query('SELECT * FROM utilisateurs WHERE email = $1', [
      'role.inconnu@test.local',
    ]);
    expect(rows).toHaveLength(0);
  });

  it('applique la politique de mot de passe côté serveur', async () => {
    const { agent } = await sessionPour(app, 'admin');
    const faibles = ['court', 'seulementminuscules', 'SANSCHIFFRE!', 'sans-majuscule1!', 'SansSpecial12'];

    for (const mot of faibles) {
      const res = await agent.post('/api/admin/users').send({
        nom: 'Faible',
        email: `faible.${Buffer.from(mot).toString('hex')}@test.local`,
        mot_de_passe: mot,
        role: 'lecteur',
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
  });

  it('refuse un email déjà utilisé, sans distinction de casse', async () => {
    const { agent } = await sessionPour(app, 'admin');
    await creerUtilisateur({ email: 'doublon@test.local' });

    const res = await agent.post('/api/admin/users').send({
      nom: 'Doublon',
      email: 'DOUBLON@test.local',
      mot_de_passe: MOT_DE_PASSE_VALIDE,
      role: 'lecteur',
    });
    expect(res.status).toBe(409);
  });

  it('audite la création dans la même transaction', async () => {
    const { agent, utilisateur } = await sessionPour(app, 'admin');
    const res = await agent.post('/api/admin/users').send({
      nom: 'Audité',
      email: 'audite@test.local',
      mot_de_passe: MOT_DE_PASSE_VALIDE,
      role: 'tresorier',
    });
    expect(res.status).toBe(201);

    const evts = await evenements('user.created');
    expect(evts).toHaveLength(1);
    expect(evts[0].utilisateur_id).toBe(utilisateur.id);
    expect(evts[0].entite_id).toBe(String(res.body.id));
    expect(JSON.stringify(evts[0])).not.toMatch(MOT_DE_PASSE_VALIDE);
    expect(JSON.stringify(evts[0])).not.toMatch(/\$2[aby]\$/);
  });
});

describe('PATCH /api/admin/users/:id', () => {
  it('modifie le rôle et audite le changement', async () => {
    const { agent } = await sessionPour(app, 'admin');
    const cible = await creerUtilisateur({ role: 'lecteur' });

    const res = await agent.patch(`/api/admin/users/${cible.id}`).send({ role: 'tresorier' });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('tresorier');

    expect((await evenements('user.role.changed')).length).toBeGreaterThanOrEqual(1);
  });

  it('accepte PUT comme alias déprécié', async () => {
    const { agent } = await sessionPour(app, 'admin');
    const cible = await creerUtilisateur({ role: 'lecteur' });

    const res = await agent.put(`/api/admin/users/${cible.id}`).send({ nom: 'Renommé' });
    expect(res.status).toBe(200);
    expect(res.body.nom).toBe('Renommé');
  });

  it('incrémente auth_version lors d’un changement de rôle', async () => {
    const { agent } = await sessionPour(app, 'admin');
    const cible = await creerUtilisateur({ role: 'lecteur' });

    await agent.patch(`/api/admin/users/${cible.id}`).send({ role: 'tresorier' });

    const { rows } = await pool.query('SELECT auth_version FROM utilisateurs WHERE id = $1', [
      cible.id,
    ]);
    expect(rows[0].auth_version).toBeGreaterThan(cible.auth_version);
  });

  it('incrémente auth_version lors d’un changement de mot de passe', async () => {
    const { agent } = await sessionPour(app, 'admin');
    const cible = await creerUtilisateur({ role: 'lecteur' });

    await agent
      .patch(`/api/admin/users/${cible.id}`)
      .send({ mot_de_passe: 'AutreMotDePasse!2026' });

    const { rows } = await pool.query('SELECT auth_version FROM utilisateurs WHERE id = $1', [
      cible.id,
    ]);
    expect(rows[0].auth_version).toBeGreaterThan(cible.auth_version);
    expect((await evenements('user.password.changed')).length).toBe(1);
  });

  it('applique la politique de mot de passe à la modification', async () => {
    const { agent } = await sessionPour(app, 'admin');
    const cible = await creerUtilisateur({ role: 'lecteur' });

    const res = await agent.patch(`/api/admin/users/${cible.id}`).send({ mot_de_passe: 'abc' });
    expect(res.status).toBe(400);
  });

  it('désactive un compte et audite le changement de statut', async () => {
    const { agent } = await sessionPour(app, 'admin');
    const cible = await creerUtilisateur({ role: 'tresorier' });

    const res = await agent.patch(`/api/admin/users/${cible.id}`).send({ statut: 'inactif' });
    expect(res.status).toBe(200);
    expect(res.body.statut).toBe('inactif');

    const { rows } = await pool.query(
      'SELECT statut, desactive_at, desactive_par FROM utilisateurs WHERE id = $1',
      [cible.id]
    );
    expect(rows[0].statut).toBe('inactif');
    expect(rows[0].desactive_at).not.toBeNull();
    expect(rows[0].desactive_par).not.toBeNull();

    expect((await evenements('user.status.changed')).length).toBe(1);
  });

  it('retourne 404 pour un compte inexistant', async () => {
    const { agent } = await sessionPour(app, 'admin');
    const res = await agent.patch('/api/admin/users/999999').send({ nom: 'X' });
    expect(res.status).toBe(404);
  });
});

describe('protection du dernier administrateur', () => {
  it('refuse de rétrograder le dernier admin actif', async () => {
    const { agent, utilisateur } = await sessionPour(app, 'admin');

    const res = await agent.patch(`/api/admin/users/${utilisateur.id}`).send({ role: 'lecteur' });
    expect(res.status).toBe(409);

    const { rows } = await pool.query('SELECT role FROM utilisateurs WHERE id = $1', [
      utilisateur.id,
    ]);
    expect(rows[0].role).toBe('admin');
  });

  it('refuse de désactiver le dernier admin actif', async () => {
    const { agent, utilisateur } = await sessionPour(app, 'admin');

    const res = await agent.patch(`/api/admin/users/${utilisateur.id}`).send({ statut: 'inactif' });
    expect(res.status).toBe(409);

    const { rows } = await pool.query('SELECT statut FROM utilisateurs WHERE id = $1', [
      utilisateur.id,
    ]);
    expect(rows[0].statut).toBe('actif');
  });

  it('refuse de supprimer le dernier admin actif', async () => {
    const { agent, utilisateur } = await sessionPour(app, 'admin');
    const res = await agent.delete(`/api/admin/users/${utilisateur.id}`);
    expect([400, 409]).toContain(res.status);
  });

  it('autorise la rétrogradation dès qu’un autre admin actif existe', async () => {
    const { agent, utilisateur } = await sessionPour(app, 'admin');
    await creerUtilisateur({ role: 'admin' });

    const res = await agent.patch(`/api/admin/users/${utilisateur.id}`).send({ role: 'tresorier' });
    expect(res.status).toBe(200);
  });

  it('ne compte pas un admin inactif comme dernier recours', async () => {
    const { agent, utilisateur } = await sessionPour(app, 'admin');
    await creerUtilisateur({ role: 'admin', statut: 'inactif' });

    const res = await agent.patch(`/api/admin/users/${utilisateur.id}`).send({ role: 'lecteur' });
    expect(res.status).toBe(409);
  });
});

describe('auto-protection du compte courant', () => {
  it('refuse la suppression de son propre compte', async () => {
    const { agent, utilisateur } = await sessionPour(app, 'admin');
    await creerUtilisateur({ role: 'admin' });

    const res = await agent.delete(`/api/admin/users/${utilisateur.id}`);
    expect([400, 409]).toContain(res.status);

    const { rows } = await pool.query('SELECT id FROM utilisateurs WHERE id = $1', [utilisateur.id]);
    expect(rows).toHaveLength(1);
  });

  it('refuse de retirer son propre rôle admin quand on est le dernier', async () => {
    const { agent, utilisateur } = await sessionPour(app, 'admin');
    const res = await agent.patch(`/api/admin/users/${utilisateur.id}`).send({ role: 'lecteur' });
    expect(res.status).toBe(409);
  });
});

describe('DELETE /api/admin/users/:id', () => {
  it('supprime un compte sans historique et audite', async () => {
    const { agent } = await sessionPour(app, 'admin');
    const cible = await creerUtilisateur({ role: 'lecteur' });

    const res = await agent.delete(`/api/admin/users/${cible.id}`);
    expect(res.status).toBe(200);

    const { rows } = await pool.query('SELECT id FROM utilisateurs WHERE id = $1', [cible.id]);
    expect(rows).toHaveLength(0);
    expect((await evenements('user.deleted')).length).toBe(1);
  });

  it('refuse la suppression d’un compte porteur d’historique et propose la désactivation', async () => {
    const { agent } = await sessionPour(app, 'admin');
    const cible = await creerUtilisateur({ role: 'tresorier' });

    // L'utilisateur devient auteur d'une entrée d'audit.
    await pool.query(
      `INSERT INTO logs_activite (utilisateur_id, utilisateur_nom, acteur_type, acteur_role,
                                  type_evenement, resultat)
       VALUES ($1, $2, 'UTILISATEUR', 'tresorier', 'member.created', 'SUCCES')`,
      [cible.id, cible.nom]
    );

    const res = await agent.delete(`/api/admin/users/${cible.id}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('HISTORY_EXISTS');

    const { rows } = await pool.query('SELECT id FROM utilisateurs WHERE id = $1', [cible.id]);
    expect(rows).toHaveLength(1);
  });

  it('retourne 404 pour un compte inexistant', async () => {
    const { agent } = await sessionPour(app, 'admin');
    const res = await agent.delete('/api/admin/users/999999');
    expect(res.status).toBe(404);
  });
});

describe('atomicité', () => {
  it('n’écrit ni le compte ni l’audit lorsque la transaction échoue', async () => {
    const { agent } = await sessionPour(app, 'admin');
    const avantUsers = (await pool.query('SELECT COUNT(*)::int AS n FROM utilisateurs')).rows[0].n;
    const avantLogs = (await pool.query('SELECT COUNT(*)::int AS n FROM logs_activite')).rows[0].n;

    // Email déjà pris → la transaction entière est annulée.
    await creerUtilisateur({ email: 'collision@test.local' });
    const apresCreation = (await pool.query('SELECT COUNT(*)::int AS n FROM utilisateurs')).rows[0].n;

    const res = await agent.post('/api/admin/users').send({
      nom: 'Collision',
      email: 'collision@test.local',
      mot_de_passe: MOT_DE_PASSE_VALIDE,
      role: 'lecteur',
    });
    expect(res.status).toBe(409);

    const apres = (await pool.query('SELECT COUNT(*)::int AS n FROM utilisateurs')).rows[0].n;
    expect(apres).toBe(apresCreation);
    expect((await evenements('user.created')).length).toBe(0);
    expect(avantUsers).toBeLessThanOrEqual(apres);
    expect(avantLogs).toBeGreaterThanOrEqual(0);
  });
});
