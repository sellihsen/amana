import { formaterEur } from './money'

/**
 * Projection des exports XLSX et PDF.
 *
 * Une seule définition de « quelles colonnes, dans quel ordre, dans quel
 * format » : les deux formats exportent donc exactement la même chose que la
 * liste affichée.
 */

/** Lit une clé éventuellement imbriquée (« membre.nom »). */
function lire(ligne, cle) {
  return String(cle)
    .split('.')
    .reduce((valeur, morceau) => (valeur && valeur[morceau] !== undefined ? valeur[morceau] : ''), ligne)
}

/**
 * Met une valeur en forme pour l'affichage (PDF, en-têtes, texte).
 * Les montants restent des chaînes EUR exactes venues du serveur.
 */
export function formaterCellule(valeur, format) {
  if (format === 'eur') return formaterEur(valeur)

  if (format === 'date') {
    if (valeur === null || valeur === undefined || valeur === '') return ''
    const date = new Date(valeur)
    if (Number.isNaN(date.getTime())) return String(valeur)
    return date.toLocaleDateString('fr-FR')
  }

  return valeur ?? ''
}

/**
 * Valeur destinée à une cellule Excel.
 *
 * Excel doit recevoir un NOMBRE pour une colonne monétaire, afin que
 * l'utilisateur puisse totaliser dans son tableur. La conversion a lieu ici et
 * nulle part ailleurs, et aucune somme n'en est tirée par l'application.
 */
export function valeurCellule(valeur, format) {
  if (format === 'eur') {
    const nombre = Number(valeur ?? 0)
    return Number.isFinite(nombre) ? nombre : 0
  }
  return formaterCellule(valeur, format)
}

/**
 * Projette une collection sur des colonnes.
 *
 * @param {Array<object>} lignes    Collection FILTRÉE telle qu'affichée.
 * @param {Array<{key,label,format,width}>} colonnes
 * @returns {{entetes: string[], corps: any[][], corpsTableur: any[][]}}
 */
export function projeter(lignes, colonnes) {
  const entetes = colonnes.map((c) => c.label)
  const source = Array.isArray(lignes) ? lignes : []

  const corps = source.map((ligne) =>
    colonnes.map((c) => formaterCellule(lire(ligne, c.key), c.format))
  )

  const corpsTableur = source.map((ligne) =>
    colonnes.map((c) => valeurCellule(lire(ligne, c.key), c.format))
  )

  return { entetes, corps, corpsTableur }
}
