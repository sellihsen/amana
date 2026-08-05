import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Search, ChevronDown } from 'lucide-react'

import api from '../services/api'

/**
 * Journal d'audit — LECTURE SEULE.
 *
 * Le journal est append-only côté serveur ; l'interface n'offre donc aucune
 * action de modification ou de suppression. Une panne de chargement affiche une
 * erreur : elle n'est jamais présentée comme « aucun événement ».
 */
const FILTRES_VIDES = {
  event_type: '',
  actor_user_id: '',
  resultat: '',
  entity_type: '',
  search: '',
  date_from: '',
  date_to: '',
}

function formaterDate(valeur) {
  if (!valeur) return '—'
  return new Date(valeur).toLocaleString('fr-FR')
}

function couleurResultat(resultat) {
  if (resultat === 'REFUS') return 'bg-amber-100 text-amber-800'
  if (resultat === 'ECHEC') return 'bg-red-100 text-red-800'
  return 'bg-green-100 text-green-800'
}

export default function JournalAudit() {
  const [saisie, setSaisie] = useState(FILTRES_VIDES)
  const [filtres, setFiltres] = useState(FILTRES_VIDES)
  const [donnees, setDonnees] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [chargement, setChargement] = useState(true)
  const [detailOuvert, setDetailOuvert] = useState(null)

  const charger = useCallback(async () => {
    setChargement(true)
    setErreur(null)
    try {
      // Les filtres vides ne sont pas transmis.
      const params = Object.fromEntries(
        Object.entries(filtres).filter(([, v]) => v !== '' && v !== null)
      )
      const { data } = await api.get('/admin/audit-events', { params })
      setDonnees(data)
    } catch (err) {
      setErreur(err)
      setDonnees(null)
    } finally {
      setChargement(false)
    }
  }, [filtres])

  useEffect(() => {
    charger()
  }, [charger])

  const appliquer = (e) => {
    e.preventDefault()
    setFiltres(saisie)
  }

  return (
    <section className="space-y-4">
      <form onSubmit={appliquer} className="card grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="label" htmlFor="audit-event-type">Type d’événement</label>
          <input
            id="audit-event-type"
            className="input-field"
            value={saisie.event_type}
            onChange={(e) => setSaisie({ ...saisie, event_type: e.target.value })}
            placeholder="don.posted"
          />
        </div>
        <div>
          <label className="label" htmlFor="audit-search">Recherche</label>
          <input
            id="audit-search"
            className="input-field"
            value={saisie.search}
            onChange={(e) => setSaisie({ ...saisie, search: e.target.value })}
            placeholder="Nom, entité…"
          />
        </div>
        <div>
          <label className="label" htmlFor="audit-resultat">Résultat</label>
          <select
            id="audit-resultat"
            className="input-field"
            value={saisie.resultat}
            onChange={(e) => setSaisie({ ...saisie, resultat: e.target.value })}
          >
            <option value="">Tous</option>
            <option value="SUCCES">SUCCES</option>
            <option value="REFUS">REFUS</option>
            <option value="ECHEC">ECHEC</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="audit-date-from">Du</label>
          <input
            id="audit-date-from"
            type="date"
            className="input-field"
            value={saisie.date_from}
            onChange={(e) => setSaisie({ ...saisie, date_from: e.target.value })}
          />
        </div>
        <div>
          <label className="label" htmlFor="audit-date-to">Au</label>
          <input
            id="audit-date-to"
            type="date"
            className="input-field"
            value={saisie.date_to}
            onChange={(e) => setSaisie({ ...saisie, date_to: e.target.value })}
          />
        </div>
        <div className="flex items-end">
          <button type="submit" className="btn-primary flex items-center gap-2">
            <Search className="w-4 h-4" /> Filtrer
          </button>
        </div>
      </form>

      {erreur && (
        <div role="alert" className="flex items-center gap-2 text-red-700 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {erreur.response?.data?.message || 'Le journal n’a pas pu être chargé.'}
        </div>
      )}

      {chargement && <p className="text-gray-400 text-sm">Chargement…</p>}

      {!chargement && !erreur && donnees && donnees.items.length === 0 && (
        <p className="text-gray-400 text-sm py-6 text-center">Aucun événement ne correspond.</p>
      )}

      {!erreur && donnees && donnees.items.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-4 py-3 font-medium text-gray-600">Date</th>
                <th className="px-4 py-3 font-medium text-gray-600">Événement</th>
                <th className="px-4 py-3 font-medium text-gray-600">Acteur</th>
                <th className="px-4 py-3 font-medium text-gray-600">Cible</th>
                <th className="px-4 py-3 font-medium text-gray-600">Résultat</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {donnees.items.map((e) => (
                <tr key={e.id} className="align-top">
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {formaterDate(e.date_action)}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800">{e.type_evenement}</p>
                    {e.evenement_description && (
                      <p className="text-xs text-gray-400">{e.evenement_description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {e.utilisateur_nom || 'Système'}
                    {e.acteur_role && <span className="text-xs text-gray-400"> ({e.acteur_role})</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {e.entite_type ? `${e.entite_type} #${e.entite_id}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${couleurResultat(e.resultat)}`}>
                      {e.resultat}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {(e.avant || e.apres) && (
                      <button
                        type="button"
                        onClick={() => setDetailOuvert(detailOuvert === e.id ? null : e.id)}
                        className="text-xs text-amana-600 hover:underline inline-flex items-center gap-1"
                      >
                        Détail <ChevronDown className="w-3 h-3" />
                      </button>
                    )}
                    {detailOuvert === e.id && (
                      <div className="mt-2 text-left bg-gray-50 rounded p-2 space-y-1">
                        <pre className="text-xs text-gray-600 whitespace-pre-wrap">
                          {JSON.stringify(e.avant, null, 2)}
                        </pre>
                        <pre className="text-xs text-gray-800 whitespace-pre-wrap">
                          {JSON.stringify(e.apres, null, 2)}
                        </pre>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100">
            {donnees.total} événement{donnees.total > 1 ? 's' : ''}
          </div>
        </div>
      )}
    </section>
  )
}
