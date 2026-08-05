/**
 * Références configurables — résolution et contrôle d'activité.
 *
 * Une opération enregistre DEUX choses :
 *   • `*_ref_id` : le lien vers la référence, protégé par ON DELETE RESTRICT;
 *   • le libellé : un SNAPSHOT figé au moment de la saisie.
 *
 * Renommer une référence ne réécrit donc jamais l'historique, et une référence
 * désactivée reste lisible dans le passé tout en devenant inutilisable pour une
 * nouvelle opération.
 */

const { ApiError } = require('./errors');

/**
 * Catalogue FERMÉ des référentiels. Le nom de table ne provient jamais d'une
 * donnée de requête (constitution III) : la clé publique est traduite ici.
 */
const REFERENTIELS = Object.freeze({
  'categories-depenses': {
    table: 'categories_depenses',
    libelle: 'Catégories de dépenses',
    usages: [{ table: 'depenses', colonne: 'categorie_ref_id', libelle: 'dépense(s)' }],
  },
  'classes-madrasa': {
    table: 'classes_madrasa',
    libelle: 'Classes Madrasa',
    usages: [{ table: 'eleves', colonne: 'classe_ref_id', libelle: 'élève(s)' }],
  },
  'types-paiement-rh': {
    table: 'types_paiement_rh',
    libelle: 'Types de paiement RH',
    usages: [
      { table: 'paiements_salaires', colonne: 'type_paiement_ref_id', libelle: 'paiement(s)' },
    ],
  },
});

/** Traduit une clé publique en définition, ou refuse. */
function definitionReferentiel(cle) {
  const definition = REFERENTIELS[cle];
  if (!definition) {
    throw ApiError.validation({
      type: `Type de configuration inconnu. Valeurs : ${Object.keys(REFERENTIELS).join(', ')}.`,
    });
  }
  return definition;
}

/**
 * Résout une référence par son libellé et exige qu'elle soit ACTIVE.
 *
 * @returns {Promise<{id: number, nom: string}>} la référence, dont le `nom`
 *          doit être stocké comme snapshot par l'appelant.
 * @throws {ApiError} VALIDATION_ERROR si absente, INACTIVE_REFERENCE si inactive.
 */
async function resoudreReferenceActive(client, cleReferentiel, valeur, champ) {
  const { table, libelle } = definitionReferentiel(cleReferentiel);

  if (valeur === undefined || valeur === null || String(valeur).trim() === '') {
    throw ApiError.validation({ [champ]: `${libelle} : une valeur est requise.` });
  }

  // `table` vient du catalogue fermé ci-dessus.
  const { rows } = await client.query(
    `SELECT id, nom, actif FROM ${table} WHERE LOWER(nom) = LOWER($1)`,
    [String(valeur).trim()]
  );
  const reference = rows[0];

  if (!reference) {
    throw ApiError.validation({
      [champ]: `« ${valeur} » ne fait pas partie de : ${libelle}.`,
    });
  }

  if (!reference.actif) {
    throw ApiError.conflict(
      'INACTIVE_REFERENCE',
      `« ${reference.nom} » est désactivé et ne peut plus être sélectionné.`
    );
  }

  return { id: reference.id, nom: reference.nom };
}

/** Compte les opérations rattachées à une référence. */
async function compterUsages(client, cleReferentiel, id) {
  const { usages } = definitionReferentiel(cleReferentiel);
  let total = 0;
  for (const usage of usages) {
    // `usage.table` et `usage.colonne` viennent du catalogue fermé.
    const { rows } = await client.query(
      `SELECT COUNT(*)::int AS n FROM ${usage.table} WHERE ${usage.colonne} = $1`,
      [id]
    );
    total += rows[0].n;
  }
  return total;
}

module.exports = {
  REFERENTIELS,
  definitionReferentiel,
  resoudreReferenceActive,
  compterUsages,
};
