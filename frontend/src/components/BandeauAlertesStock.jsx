import { AlertTriangle } from 'lucide-react'

/**
 * Bandeau d'alerte de stock.
 *
 * Les alertes sont fournies par `GET /api/dashboard` : le bandeau n'émet
 * aucune requête propre. Une seule source évite que le tableau de bord et la
 * page Stock affichent deux comptes différents.
 */
export default function BandeauAlertesStock({ alertes }) {
  if (!alertes || alertes.length === 0) return null

  return (
    <div
      role="alert"
      className="flex items-start gap-3 bg-amber-50 border border-amber-200 text-amber-900 p-4 rounded-lg"
    >
      <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="font-medium">
          {alertes.length} produit{alertes.length > 1 ? 's' : ''} au seuil d’alerte
        </p>
        <p className="text-sm text-amber-800 mt-0.5">
          {alertes
            .map((p) => `${p.nom} (${p.quantite_actuelle}/${p.quantite_minimale_alerte} ${p.unite || ''})`.trim())
            .join(' · ')}
        </p>
      </div>
    </div>
  )
}
