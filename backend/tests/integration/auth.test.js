/**
 * T021 [US1] — Session : connexion, déconnexion, compte courant, expiration,
 * cookie HttpOnly et fermeture de l'inscription anonyme.
 */
const request = require('supertest');
const jwt = require('jsonwebtoken');

const { createApp } = require('../../src/app');
const { pool } = require('../../src/config/database');
const { obtenirConfig } = require('../../src/config/env');
const {
  creerUtilisateur,
  creerAdmin,
  ouvrirSession,
  sessionPour,
  cookieDeSession,
  MOT_DE_PASSE_VALIDE,
} = require('../helpers/auth');

const app = createApp();
const config = obtenirConfig();
const NOM_COOKIE = config.session.cookieName;

describe('POST /api/auth/login', () => {
  it('ouvre une session et retourne le compte sans secret', async () => {
    const utilisateur = await creerAdmin({ nom: 'Fatima Zahra' });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: utilisateur.email, mot_de_passe: MOT_DE_PASSE_VALIDE });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      id: utilisateur.id,
      nom: 'Fatima Zahra',
      email: utilisateur.email,
      role: 'admin',
    });

    const serialise = JSON.stringify(res.body);
    expect(serialise).not.toMatch(/mot_de_passe/);
    expect(serialise).not.toMatch(/\$2[aby]\$/);
  });

  it('ne retourne jamais la session dans le corps de la réponse', async () => {
    const utilisateur = await creerAdmin();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: utilisateur.email, mot_de_passe: MOT_DE_PASSE_VALIDE });

    expect(res.body).not.toHaveProperty('token');
    expect(res.body).not.toHaveProperty('accessToken');
    expect(res.body).not.toHaveProperty('jwt');
    expect(JSON.stringify(res.body)).not.toMatch(/eyJ[A-Za-z0-9_-]+\./);
  });

  it('dépose un cookie HttpOnly SameSite=Strict', async () => {
    const utilisateur = await creerAdmin();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: utilisateur.email, mot_de_passe: MOT_DE_PASSE_VALIDE });

    const cookie = cookieDeSession(res);
    expect(cookie).toBeTruthy();
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\//i);
  });

  it('refuse un mot de passe incorrect avec 401', async () => {
    const utilisateur = await creerAdmin();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: utilisateur.email, mot_de_passe: 'MauvaisMotDePasse!1' });

    expect(res.status).toBe(401);
    expect(cookieDeSession(res)).toBeNull();
  });

  it('donne la même réponse pour un compte inexistant que pour un mot de passe faux', async () => {
    const utilisateur = await creerAdmin();
    const inexistant = await request(app)
      .post('/api/auth/login')
      .send({ email: 'personne@test.local', mot_de_passe: MOT_DE_PASSE_VALIDE });
    const mauvais = await request(app)
      .post('/api/auth/login')
      .send({ email: utilisateur.email, mot_de_passe: 'MauvaisMotDePasse!1' });

    expect(inexistant.status).toBe(mauvais.status);
    expect(inexistant.body.code).toBe(mauvais.body.code);
    expect(inexistant.body.message).toBe(mauvais.body.message);
  });

  it('refuse la connexion d’un compte désactivé', async () => {
    const utilisateur = await creerUtilisateur({ role: 'admin', statut: 'inactif' });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: utilisateur.email, mot_de_passe: MOT_DE_PASSE_VALIDE });

    expect(res.status).toBe(401);
    expect(cookieDeSession(res)).toBeNull();
  });

  it('accepte l’adresse quelle que soit sa casse', async () => {
    const utilisateur = await creerAdmin({ email: 'Casse.Test@Mosquee.local' });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'casse.test@mosquee.local', mot_de_passe: MOT_DE_PASSE_VALIDE });

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(utilisateur.id);
  });

  it('audite une connexion réussie sans enregistrer le mot de passe', async () => {
    const utilisateur = await creerAdmin();
    await request(app)
      .post('/api/auth/login')
      .send({ email: utilisateur.email, mot_de_passe: MOT_DE_PASSE_VALIDE });

    const { rows } = await pool.query(
      "SELECT * FROM logs_activite WHERE type_evenement = 'auth.login.succeeded'"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].utilisateur_id).toBe(utilisateur.id);
    expect(rows[0].resultat).toBe('SUCCES');
    expect(JSON.stringify(rows[0])).not.toMatch(MOT_DE_PASSE_VALIDE);
  });

  it('audite une connexion refusée sans enregistrer le mot de passe', async () => {
    const utilisateur = await creerAdmin();
    await request(app)
      .post('/api/auth/login')
      .send({ email: utilisateur.email, mot_de_passe: 'MauvaisMotDePasse!1' });

    const { rows } = await pool.query(
      "SELECT * FROM logs_activite WHERE type_evenement = 'auth.login.failed'"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].resultat).toBe('REFUS');
    expect(JSON.stringify(rows[0])).not.toMatch(/MauvaisMotDePasse!1/);
  });
});

describe('GET /api/auth/me', () => {
  it('retourne le compte et le rôle courants', async () => {
    const { agent, utilisateur } = await sessionPour(app, 'tresorier');
    const res = await agent.get('/api/auth/me');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: utilisateur.id,
      nom: utilisateur.nom,
      email: utilisateur.email,
      role: 'tresorier',
    });
  });

  it('exige une session', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('reflète immédiatement un changement de rôle en base', async () => {
    const { agent, utilisateur } = await sessionPour(app, 'lecteur');
    await pool.query("UPDATE utilisateurs SET role = 'tresorier' WHERE id = $1", [utilisateur.id]);

    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('tresorier');
  });

  it('refuse la session d’un compte désactivé entre-temps', async () => {
    const { agent, utilisateur } = await sessionPour(app, 'admin');
    await pool.query("UPDATE utilisateurs SET statut = 'inactif' WHERE id = $1", [utilisateur.id]);

    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SESSION_INACTIVE');
  });

  it('refuse la session d’un compte supprimé entre-temps', async () => {
    const { agent, utilisateur } = await sessionPour(app, 'admin');
    await pool.query('DELETE FROM demandes_idempotentes WHERE utilisateur_id = $1', [utilisateur.id]);
    await pool.query('DELETE FROM utilisateurs WHERE id = $1', [utilisateur.id]).catch(() => {
      // Un compte porteur d'audit est protégé par RESTRICT : on le désactive.
      return pool.query("UPDATE utilisateurs SET statut = 'inactif' WHERE id = $1", [utilisateur.id]);
    });

    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('révoque la session quand auth_version est incrémentée', async () => {
    const { agent, utilisateur } = await sessionPour(app, 'admin');
    expect((await agent.get('/api/auth/me')).status).toBe(200);

    await pool.query('UPDATE utilisateurs SET auth_version = auth_version + 1 WHERE id = $1', [
      utilisateur.id,
    ]);

    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('invalide le cookie de session', async () => {
    const { agent } = await sessionPour(app, 'admin');
    const res = await agent.post('/api/auth/logout');

    expect(res.status).toBe(200);
    const cookie = (res.headers['set-cookie'] || []).find((c) => c.startsWith(`${NOM_COOKIE}=`));
    expect(cookie).toBeTruthy();
    // Cookie vidé et expiré.
    expect(cookie).toMatch(new RegExp(`^${NOM_COOKIE}=;|^${NOM_COOKIE}=;?\\s*Expires`, 'i'));

    const apres = await agent.get('/api/auth/me');
    expect(apres.status).toBe(401);
  });

  it('exige une session', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(401);
  });

  it('audite la déconnexion', async () => {
    const { agent } = await sessionPour(app, 'admin');
    await agent.post('/api/auth/logout');

    const { rows } = await pool.query(
      "SELECT * FROM logs_activite WHERE type_evenement = 'auth.logout'"
    );
    expect(rows).toHaveLength(1);
  });
});

describe('expiration et intégrité de la session', () => {
  it('refuse une session expirée', async () => {
    const utilisateur = await creerAdmin();
    const expire = jwt.sign({ sub: utilisateur.id, av: 1 }, config.jwt.secret, {
      algorithm: 'HS256',
      expiresIn: '-1s',
    });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', [`${NOM_COOKIE}=${expire}`]);
    expect(res.status).toBe(401);
  });

  it('refuse une session signée avec une autre clé', async () => {
    const utilisateur = await creerAdmin();
    const faux = jwt.sign({ sub: utilisateur.id, av: 1 }, 'une-autre-cle-totalement-differente', {
      algorithm: 'HS256',
      expiresIn: '8h',
    });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', [`${NOM_COOKIE}=${faux}`]);
    expect(res.status).toBe(401);
  });

  it('refuse un jeton « alg: none »', async () => {
    const utilisateur = await creerAdmin();
    const entete = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const charge = Buffer.from(JSON.stringify({ sub: utilisateur.id, av: 1 })).toString('base64url');
    const jetonNone = `${entete}.${charge}.`;

    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', [`${NOM_COOKIE}=${jetonNone}`]);
    expect(res.status).toBe(401);
  });

  it('refuse un cookie qui n’est pas un jeton', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', [`${NOM_COOKIE}=n-importe-quoi`]);
    expect(res.status).toBe(401);
  });

  it('ignore un en-tête Authorization : la session passe par le cookie', async () => {
    const utilisateur = await creerAdmin();
    const jeton = jwt.sign({ sub: utilisateur.id, av: 1 }, config.jwt.secret, {
      algorithm: 'HS256',
      expiresIn: '8h',
    });

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${jeton}`);
    expect(res.status).toBe(401);
  });

  it('n’expose ni le rôle ni l’identité dans un jeton lisible côté client', async () => {
    const utilisateur = await creerAdmin();
    const { reponse } = await ouvrirSession(app, utilisateur);
    const cookie = cookieDeSession(reponse);
    const valeur = cookie.split(';')[0].split('=').slice(1).join('=');
    const charge = jwt.decode(valeur);

    // Le rôle est relu en base à chaque requête : il n'est pas porté par la session.
    expect(charge).not.toHaveProperty('role');
    expect(charge).not.toHaveProperty('email');
  });

  it('émet une session d’au plus huit heures', async () => {
    const utilisateur = await creerAdmin();
    const { reponse } = await ouvrirSession(app, utilisateur);
    const valeur = cookieDeSession(reponse).split(';')[0].split('=').slice(1).join('=');
    const { iat, exp } = jwt.decode(valeur);

    expect(exp - iat).toBeLessThanOrEqual(8 * 60 * 60);
    expect(exp - iat).toBeGreaterThan(0);
  });
});

describe('inscription anonyme', () => {
  it('refuse POST /api/auth/register', async () => {
    const res = await request(app).post('/api/auth/register').send({
      nom: 'Intrus',
      email: 'intrus@test.local',
      mot_de_passe: MOT_DE_PASSE_VALIDE,
      role: 'admin',
    });

    expect([404, 410]).toContain(res.status);

    const { rows } = await pool.query('SELECT * FROM utilisateurs WHERE email = $1', [
      'intrus@test.local',
    ]);
    expect(rows).toHaveLength(0);
  });

  it('refuse aussi POST /api/auth/register avec une session valide', async () => {
    const { agent } = await sessionPour(app, 'admin');
    const res = await agent.post('/api/auth/register').send({
      nom: 'Intrus 2',
      email: 'intrus2@test.local',
      mot_de_passe: MOT_DE_PASSE_VALIDE,
      role: 'admin',
    });

    expect([404, 410]).toContain(res.status);
    const { rows } = await pool.query('SELECT * FROM utilisateurs WHERE email = $1', [
      'intrus2@test.local',
    ]);
    expect(rows).toHaveLength(0);
  });
});
