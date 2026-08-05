import { Wallet, TrendingUp, HandHeart } from 'lucide-react'
import { formaterEur } from '../utils/money'

/**
 * Bilan de l'aide sociale.
 *
 * Les trois montants proviennent du serveur, calculés en SQL depuis le grand
 * livre. Rien n'est recomposé ici : `reste_disponible` n'est PAS
 * `collecté − distribué` recalculé côté client, c'est la valeur faisant foi.
 */
export default function BilanSocial({ bilan }) {
  if (!bilan) return null

  const cartes = [
    {
      cle: 'social-collecte',
      libelle: 'Collecté',
      valeur: bilan.total_collecte,
      icone: TrendingUp,
      couleur: 'text-green-600',
    },
    {
      cle: 'social-distribue',
      libelle: 'Distribué',
      valeur: bilan.total_distribue,
      icone: HandHeart,
      couleur: 'text-rose-600',
    },
    {
      cle: 'social-disponible',
      libelle: 'Disponible',
      valeur: bilan.reste_disponible,
      icone: Wallet,
      couleur: 'text-gray-900',
    },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {cartes.map(({ cle, libelle, valeur, icone: Icone, couleur }) => (
          <div key={cle} className="card flex items-center gap-3">
            <Icone className={`w-5 h-5 ${couleur}`} />
            <div>
              <p className="text-sm text-gray-500">{libelle}</p>
              <p data-testid={cle} className={`text-2xl font-bold ${couleur}`}>
                {formaterEur(valeur)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {bilan.caisses && bilan.caisses.length > 0 && (
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-3">Détail par caisse</h3>
          <div className="space-y-2">
            {bilan.caisses.map((c) => (
              <div
                key={c.caisse_id}
                className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"
              >
                <div>
                  <p className="text-sm font-medium text-gray-700">{c.caisse_nom}</p>
                  <p className="text-xs text-gray-400">
                    {c.nb_distributions} distribution{c.nb_distributions > 1 ? 's' : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-900">
                    {formaterEur(c.reste_disponible)}
                  </p>
                  <p className="text-xs text-gray-400">
                    {formaterEur(c.total_collecte)} collectés · {formaterEur(c.total_distribue)} distribués
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
