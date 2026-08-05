/**
 * Fixtures financières partagées par les tests US2 / US4.
 */
const { pool } = require('../../src/config/database');

/** Caisse active, par affectation. */
async function caisse(affectation = 'Fonctionnement') {
  const { rows } = await pool.query(
    'SELECT * FROM caisses WHERE affectation = $1 AND actif = TRUE ORDER BY id LIMIT 1',
    [affectation]
  );
  if (rows[0]) return rows[0];

  const { rows: creees } = await pool.query(
    `INSERT INTO caisses (nom, description, affectation, actif)
     VALUES ($1, 'Caisse de test', $2, TRUE) RETURNING *`,
    [`Caisse ${affectation} ${Date.now()}`, affectation]
  );
  return creees[0];
}

const caisseGenerale = () => caisse('Fonctionnement');
const caisseSociale = () => caisse('Social');

async function creerMembre(nom = 'Membre Test') {
  const { rows } = await pool.query(
    "INSERT INTO membres (nom, prenom, statut) VALUES ($1, 'Prenom', 'actif') RETURNING *",
    [nom]
  );
  return rows[0];
}

async function creerPersonnel(nom = 'Employe Test') {
  const { rows } = await pool.query(
    `INSERT INTO personnel (nom, prenom, role_poste, salaire_base, statut)
     VALUES ($1, 'Prenom', 'Imam', 1000.00, 'actif') RETURNING *`,
    [nom]
  );
  return rows[0];
}

async function creerEleve(nom = 'Eleve Test') {
  const { rows } = await pool.query(
    `INSERT INTO eleves (nom, prenom, classe, statut)
     VALUES ($1, 'Prenom', 'Débutants', 'actif') RETURNING *`,
    [nom]
  );
  return rows[0];
}

async function creerFamille(nom = 'Famille Test') {
  const { rows } = await pool.query(
    `INSERT INTO familles_necessiteuses (nom_responsable, nb_membres_famille)
     VALUES ($1, 3) RETURNING *`,
    [nom]
  );
  return rows[0];
}

/** Écritures du grand livre rattachées à une source. */
async function ecrituresDe(sourceType, sourceId) {
  const { rows } = await pool.query(
    'SELECT * FROM ecritures_financieres WHERE source_type = $1 AND source_id = $2 ORDER BY id',
    [sourceType, sourceId]
  );
  return rows;
}

async function toutesLesEcritures() {
  const { rows } = await pool.query('SELECT * FROM ecritures_financieres ORDER BY id');
  return rows;
}

/** En-tête d'idempotence unique. */
let compteurCle = 0;
function cle(prefixe = 'test') {
  compteurCle += 1;
  return `${prefixe}-${process.pid}-${Date.now()}-${compteurCle}`;
}

module.exports = {
  caisse,
  caisseGenerale,
  caisseSociale,
  creerMembre,
  creerPersonnel,
  creerEleve,
  creerFamille,
  ecrituresDe,
  toutesLesEcritures,
  cle,
};
