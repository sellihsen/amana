/**
 * Idempotence des mutations sensibles.
 *
 * Une création financière, une contre-écriture, une distribution sociale ou une
 * variation de stock est identifiée par (acteur, opération, clé). Rejouer la
 * même clé avec le même contenu retourne le résultat initial ; la rejouer avec
 * un contenu différent est un conflit.
 *
 * La ligne d'idempotence est écrite avec le client de la transaction métier :
 * elle commite avec la mutation, jamais séparément.
 */

const crypto = require('crypto');
const { ApiError } = require('./errors');

const CLE_MIN_LONGUEUR = 1;
const CLE_MAX_LONGUEUR = 128;

/** Codes d'opération stables. Une valeur n'est jamais réutilisée. */
const OPERATIONS = {
  DON_CREER: 'don.creer',
  COTISATION_CREER: 'cotisation.creer',
  DEPENSE_CREER: 'depense.creer',
  SALAIRE_PAYER: 'salaire.payer',
  ECOLAGE_CREER: 'ecolage.creer',
  DISTRIBUTION_SOCIALE_CREER: 'distribution-sociale.creer',
  CONTRE_ECRITURE_CREER: 'contre-ecriture.creer',
  STOCK_MOUVEMENT: 'stock.mouvement',
};

/**
 * @param {unknown} valeur  En-tête `Idempotency-Key`.
 * @returns {string} la clé validée.
 * @throws {ApiError} VALIDATION_ERROR
 */
function validerCleIdempotence(valeur) {
  if (typeof valeur !== 'string') {
    throw ApiError.validation({
      'Idempotency-Key': "L'en-tête Idempotency-Key est requis.",
    });
  }

  const cle = valeur.trim();
  if (cle.length < CLE_MIN_LONGUEUR || cle.length > CLE_MAX_LONGUEUR) {
    throw ApiError.validation({
      'Idempotency-Key': `La clé doit comporter de ${CLE_MIN_LONGUEUR} à ${CLE_MAX_LONGUEUR} caractères.`,
    });
  }

  return cle;
}

/**
 * Sérialisation canonique : les clés d'objet sont ordonnées, l'ordre des
 * tableaux est significatif, et le type des valeurs est conservé (une chaîne
 * « 10 » n'est pas le nombre 10).
 */
function canoniser(valeur) {
  if (valeur === null) return 'n';
  if (Array.isArray(valeur)) {
    return `a[${valeur.map(canoniser).join(',')}]`;
  }
  const type = typeof valeur;
  if (type === 'object') {
    const cles = Object.keys(valeur).sort();
    return `o{${cles.map((k) => `${JSON.stringify(k)}:${canoniser(valeur[k])}`).join(',')}}`;
  }
  if (type === 'string') return `s${JSON.stringify(valeur)}`;
  if (type === 'number') return `d${valeur}`;
  if (type === 'boolean') return `b${valeur}`;
  return `u`;
}

/** Empreinte SHA-256 stable du corps d'une requête. */
function empreinteRequete(corps) {
  return crypto.createHash('sha256').update(canoniser(corps ?? null), 'utf8').digest('hex');
}

/**
 * Réserve la demande, ou détecte un rejeu.
 *
 * Doit être appelée avec le client de la transaction métier.
 *
 * @returns {Promise<{statut: 'NOUVELLE', id: number}
 *                 | {statut: 'REJOUEE', demande: object}>}
 * @throws {ApiError} IDEMPOTENCY_KEY_REUSED si l'empreinte diffère,
 *                    DUPLICATE_OPERATION si une demande identique est en cours.
 */
async function reserverDemande(client, { utilisateurId, operation, cle, empreinte }) {
  if (!client) {
    throw new Error("reserverDemande exige le client de la transaction métier.");
  }

  const { rows } = await client.query(
    `INSERT INTO demandes_idempotentes (utilisateur_id, operation, cle, empreinte_requete, statut)
     VALUES ($1, $2, $3, $4, 'EN_COURS')
     ON CONFLICT (utilisateur_id, operation, cle) DO NOTHING
     RETURNING id`,
    [utilisateurId, operation, cle, empreinte]
  );

  if (rows.length > 0) {
    return { statut: 'NOUVELLE', id: rows[0].id };
  }

  // La clé existe déjà : on la verrouille pour lire un état stable.
  const { rows: existantes } = await client.query(
    `SELECT * FROM demandes_idempotentes
      WHERE utilisateur_id = $1 AND operation = $2 AND cle = $3
      FOR UPDATE`,
    [utilisateurId, operation, cle]
  );
  const demande = existantes[0];

  if (demande.empreinte_requete !== empreinte) {
    throw ApiError.conflict(
      'IDEMPOTENCY_KEY_REUSED',
      'Cette clé d’idempotence a déjà été utilisée avec une demande différente.'
    );
  }

  if (demande.statut === 'EN_COURS') {
    throw ApiError.conflict(
      'DUPLICATE_OPERATION',
      'Une demande identique est déjà en cours de traitement.'
    );
  }

  return { statut: 'REJOUEE', demande };
}

/**
 * Mémorise le résultat de la demande. Commite avec la mutation métier.
 */
async function terminerDemande(
  client,
  id,
  { httpStatus, body, ressourceType = null, ressourceId = null }
) {
  if (!client) {
    throw new Error("terminerDemande exige le client de la transaction métier.");
  }

  await client.query(
    `UPDATE demandes_idempotentes
        SET statut = 'TERMINEE',
            http_status = $2,
            response_body = $3,
            ressource_type = $4,
            ressource_id = $5,
            completed_at = NOW()
      WHERE id = $1`,
    [id, httpStatus, body === undefined ? null : JSON.stringify(body), ressourceType,
     ressourceId === null ? null : String(ressourceId)]
  );
}

module.exports = {
  CLE_MIN_LONGUEUR,
  CLE_MAX_LONGUEUR,
  OPERATIONS,
  validerCleIdempotence,
  empreinteRequete,
  reserverDemande,
  terminerDemande,
};
