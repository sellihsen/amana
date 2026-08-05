import { envoyerOperation } from '../services/operations'
import { formaterEur as formatEur } from '../utils/money'
import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import api from '../services/api'
import ExportButtons from '../components/ExportButtons'
import SearchableSelect from '../components/SearchableSelect'

const STATUTS = ['payee', 'en_attente', 'annulee']
const badgeColor = (s) => ({
  payee:      'bg-green-100 text-green-700',
  en_attente: 'bg-yellow-100 text-yellow-700',
  annulee:    'bg-red-100 text-red-600',
}[s])

export default function CotisationsPage() {
  const [cotisations, setCotisations] = useState([])
  const [totaux, setTotaux] = useState({ montant: '0.00', nombre: 0 })
  const [membres, setMembres]         = useState([])
  const [showModal, setShowModal]     = useState(false)
  const [form, setForm] = useState({
    membre_id: '', montant: '', annee: new Date().getFullYear(),
    mois: '', date_paiement: new Date().toISOString().split('T')[0],
    statut: 'payee', commentaire: ''
  })

  const load = () => {
    api.get('/cotisations').then(r => { setCotisations(r.data.items); setTotaux(r.data.totaux) }).catch(console.error)
    api.get('/membres').then(r => setMembres(r.data)).catch(console.error)
  }
  useEffect(() => { load() }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      await envoyerOperation('/cotisations', { ...form, mois: form.mois || null })
      setShowModal(false)
      load()
    } catch (err) {
      alert(err.response?.data?.message || 'Erreur.')
    }
  }

  // Total calculé par PostgreSQL : l'interface ne somme aucun montant.
  const total = totaux.montant

  const columns = [
    { key: 'membre',   label: 'Membre',    width: 25 },
    { key: 'montant',  label: 'Montant',   format: 'eur', width: 18 },
    { key: 'annee',    label: 'Année',     width: 12 },
    { key: 'mois',     label: 'Mois',      width: 12 },
    { key: 'date_paiement', label: 'Date', format: 'date', width: 15 },
    { key: 'statut',   label: 'Statut',    width: 15 },
  ]

  const exportData = cotisations.map(c => ({
    membre:    `${c.membre_nom} ${c.membre_prenom}`,
    montant:   c.montant,
    annee:     c.annee,
    mois:      c.mois || 'Annuel',
    date_paiement: c.date_paiement,
    statut:    c.statut.replace('_', ' '),
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cotisations</h1>
          <p className="text-sm text-gray-500 mt-0.5">Perçues : <span className="font-semibold text-amana-700">{formatEur(total)}</span></p>
        </div>
        <div className="flex items-center gap-3">
          <ExportButtons data={exportData} columns={columns} filename="cotisations" title="Cotisations membres" />
          <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Nouvelle cotisation
          </button>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {['Membre', 'Montant', 'Année', 'Mois', 'Date paiement', 'Statut'].map(h => (
                <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {cotisations.length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">Aucune cotisation.</td></tr>
            )}
            {cotisations.map(c => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{c.membre_nom} {c.membre_prenom}</td>
                <td className="px-4 py-3 font-semibold text-amana-700">{formatEur(c.montant)}</td>
                <td className="px-4 py-3">{c.annee}</td>
                <td className="px-4 py-3 text-gray-500">{c.mois || '-'}</td>
                <td className="px-4 py-3 text-gray-500">{new Date(c.date_paiement).toLocaleDateString('fr-FR')}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badgeColor(c.statut)}`}>
                    {c.statut.replace('_', ' ')}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold mb-4">Nouvelle cotisation</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">Membre *</label>
                <SearchableSelect
                  required
                  options={membres.map(m => ({ value: String(m.id), label: `${m.nom} ${m.prenom}` }))}
                  value={form.membre_id}
                  onChange={(v) => setForm({ ...form, membre_id: v })}
                  placeholder="-- Sélectionner --"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Montant (€) *</label>
                  <input required type="number" min="0.01" step="0.01" className="input-field" value={form.montant} onChange={e => setForm({...form, montant: e.target.value})} />
                </div>
                <div>
                  <label className="label">Année *</label>
                  <input required type="number" className="input-field" value={form.annee} onChange={e => setForm({...form, annee: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Mois (optionnel)</label>
                  <select className="input-field" value={form.mois} onChange={e => setForm({...form, mois: e.target.value})}>
                    <option value="">Annuel</option>
                    {[...Array(12)].map((_, i) => <option key={i+1} value={i+1}>{i+1}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Statut</label>
                  <select className="input-field" value={form.statut} onChange={e => setForm({...form, statut: e.target.value})}>
                    {STATUTS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Date de paiement</label>
                <input type="date" className="input-field" value={form.date_paiement} onChange={e => setForm({...form, date_paiement: e.target.value})} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1">Enregistrer</button>
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Annuler</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
