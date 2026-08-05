import { useRef, useState } from 'react'
import { ArrowDownCircle, ArrowUpCircle, AlertCircle } from 'lucide-react'

import api from '../services/api'
import { useCapacite } from './RoleGuard'
import { CAPACITES } from '../utils/permissions'

function nouvelleCle() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `mv-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/**
 * Entrée ou sortie de stock.
 *
 * La quantité est un entier strictement positif ; une sortie excessive est
 * REFUSÉE par le serveur (409 STOCK_INSUFFICIENT) et le message est affiché tel
 * quel — la quantité n'est jamais ramenée à zéro.
 */
export default function MouvementStock({ produit, surSucces }) {
  const peutEcrire = useCapacite(CAPACITES.BUSINESS_WRITE)
  const [type, setType] = useState(null)
  const [quantite, setQuantite] = useState('1')
  const [motif, setMotif] = useState('')
  const [erreur, setErreur] = useState('')
  const [enCours, setEnCours] = useState(false)
  const cle = useRef(nouvelleCle())

  if (!peutEcrire) return null

  const ouvrir = (t) => {
    setType(t)
    setErreur('')
    setQuantite('1')
    setMotif('')
    cle.current = nouvelleCle()
  }

  const confirmer = async () => {
    const n = Number(quantite)
    if (!Number.isInteger(n) || n <= 0) {
      setErreur('La quantité doit être un nombre entier strictement positif.')
      return
    }

    setErreur('')
    setEnCours(true)
    try {
      const { data } = await api.post(
        `/stock/${produit.id}/mouvements`,
        { type, quantite: n, ...(motif.trim() ? { motif: motif.trim() } : {}) },
        { headers: { 'Idempotency-Key': cle.current } }
      )
      setType(null)
      if (surSucces) surSucces(data)
    } catch (err) {
      setErreur(err.response?.data?.message || 'Le mouvement n’a pas pu être enregistré.')
    } finally {
      setEnCours(false)
    }
  }

  if (!type) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => ouvrir('ENTREE')}
          className="inline-flex items-center gap-1 text-sm text-green-700 hover:text-green-900"
        >
          <ArrowDownCircle className="w-4 h-4" /> Entrée
        </button>
        <button
          type="button"
          onClick={() => ouvrir('SORTIE')}
          className="inline-flex items-center gap-1 text-sm text-red-600 hover:text-red-800"
        >
          <ArrowUpCircle className="w-4 h-4" /> Sortie
        </button>
      </div>
    )
  }

  return (
    <div className="border border-gray-200 rounded-lg p-3 space-y-3 bg-gray-50">
      <p className="text-sm font-medium text-gray-700">
        {type === 'ENTREE' ? 'Entrée' : 'Sortie'} — {produit.nom}
        <span className="text-gray-400 font-normal">
          {' '}({produit.quantite_actuelle} {produit.unite} en stock)
        </span>
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor={`qte-${produit.id}`}>Quantité</label>
          <input
            id={`qte-${produit.id}`}
            type="number"
            min="1"
            step="1"
            className="input-field"
            value={quantite}
            onChange={(e) => setQuantite(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor={`motif-${produit.id}`}>Motif</label>
          <input
            id={`motif-${produit.id}`}
            type="text"
            className="input-field"
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            placeholder="Utilisation chantier"
          />
        </div>
      </div>

      {erreur && (
        <div role="alert" className="flex items-center gap-2 text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {erreur}
        </div>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={confirmer} disabled={enCours} className="btn-primary">
          {enCours ? 'Enregistrement…' : 'Confirmer'}
        </button>
        <button
          type="button"
          onClick={() => setType(null)}
          className="text-sm text-gray-600 hover:text-gray-900 px-3"
        >
          Annuler
        </button>
      </div>
    </div>
  )
}
