/**
 * Références configurables côté interface.
 *
 * `GET /api/options` ne retourne QUE des références actives. Deux besoins
 * coexistent :
 *
 *  • proposer uniquement l'actif pour une NOUVELLE saisie;
 *  • ne pas faire disparaître le libellé d'une opération EXISTANTE dont la
 *    référence a été désactivée depuis — sinon le formulaire d'édition
 *    effacerait silencieusement une valeur historique.
 */

/** Libellés seuls, pour un `<select>` simple. */
export function libellesOptions(options) {
  if (!Array.isArray(options)) return []
  return options.map((o) => (typeof o === 'string' ? o : o.nom))
}

/**
 * Options sélectionnables, en réintégrant si besoin le libellé historique
 * actuellement porté par l'enregistrement édité.
 *
 * @param {Array} options            Références actives venues du serveur.
 * @param {string} [valeurCourante]  Libellé déjà enregistré, éventuellement inactif.
 */
export function optionsActives(options, valeurCourante) {
  const actives = (Array.isArray(options) ? options : []).filter((o) =>
    typeof o === 'string' ? true : o.actif !== false
  )

  if (!valeurCourante) return actives

  const dejaPresente = actives.some((o) =>
    (typeof o === 'string' ? o : o.nom) === valeurCourante
  )
  if (dejaPresente) return actives

  // Marquée comme historique : sélectionnable pour ne pas être perdue, mais
  // identifiable comme n'étant plus proposée aux nouvelles saisies.
  return [...actives, { id: null, nom: valeurCourante, actif: false, historique: true }]
}
