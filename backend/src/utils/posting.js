/**
 * Comptabilisation d'une opération financière.
 *
 * Les six flux (don, cotisation, écolage, dépense, salaire, distribution
 * sociale) partagent exactement la même règle :
 *
 *   réserver l'idempotence → écrire la source → écrire le grand livre
 *   → rattacher la source → auditer → mémoriser le résultat → commit
 *
 * Cette règle est écrite ICI et nulle part ailleurs. Chaque route fournit sa
 * logique métier propre ; aucune ne réimplémente la mécanique comptable.
 */

const { ApiError } = require('./errors');
const { withTransaction } = require('./transaction');
const {
  validerCleIdempotence,
  empreinteRequete,
  reserverDemande,
  terminerDemande,
} = require('./idempotency');

/**
 * Tables porteuses d'une colonne `ecriture_id`. Liste FERMÉE : un nom de table
 * ne provient jamais d'une donnée de requête (constitution III).
 */
const TABLES_SOURCE = Object.freeze({
  don: 'dons',
  cotisation: 'cotisations',
  depense: 'depenses',
  paiement_salaire: 'paiements_salaires',
  cotisation_madrasa: 'cotisations_madrasa',
  distribution_sociale: 'distributions_sociales',
});

/** Périmètre déduit de l'affectation d'une caisse. */
function perimetreDeCaisse(caisse) {
  return caisse && caisse.affectation === 'Social' ? 'SOCIAL' : 'GENERAL';
}

/**
 * Insère une ligne du grand livre.
 * Le montant est une chaîne EUR déjà validée par `utils/money`.
 */
async function insererEcriture(client, req, {
  typeEcriture,
  perimetre,
  sens,
  montant,
  dateEffet,
  sourceType,
  sourceId,
  caisseId = null,
  contreEcritureDe = null,
  motif = null,
  idempotencyId = null,
}) {
  const acteur = req && req.utilisateur ? req.utilisateur : null;

  const { rows } = await client.query(
    `INSERT INTO ecritures_financieres
       (type_ecriture, perimetre, sens, montant, devise, date_effet,
        source_type, source_id, caisse_id, cree_par, acteur_nom, acteur_role,
        contre_ecriture_de, motif, idempotency_id)
     VALUES ($1, $2, $3, $4::montant_eur_positif, 'EUR', $5,
             $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING *`,
    [
      typeEcriture,
      perimetre,
      sens,
      montant,
      dateEffet,
      sourceType,
      sourceId,
      caisseId,
      acteur ? acteur.id : null,
      acteur ? acteur.nom || acteur.email : 'Système',
      acteur ? acteur.role : null,
      contreEcritureDe,
      motif,
      idempotencyId,
    ]
  );

  return rows[0];
}

/**
 * Rattache une source à son écriture.
 * @param {string} sourceType clé de TABLES_SOURCE (jamais une donnée client).
 */
async function rattacherSource(client, sourceType, sourceId, ecritureId) {
  const table = TABLES_SOURCE[sourceType];
  if (!table) {
    throw new Error(`Type de source inconnu : ${sourceType}`);
  }
  // `table` provient de la liste fermée ci-dessus, jamais de la requête.
  const { rows } = await client.query(
    `UPDATE ${table} SET ecriture_id = $2 WHERE id = $1 RETURNING *`,
    [sourceId, ecritureId]
  );
  return rows[0];
}

/**
 * Enveloppe idempotente d'une mutation financière.
 *
 * `fn` reçoit `(client, contexte)` et retourne `{ httpStatus, corps,
 * ressourceType, ressourceId }`. Elle s'exécute dans la transaction ; son
 * échec annule tout, y compris la réservation d'idempotence.
 *
 * Un rejeu à clé et contenu identiques retourne la réponse initiale sans
 * réexécuter `fn`.
 */
async function avecIdempotence(req, res, operation, fn) {
  const cle = validerCleIdempotence(req.get('Idempotency-Key'));
  const empreinte = empreinteRequete(req.body);
  const utilisateurId = req.utilisateur.id;

  const resultat = await withTransaction(async (client) => {
    const reservation = await reserverDemande(client, {
      utilisateurId,
      operation,
      cle,
      empreinte,
    });

    if (reservation.statut === 'REJOUEE') {
      return {
        httpStatus: reservation.demande.http_status,
        corps: reservation.demande.response_body,
        rejeu: true,
      };
    }

    const sortie = await fn(client, { idempotencyId: reservation.id });

    await terminerDemande(client, reservation.id, {
      httpStatus: sortie.httpStatus,
      body: sortie.corps,
      ressourceType: sortie.ressourceType || null,
      ressourceId: sortie.ressourceId || null,
    });

    return { ...sortie, rejeu: false };
  });

  res.status(resultat.httpStatus).json(resultat.corps);
  return resultat;
}

/** Charge et verrouille une caisse active, en refusant une référence inactive. */
async function chargerCaisseActive(client, caisseId, champ = 'caisse_id') {
  if (caisseId === undefined || caisseId === null || caisseId === '') {
    throw ApiError.validation({ [champ]: 'La caisse de destination est obligatoire.' });
  }

  const id = Number.parseInt(caisseId, 10);
  if (!Number.isInteger(id) || id < 1) {
    throw ApiError.validation({ [champ]: 'Identifiant de caisse invalide.' });
  }

  const { rows } = await client.query('SELECT * FROM caisses WHERE id = $1 FOR UPDATE', [id]);
  const caisse = rows[0];

  if (!caisse) {
    throw ApiError.notFound('La caisse indiquée est introuvable.');
  }
  if (!caisse.actif) {
    throw ApiError.conflict(
      'INACTIVE_REFERENCE',
      "Cette caisse est désactivée : elle n'accepte plus de nouvelle opération."
    );
  }

  return caisse;
}

module.exports = {
  TABLES_SOURCE,
  perimetreDeCaisse,
  insererEcriture,
  rattacherSource,
  avecIdempotence,
  chargerCaisseActive,
};
