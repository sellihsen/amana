/**
 * T009 — Le couple « mutation métier + audit » est atomique.
 *
 * Constitution II : l'audit commite dans la même transaction que la mutation
 * qu'il décrit ; une mutation dont l'audit échoue doit échouer entièrement ;
 * le journal est append-only.
 */
const { pool } = require('../../src/config/database');
const { withTransaction } = require('../../src/utils/transaction');
const {
  enregistrerAudit,
  redigerDonneesSensibles,
  EVENEMENTS,
} = require('../../src/utils/audit');

async function creerUtilisateur(nom = 'Test Admin', role = 'admin') {
  const { rows } = await pool.query(
    `INSERT INTO utilisateurs (nom, email, mot_de_passe_hash, role)
     VALUES ($1, $2, 'hash-non-significatif', $3) RETURNING *`,
    [nom, `${nom.replace(/\s/g, '.').toLowerCase()}@test.local`, role]
  );
  return rows[0];
}

function acteurDe(utilisateur) {
  return {
    type: 'UTILISATEUR',
    id: utilisateur.id,
    nom: utilisateur.nom,
    role: utilisateur.role,
  };
}

describe('withTransaction', () => {
  it('commite la mutation et son audit ensemble', async () => {
    const acteur = acteurDe(await creerUtilisateur('Commit Admin'));

    const membre = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO membres (nom, prenom) VALUES ('Diallo', 'Amina') RETURNING *`
      );
      await enregistrerAudit(client, {
        typeEvenement: EVENEMENTS.MEMBRE_CREE,
        resultat: 'SUCCES',
        acteur,
        entiteType: 'membre',
        entiteId: rows[0].id,
        apres: rows[0],
      });
      return rows[0];
    });

    const { rows: membres } = await pool.query('SELECT * FROM membres WHERE id = $1', [membre.id]);
    expect(membres).toHaveLength(1);

    const { rows: audits } = await pool.query(
      'SELECT * FROM logs_activite WHERE entite_type = $1 AND entite_id = $2',
      ['membre', String(membre.id)]
    );
    expect(audits).toHaveLength(1);
    expect(audits[0].type_evenement).toBe(EVENEMENTS.MEMBRE_CREE);
    expect(audits[0].resultat).toBe('SUCCES');
    expect(audits[0].utilisateur_id).toBe(acteur.id);
    expect(audits[0].acteur_role).toBe('admin');
  });

  it('annule la mutation métier quand le corps de la transaction échoue', async () => {
    const acteur = acteurDe(await creerUtilisateur('Rollback Admin'));

    await expect(
      withTransaction(async (client) => {
        await client.query(`INSERT INTO membres (nom) VALUES ('Fantome')`);
        await enregistrerAudit(client, {
          typeEvenement: EVENEMENTS.MEMBRE_CREE,
          resultat: 'SUCCES',
          acteur,
          entiteType: 'membre',
          entiteId: 1,
        });
        throw new Error('échec métier après écriture');
      })
    ).rejects.toThrow('échec métier après écriture');

    const { rows } = await pool.query("SELECT * FROM membres WHERE nom = 'Fantome'");
    expect(rows).toHaveLength(0);

    const { rows: audits } = await pool.query('SELECT * FROM logs_activite');
    expect(audits).toHaveLength(0);
  });

  it("annule la mutation métier quand l'audit ne peut pas être écrit", async () => {
    const acteur = acteurDe(await creerUtilisateur('Audit KO'));

    await expect(
      withTransaction(async (client) => {
        await client.query(`INSERT INTO membres (nom) VALUES ('Sans Trace')`);
        await enregistrerAudit(client, {
          typeEvenement: 'evenement.inexistant.hors.catalogue',
          resultat: 'SUCCES',
          acteur,
          entiteType: 'membre',
          entiteId: 1,
        });
      })
    ).rejects.toThrow();

    const { rows } = await pool.query("SELECT * FROM membres WHERE nom = 'Sans Trace'");
    expect(rows).toHaveLength(0);
  });

  it('restitue la connexion au pool après un échec', async () => {
    const avant = pool.idleCount + pool.totalCount;
    for (let i = 0; i < 5; i += 1) {
      await expect(
        withTransaction(async () => {
          throw new Error('boum');
        })
      ).rejects.toThrow('boum');
    }
    expect(pool.totalCount).toBeLessThanOrEqual(avant + 1);
  });

  it('refuse un audit sans client de transaction', async () => {
    await expect(
      enregistrerAudit(null, {
        typeEvenement: EVENEMENTS.MEMBRE_CREE,
        resultat: 'SUCCES',
        acteur: { type: 'SYSTEME' },
      })
    ).rejects.toThrow(/transaction/i);
  });
});

describe('redaction des données sensibles', () => {
  it('supprime mots de passe, hashes, jetons et cookies', () => {
    const redige = redigerDonneesSensibles({
      nom: 'Amina',
      email: 'amina@test.local',
      mot_de_passe: 'Secret!2026',
      mot_de_passe_hash: '$2a$10$abcdef',
      motDePasse: 'Secret!2026',
      token: 'jwt.abc.def',
      authorization: 'Bearer xyz',
      cookie: 'session=abc',
      imbrique: { password: 'p', refresh_token: 't', conserve: 'oui' },
    });

    expect(redige.nom).toBe('Amina');
    expect(redige.email).toBe('amina@test.local');
    expect(redige.imbrique.conserve).toBe('oui');

    const serialise = JSON.stringify(redige);
    expect(serialise).not.toMatch(/Secret!2026/);
    expect(serialise).not.toMatch(/\$2a\$10\$abcdef/);
    expect(serialise).not.toMatch(/jwt\.abc\.def/);
    expect(serialise).not.toMatch(/Bearer xyz/);
    expect(serialise).not.toMatch(/session=abc/);
  });

  it('applique la redaction aux colonnes avant/après du journal', async () => {
    const acteur = acteurDe(await creerUtilisateur('Redaction Admin'));

    await withTransaction(async (client) => {
      await enregistrerAudit(client, {
        typeEvenement: EVENEMENTS.UTILISATEUR_MODIFIE,
        resultat: 'SUCCES',
        acteur,
        entiteType: 'utilisateur',
        entiteId: acteur.id,
        avant: { nom: 'Ancien', mot_de_passe_hash: '$2a$10$ancien' },
        apres: { nom: 'Nouveau', mot_de_passe: 'MotDePasseEnClair!1' },
      });
    });

    const { rows } = await pool.query('SELECT avant, apres FROM logs_activite LIMIT 1');
    const serialise = JSON.stringify(rows[0]);
    expect(serialise).not.toMatch(/ancien\b.*\$2a/);
    expect(serialise).not.toMatch(/MotDePasseEnClair!1/);
    expect(rows[0].apres.nom).toBe('Nouveau');
  });
});

describe('immutabilité du journal', () => {
  async function unAudit() {
    const acteur = acteurDe(await creerUtilisateur('Immuable Admin'));
    await withTransaction(async (client) => {
      await enregistrerAudit(client, {
        typeEvenement: EVENEMENTS.MEMBRE_CREE,
        resultat: 'SUCCES',
        acteur,
        entiteType: 'membre',
        entiteId: 42,
      });
    });
    const { rows } = await pool.query('SELECT * FROM logs_activite LIMIT 1');
    return rows[0];
  }

  it('refuse UPDATE sur logs_activite', async () => {
    const audit = await unAudit();
    await expect(
      pool.query('UPDATE logs_activite SET resultat = $1 WHERE id = $2', ['REFUS', audit.id])
    ).rejects.toThrow();
  });

  it('refuse DELETE sur logs_activite', async () => {
    const audit = await unAudit();
    await expect(
      pool.query('DELETE FROM logs_activite WHERE id = $1', [audit.id])
    ).rejects.toThrow();

    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM logs_activite');
    expect(rows[0].n).toBe(1);
  });
});

describe('catalogue des événements', () => {
  it('expose des codes stables non localisés', () => {
    for (const code of Object.values(EVENEMENTS)) {
      expect(code).toMatch(/^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+$/);
    }
  });

  it('référence en base tous les codes exposés par le catalogue applicatif', async () => {
    const { rows } = await pool.query('SELECT code FROM types_evenement_audit');
    const enBase = rows.map((r) => r.code);
    for (const code of Object.values(EVENEMENTS)) {
      expect(enBase).toContain(code);
    }
  });
});
