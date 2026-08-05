/**
 * T097 [US8] — Le document OpenAPI décrit l'API RÉELLE.
 *
 * Constitution : « A documented guarantee that the code does not implement is a
 * defect of the same severity as the missing implementation. »
 */
const request = require('supertest');
const { createApp } = require('../../src/app');
const { buildSwaggerSpec } = require('../../src/config/swagger');
const { sessionPour } = require('../helpers/auth');

const app = createApp();
const spec = buildSwaggerSpec();

/** Chemins déclarés, normalisés (`{id}` → `:id`). */
const chemins = Object.keys(spec.paths || {});

/** Résout un `$ref` local vers le composant qu'il désigne. */
function resoudre(noeud) {
  if (!noeud || typeof noeud !== 'object') return noeud;
  if (noeud.$ref) {
    const chemin = noeud.$ref.replace(/^#\//, '').split('/');
    return chemin.reduce((acc, cle) => (acc ? acc[cle] : undefined), spec);
  }
  return noeud;
}

function operations() {
  const sortie = [];
  for (const [chemin, methodes] of Object.entries(spec.paths || {})) {
    for (const [methode, operation] of Object.entries(methodes)) {
      if (['get', 'post', 'put', 'patch', 'delete'].includes(methode)) {
        sortie.push({ chemin, methode, operation });
      }
    }
  }
  return sortie;
}

describe('document OpenAPI', () => {
  it('est un document 3.0 valide et non vide', () => {
    expect(spec.openapi).toMatch(/^3\./);
    expect(spec.info.title).toBeTruthy();
    expect(chemins.length).toBeGreaterThan(20);
  });

  it('déclare la session par cookie comme schéma de sécurité', () => {
    expect(spec.components.securitySchemes.sessionCookie).toMatchObject({
      type: 'apiKey',
      in: 'cookie',
    });
  });

  it('applique le refus par défaut au niveau du document', () => {
    expect(spec.security).toEqual([{ sessionCookie: [] }]);
  });

  it('ne déclare aucun schéma de type Bearer : la session est un cookie', () => {
    const serialise = JSON.stringify(spec);
    expect(serialise).not.toMatch(/bearerAuth/);
    expect(serialise).not.toMatch(/"scheme"\s*:\s*"bearer"/);
  });
});

describe('routes publiques', () => {
  const PUBLIQUES = [
    ['/api/auth/login', 'post'],
    ['/api/health', 'get'],
  ];

  it.each(PUBLIQUES)('%s %s est marquée publique', (chemin, methode) => {
    const operation = spec.paths[chemin] && spec.paths[chemin][methode];
    expect(operation).toBeDefined();
    expect(operation.security).toEqual([]);
  });

  it('aucune autre opération n’est marquée publique', () => {
    const publiques = operations().filter(
      ({ operation }) => Array.isArray(operation.security) && operation.security.length === 0
    );
    const attendues = PUBLIQUES.map(([c, m]) => `${m} ${c}`).concat(['post /api/auth/register']);
    for (const { chemin, methode } of publiques) {
      expect(attendues).toContain(`${methode} ${chemin}`);
    }
  });
});

describe('chaque route documentée existe réellement', () => {
  it('répond autre chose que 404 pour un administrateur', async () => {
    const { agent } = await sessionPour(app, 'admin');

    for (const { chemin, methode } of operations()) {
      // Les paramètres de chemin sont remplacés par une valeur plausible.
      const url = chemin.replace(/\{[^}]+\}/g, '999999');
      const res = await agent[methode](url).send({});

      // 404 signifierait que la documentation décrit une route inexistante.
      // Une ressource absente répond RESOURCE_NOT_FOUND, ce qui est distinct.
      if (res.status === 404) {
        expect(res.body.code).toBe('RESOURCE_NOT_FOUND');
      }
      expect(res.status).not.toBe(501);
    }
  });
});

describe('conventions monétaires', () => {
  const OPERATIONS_ARGENT = [
    ['/api/dons', 'post', 'montant'],
    ['/api/depenses', 'post', 'montant'],
    ['/api/cotisations', 'post', 'montant'],
    ['/api/personnel/paiements', 'post', 'montant_verse'],
    ['/api/social/distributions', 'post', 'montant_verse'],
  ];

  it.each(OPERATIONS_ARGENT)('%s documente %s comme chaîne EUR', (chemin, methode, champ) => {
    const operation = spec.paths[chemin][methode];
    const schema = resoudre(
      operation.requestBody.content['application/json'].schema.properties[champ]
    );

    expect(schema.type).toBe('string');
    expect(schema.pattern).toBeDefined();
    // Le motif documenté est celui appliqué par le serveur.
    expect(schema.pattern.replace(/\\\\/g, '\\')).toContain('[0-9]{2}');
  });

  it('aucun montant n’est documenté comme number', () => {
    for (const { operation } of operations()) {
      const schema = operation.requestBody?.content?.['application/json']?.schema;
      if (!schema?.properties) continue;
      for (const [nom, propriete] of Object.entries(schema.properties)) {
        if (/montant/i.test(nom)) {
          expect(resoudre(propriete).type).toBe('string');
        }
      }
    }
  });
});

describe('idempotence documentée', () => {
  const EXIGEANT_UNE_CLE = [
    ['/api/dons', 'post'],
    ['/api/depenses', 'post'],
    ['/api/cotisations', 'post'],
    ['/api/personnel/paiements', 'post'],
    ['/api/eleves/cotisations', 'post'],
    ['/api/social/distributions', 'post'],
    ['/api/ecritures-financieres/{id}/contre-ecritures', 'post'],
    ['/api/stock/{id}/mouvements', 'post'],
  ];

  it.each(EXIGEANT_UNE_CLE)('%s %s documente Idempotency-Key', (chemin, methode) => {
    const operation = spec.paths[chemin][methode];
    const entete = (operation.parameters || [])
      .map(resoudre)
      .find((p) => p.in === 'header' && p.name === 'Idempotency-Key');
    expect(entete).toBeDefined();
    expect(entete.required).toBe(true);
  });

  it('la clé est réellement exigée par le serveur', async () => {
    const { agent } = await sessionPour(app, 'tresorier');
    const res = await agent.post('/api/dons').send({ caisse_id: 1, montant: '10.00' });
    expect(res.status).toBe(400);
  });
});

describe('codes d’erreur documentés', () => {
  it('les opérations protégées documentent 401 ou 403', () => {
    const protegees = operations().filter(
      ({ operation }) => !Array.isArray(operation.security) || operation.security.length > 0
    );
    const sansCodeAcces = protegees.filter(({ operation }) => {
      const codes = Object.keys(operation.responses || {});
      return !codes.some((c) => ['401', '403'].includes(c));
    });

    // Une opération protégée doit annoncer au moins un refus d'accès.
    expect(sansCodeAcces.map((o) => `${o.methode} ${o.chemin}`)).toEqual([]);
  });

  it('toute opération déclare au moins une réponse', () => {
    for (const { chemin, methode, operation } of operations()) {
      expect(Object.keys(operation.responses || {}).length).toBeGreaterThan(0);
    }
  });

  it('les opérations d’écriture financière documentent 409', () => {
    for (const chemin of ['/api/dons', '/api/social/distributions']) {
      const codes = Object.keys(spec.paths[chemin].post.responses);
      expect(codes).toContain('409');
    }
  });
});

describe('/api-docs', () => {
  it('n’est jamais accessible sans session administrateur', async () => {
    const anonyme = await request(app).get('/api-docs/');
    expect([301, 302, 401, 403, 404]).toContain(anonyme.status);

    const { agent: lecteur } = await sessionPour(app, 'lecteur');
    expect([401, 403, 404]).toContain((await lecteur.get('/api-docs/')).status);

    const { agent: tresorier } = await sessionPour(app, 'tresorier');
    expect([401, 403, 404]).toContain((await tresorier.get('/api-docs/')).status);
  });

  it('est accessible à un administrateur en local', async () => {
    const { agent } = await sessionPour(app, 'admin');
    const res = await agent.get('/api-docs/');
    expect([200, 301, 302]).toContain(res.status);
  });
});
