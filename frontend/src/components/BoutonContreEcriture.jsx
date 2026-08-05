import { useState, useRef } from 'react'
import { Undo2, AlertCircle } from 'lucide-react'

import api from '../services/api'
import { useCapacite } from './RoleGuard'
import { CAPACITES } from '../utils/permissions'
import { formaterEur } from '../utils/money'

/** Clé d'idempotence stable pour une tentative donnée. */
function nouvelleCle() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `ce-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/**
 * Contre-écriture d'une opération comptabilisée.
 *
 * Une écriture ne se modifie ni ne se supprime : on lui oppose une écriture
 * inverse motivée. Le bouton n'apparaît que pour qui peut écrire, et disparaît
 * dès que l'écriture est annulée.
 */
export default function BoutonContreEcriture({ ecriture, surSucces }) {
  const peutEcrire = useCapacite(CAPACITES.BUSINESS_WRITE)
  const [ouvert, setOuvert] = useState(false)
  const [motif, setMotif] = useState('')
  const [erreur, setErreur] = useState('')
  const [enCours, setEnCours] = useState(false)

  // La clé est conservée pour toute la durée de la boîte de dialogue : si
  // l'utilisateur réessaie après une erreur réseau, le serveur reconnaît la
  // même demande et ne crée pas deux contre-écritures.
  const cle = useRef(nouvelleCle())

  if (ecriture?.est_annulee) {
    return <span className="text-xs text-gray-500 italic">Écriture annulée</span>
  }

  if (!peutEcrire) return null

  const confirmer = async () => {
    if (!motif.trim()) {
      setErreur('Un motif est requis pour créer une contre-écriture.')
      return
    }

    setErreur('')
    setEnCours(true)
    try {
      const { data } = await api.post(
        `/ecritures-financieres/${ecriture.id}/contre-ecritures`,
        { motif: motif.trim() },
        { headers: { 'Idempotency-Key': cle.current } }
      )
      setOuvert(false)
      setMotif('')
      cle.current = nouvelleCle()
      if (surSucces) surSucces(data)
    } catch (err) {
      const donnees = err?.response?.data
      if (donnees?.code === 'ALREADY_REVERSED') {
        setErreur('Cette écriture possède déjà une contre-écriture.')
      } else if (donnees?.code === 'SOCIAL_BALANCE_INSUFFICIENT') {
        setErreur(donnees.message)
      } else {
        setErreur(donnees?.message || 'La contre-écriture n’a pas pu être enregistrée.')
      }
    } finally {
      setEnCours(false)
    }
  }

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="inline-flex items-center gap-1.5 text-sm text-amber-700 hover:text-amber-900"
      >
        <Undo2 className="w-4 h-4" />
        Contre-écriture
      </button>
    )
  }

  return (
    <div className="border border-amber-200 bg-amber-50 rounded-lg p-4 space-y-3">
      <p className="text-sm text-gray-700">
        Annuler l’écriture de <strong>{formaterEur(ecriture.montant)}</strong> par une écriture
        inverse. L’écriture d’origine est conservée.
      </p>

      <div>
        <label className="label" htmlFor={`motif-${ecriture.id}`}>
          Motif <span className="text-red-500">*</span>
        </label>
        <input
          id={`motif-${ecriture.id}`}
          name="motif"
          type="text"
          className="input-field"
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
          placeholder="Erreur de caisse lors de la saisie"
        />
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
          onClick={() => {
            setOuvert(false)
            setErreur('')
          }}
          className="text-sm text-gray-600 hover:text-gray-900 px-3"
        >
          Annuler
        </button>
      </div>
    </div>
  )
}
