/**
 * Argent côté interface — FORMATAGE UNIQUEMENT.
 *
 * L'interface ne calcule aucun total : les montants arrivent du serveur sous
 * forme de chaînes EUR exactes et repartent sous la même forme. Aucun
 * `parseFloat` n'est appliqué à une valeur destinée à être réenvoyée, car un
 * flottant binaire ne peut pas représenter exactement 0,10 €.
 *
 * C'est le seul module de l'interface qui connaît le format monétaire.
 */

/** Même expression que le serveur : deux décimales, pas de zéro non significatif. */
export const MOTIF_EUR = /^(0|[1-9][0-9]*)\.[0-9]{2}$/

export const DEVISE = 'EUR'

/** Vrai si la valeur est une chaîne EUR canonique. */
export function estMontantValide(valeur) {
  return typeof valeur === 'string' && MOTIF_EUR.test(valeur)
}

/**
 * Convertit une saisie utilisateur en chaîne EUR canonique.
 *
 * Accepte la virgule décimale française et les espaces de groupement, complète
 * les décimales manquantes, et REFUSE toute précision supérieure à deux
 * décimales plutôt que de l'arrondir.
 *
 * @returns {string|null} la chaîne canonique, ou null si inexploitable.
 */
export function normaliserSaisie(saisie) {
  if (typeof saisie !== 'string') return null

  // Espaces ordinaires, insécables et fines insécables utilisés en français.
  const nettoye = saisie.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.')
  if (nettoye === '') return null

  const correspondance = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/.exec(nettoye)
  if (!correspondance) return null

  const entier = correspondance[1]
  const decimales = (correspondance[2] || '').padEnd(2, '0')
  return `${entier}.${decimales}`
}

/**
 * Rend une chaîne EUR telle quelle, sans jamais la recalculer.
 * Utilisé pour préremplir un champ depuis une valeur serveur.
 */
export function formaterMontantSaisi(valeur) {
  if (valeur === null || valeur === undefined || valeur === '') return ''
  return String(valeur)
}

const FORMATEUR = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: DEVISE,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/**
 * Met en forme un montant pour l'affichage (« 1 234,50 € »).
 *
 * `Intl.NumberFormat` exige un nombre ; la conversion n'intervient qu'ICI, au
 * tout dernier moment, et uniquement pour produire du texte. La valeur
 * affichée n'est jamais réutilisée dans un calcul ni renvoyée au serveur.
 */
export function formaterEur(valeur) {
  if (valeur === null || valeur === undefined || valeur === '') return FORMATEUR.format(0)
  const nombre = Number(valeur)
  if (!Number.isFinite(nombre)) return FORMATEUR.format(0)
  return FORMATEUR.format(nombre)
}

/** Message unique expliquant la règle de saisie. */
export function messageMontantInvalide() {
  return 'Le montant doit comporter exactement deux décimales, par exemple 125,00.'
}

/** Attributs communs des champs de saisie monétaire. */
export const ATTRIBUTS_CHAMP_MONTANT = Object.freeze({
  type: 'text',
  inputMode: 'decimal',
  autoComplete: 'off',
  placeholder: '0,00',
})
