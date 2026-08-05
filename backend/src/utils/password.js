/**
 * Politique de mot de passe — appliquée côté serveur.
 *
 * Constitution, « Security baseline » : « Password policy MUST be enforced
 * server-side; browser-side constraints are hints. » Cette politique est
 * définie ici et nulle part ailleurs.
 */

const { ApiError } = require('./errors');

const LONGUEUR_MIN = 12;
const LONGUEUR_MAX = 200;

const REGLES = [
  { test: (v) => v.length >= LONGUEUR_MIN, message: `au moins ${LONGUEUR_MIN} caractères` },
  { test: (v) => v.length <= LONGUEUR_MAX, message: `au plus ${LONGUEUR_MAX} caractères` },
  { test: (v) => /[a-z]/.test(v), message: 'une minuscule' },
  { test: (v) => /[A-Z]/.test(v), message: 'une majuscule' },
  { test: (v) => /[0-9]/.test(v), message: 'un chiffre' },
  { test: (v) => /[^A-Za-z0-9]/.test(v), message: 'un caractère spécial' },
];

/** Description lisible de la politique, réutilisée par l'API et l'interface. */
const DESCRIPTION_POLITIQUE =
  `Le mot de passe doit contenir ${REGLES.map((r) => r.message).join(', ')}.`;

/**
 * @param {string} valeur
 * @param {string} champ  Nom du champ pour l'erreur de validation.
 * @returns {string} le mot de passe inchangé s'il est conforme.
 * @throws {ApiError} VALIDATION_ERROR détaillant les règles non satisfaites.
 */
function validerPolitiqueMotDePasse(valeur, champ = 'mot_de_passe') {
  if (typeof valeur !== 'string') {
    throw ApiError.validation({ [champ]: 'Un mot de passe est requis.' });
  }

  const manquantes = REGLES.filter((r) => !r.test(valeur)).map((r) => r.message);
  if (manquantes.length > 0) {
    throw ApiError.validation({
      [champ]: `Le mot de passe doit contenir ${manquantes.join(', ')}.`,
    });
  }

  return valeur;
}

module.exports = {
  LONGUEUR_MIN,
  LONGUEUR_MAX,
  DESCRIPTION_POLITIQUE,
  validerPolitiqueMotDePasse,
};
