import { AlertCircle, Info } from 'lucide-react'

/**
 * Message d'erreur d'une mutation sur une personne.
 *
 * Traduit les codes du contrat en conseil actionnable. Le cas important est
 * `HISTORY_EXISTS` : l'utilisateur doit comprendre que la suppression est
 * refusée pour protéger un historique, et que la désactivation est la bonne
 * action — pas que « ça a planté ».
 */
export default function MessageHistorique({ erreur }) {
  if (!erreur) return null

  const donnees = erreur.response?.data || {}
  const statut = erreur.response?.status

  if (donnees.code === 'HISTORY_EXISTS') {
    return (
      <div role="alert" className="flex items-start gap-2 text-amber-800 bg-amber-50 border border-amber-200 p-3 rounded-lg text-sm">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div>
          <p>{donnees.message}</p>
          <p className="mt-1 text-amber-700">
            Désactivez la fiche : l’historique reste consultable et rien n’est perdu.
          </p>
        </div>
      </div>
    )
  }

  if (donnees.code === 'INACTIVE_REFERENCE') {
    return (
      <div role="alert" className="flex items-start gap-2 text-amber-800 bg-amber-50 border border-amber-200 p-3 rounded-lg text-sm">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div>
          <p>{donnees.message}</p>
          <p className="mt-1 text-amber-700">
            Choisissez une référence active, ou réactivez-la depuis l’administration.
          </p>
        </div>
      </div>
    )
  }

  if (statut === 403) {
    return (
      <div role="alert" className="flex items-center gap-2 text-red-700 bg-red-50 p-3 rounded-lg text-sm">
        <AlertCircle className="w-4 h-4 flex-shrink-0" />
        Vous n’avez pas la permission d’effectuer cette action.
      </div>
    )
  }

  return (
    <div role="alert" className="flex items-center gap-2 text-red-700 bg-red-50 p-3 rounded-lg text-sm">
      <AlertCircle className="w-4 h-4 flex-shrink-0" />
      {donnees.message || 'Une erreur est survenue.'}
    </div>
  )
}
