/**
 * Argent exact — validation et formatage des chaînes EUR.
 *
 * Constitution I & V : un montant n'est jamais approximé, et il n'existe qu'une
 * seule définition de « montant valide » dans l'application.
 *
 * L'API transporte les montants sous forme de CHAÎNES à exactement deux
 * décimales. Un nombre JSON est refusé : il est binaire, donc déjà approximé
 * avant d'atteindre ce module. Aucune arithmétique n'est effectuée ici — les
 * sommes, différences et comparaisons appartiennent à PostgreSQL.
 */

const { ApiError } = require('./errors');

/** `^(0|[1-9][0-9]*)\.[0-9]{2}$` — deux décimales, pas de zéro non significatif. */
const MONEY_PATTERN = /^(0|[1-9][0-9]*)\.[0-9]{2}$/;

const DEVISE = 'EUR';
const MONTANT_MIN_POSITIF = '0.01';
const MONTANT_MIN_NON_NEGATIF = '0.00';
const MONTANT_MAX = '9999999999.99';

/**
 * Compare deux montants EUR *en chaînes*, sans conversion flottante.
 * Les deux valeurs sont supposées conformes à MONEY_PATTERN.
 * @returns {-1|0|1}
 */
function comparerMontants(a, b) {
  const [ea, da] = a.split('.');
  const [eb, db] = b.split('.');
  if (ea.length !== eb.length) return ea.length < eb.length ? -1 : 1;
  if (ea !== eb) return ea < eb ? -1 : 1;
  if (da === db) return 0;
  return da < db ? -1 : 1;
}

/**
 * Valide un montant EUR.
 *
 * @param {unknown} valeur          Doit être une chaîne.
 * @param {object}  options
 * @param {string}  options.champ   Nom du champ, pour l'erreur.
 * @param {string} [options.min]    Borne basse incluse (chaîne EUR).
 * @param {string} [options.max]    Borne haute incluse (chaîne EUR).
 * @returns {string} le montant canonique, inchangé.
 * @throws {ApiError}
 */
function validerMontant(valeur, { champ = 'montant', min = MONTANT_MIN_NON_NEGATIF, max = MONTANT_MAX } = {}) {
  if (typeof valeur !== 'string') {
    throw ApiError.validation({
      [champ]:
        'Le montant doit être transmis sous forme de chaîne à deux décimales, ' +
        'par exemple « 125.00 ».',
    });
  }

  if (!MONEY_PATTERN.test(valeur)) {
    throw new ApiError(
      'INVALID_MONEY_SCALE',
      'Le montant doit comporter exactement deux décimales.',
      {
        fieldErrors: {
          [champ]: 'Deux décimales sont requises, par exemple « 125.00 ».',
        },
      }
    );
  }

  if (comparerMontants(valeur, min) < 0) {
    throw ApiError.validation({
      [champ]: `Le montant doit être supérieur ou égal à ${min}.`,
    });
  }

  if (comparerMontants(valeur, max) > 0) {
    throw ApiError.validation({
      [champ]: `Le montant doit être inférieur ou égal à ${max}.`,
    });
  }

  return valeur;
}

/** Montant strictement positif : de 0.01 à 9999999999.99. */
function validerMontantPositif(valeur, champ = 'montant') {
  return validerMontant(valeur, { champ, min: MONTANT_MIN_POSITIF, max: MONTANT_MAX });
}

/** Montant non négatif : de 0.00 à 9999999999.99. */
function validerMontantNonNegatif(valeur, champ = 'montant') {
  return validerMontant(valeur, { champ, min: MONTANT_MIN_NON_NEGATIF, max: MONTANT_MAX });
}

/**
 * Met en forme une valeur venue de PostgreSQL (`NUMERIC` rendu en chaîne par
 * `pg`) pour l'API. N'effectue aucun calcul : ajoute seulement l'échelle
 * manquante. Une agrégation vide (`NULL`) devient un zéro exact.
 *
 * @param {string|number|null|undefined} valeur
 * @returns {string} chaîne EUR à deux décimales.
 */
function formaterMontant(valeur) {
  if (valeur === null || valeur === undefined || valeur === '') return '0.00';

  const brut = String(valeur).trim();
  const signe = brut.startsWith('-') ? '-' : '';
  const absolu = signe ? brut.slice(1) : brut;

  const [entier = '0', decimales = ''] = absolu.split('.');
  const entierNormalise = entier.replace(/^0+(?=\d)/, '') || '0';
  const deuxDecimales = (decimales + '00').slice(0, 2);

  return `${signe}${entierNormalise}.${deuxDecimales}`;
}

module.exports = {
  MONEY_PATTERN,
  DEVISE,
  MONTANT_MIN_POSITIF,
  MONTANT_MIN_NON_NEGATIF,
  MONTANT_MAX,
  comparerMontants,
  validerMontant,
  validerMontantPositif,
  validerMontantNonNegatif,
  formaterMontant,
};
