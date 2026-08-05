/**
 * Périodes mensuelles — représentation unique côté interface.
 *
 * Le serveur stocke une période canonique (premier jour du mois). L'interface
 * ne réinvente pas ce calcul : elle se contente de proposer des valeurs
 * canoniques (`AAAA-MM`) et d'afficher un libellé lisible.
 */

const MOIS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

/** « 2026-09-01 » → « Septembre 2026 ». */
export function normaliserPeriodeAffichee(valeur) {
  if (!valeur) return '—'
  const texte = String(valeur)
  const correspondance = /^(\d{4})-(\d{2})/.exec(texte)
  if (!correspondance) return texte

  const annee = correspondance[1]
  const mois = Number.parseInt(correspondance[2], 10)
  if (mois < 1 || mois > 12) return texte
  return `${MOIS_FR[mois - 1]} ${annee}`
}

/**
 * Options de mois d'une année, dans l'ordre chronologique.
 * La valeur envoyée au serveur est toujours `AAAA-MM`.
 */
export function moisOptions(annee = new Date().getFullYear()) {
  return MOIS_FR.map((nom, index) => ({
    valeur: `${annee}-${String(index + 1).padStart(2, '0')}`,
    libelle: `${nom} ${annee}`,
  }))
}

/** Mois courant, au format canonique. */
export function moisCourant() {
  const maintenant = new Date()
  return `${maintenant.getFullYear()}-${String(maintenant.getMonth() + 1).padStart(2, '0')}`
}

export { MOIS_FR }
