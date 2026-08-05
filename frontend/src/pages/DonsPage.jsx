import { envoyerOperation } from '../services/operations'
import { formaterEur as formatEur } from '../utils/money'
import { useEffect, useState } from 'react'
import { Plus, Trash2, AlertCircle } from 'lucide-react'
import api from '../services/api'
import ExportButtons from '../components/ExportButtons'
import SearchableSelect from '../components/SearchableSelect'


const emptyForm = {
  membre_id:   '',
  montant:     '',
  caisse_id:   '',
  date_don:    new Date().toISOString().split('T')[0],
  commentaire: '',
  anonyme:     false,
}

export default function DonsPage() {
  const [dons,    setDons]    = useState([])
  const [membres, setMembres] = useState([])
  const [totaux, setTotaux] = useState({ montant: '0.00', nombre: 0 })
  const [caisses, setCaisses] = useState([])
  const [caissesLoading, setCaissesLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(emptyForm)

  const load = () => {
    api.get('/dons').then(r => { setDons(r.data.items); setTotaux(r.data.totaux) }).catch(console.error)
    api.get('/membres').then(r => setMembres(r.data)).catch(console.error)
  }

  const loadCaisses = () => {
    setCaissesLoading(true)
    api.get('/caisses')
      .then(r => {
        setCaisses(r.data)
        if (r.data.length > 0) {
          setForm(f => ({ ...f, caisse_id: String(r.data[0].id) }))
        }
      })
      .catch(console.error)
      .finally(() => setCaissesLoading(false))
  }

  useEffect(() => {
    load()
    loadCaisses()
  }, [])

  const openModal = () => {
    setForm({
      ...emptyForm,
      caisse_id: caisses.length > 0 ? String(caisses[0].id) : '',
      date_don:  new Date().toISOString().split('T')[0],
    })
    setShowModal(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      await envoyerOperation('/dons', {
        ...form,
        membre_id: form.membre_id || null,
        caisse_id: parseInt(form.caisse_id, 10),
      })
      setShowModal(false)
      load()
    } catch (err) {
      alert(err.response?.data?.message || 'Erreur.')
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Supprimer ce don ?')) return
    await api.delete(`/dons/${id}`)
    load()
  }

  // Total calculé par PostgreSQL : l'interface ne somme aucun montant.
  const total = totaux.montant

  const columns = [
    { key: 'donateur',     label: 'Donateur',  width: 25 },
    { key: 'caisse_nom',   label: 'Caisse',    width: 25 },
    { key: 'montant',      label: 'Montant',   format: 'eur', width: 18 },
    { key: 'date_don',     label: 'Date',      format: 'date', width: 15 },
    { key: 'commentaire',  label: 'Commentaire', width: 30 },
  ]

  const exportData = dons.map(d => ({
    donateur:    d.anonyme ? 'Anonyme' : (d.membre_nom ? `${d.membre_nom} ${d.membre_prenom || ''}` : 'Externe'),
    caisse_nom:  d.caisse_nom || '—',
    montant:     d.montant,
    date_don:    d.date_don,
    commentaire: d.commentaire || '',
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dons</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Total : <span className="font-semibold text-amana-700">{formatEur(total)}</span>
            <span className="ml-2 text-gray-400">({dons.length} don{dons.length > 1 ? 's' : ''})</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ExportButtons data={exportData} columns={columns} filename="dons" title="Dons reçus" />
          <button onClick={openModal} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Enregistrer un don
          </button>
        </div>
      </div>

      {/* Tableau */}
      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {['Donateur', 'Caisse', 'Montant', 'Date', 'Commentaire', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {dons.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-8 text-gray-400">
                  Aucun don enregistré.
                </td>
              </tr>
            )}
            {dons.map(d => (
              <tr key={d.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">
                  {d.anonyme
                    ? <span className="italic text-gray-400">Anonyme</span>
                    : (d.membre_nom ? `${d.membre_nom} ${d.membre_prenom || ''}` : 'Externe')
                  }
                </td>
                <td className="px-4 py-3">
                  <span className="bg-amana-50 text-amana-700 px-2 py-0.5 rounded-full text-xs font-medium">
                    {d.caisse_nom || '—'}
                  </span>
                </td>
                <td className="px-4 py-3 font-semibold text-green-600">{formatEur(d.montant)}</td>
                <td className="px-4 py-3 text-gray-500">
                  {new Date(d.date_don).toLocaleDateString('fr-FR')}
                </td>
                <td className="px-4 py-3 text-gray-400 max-w-xs truncate">
                  {d.commentaire || '—'}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleDelete(d.id)}
                    className="p-1.5 text-gray-400 hover:text-red-600 rounded"
                    title="Supprimer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal d'enregistrement */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold mb-4">Enregistrer un don</h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Caisse */}
              <div>
                <label className="label">
                  Caisse de destination <span className="text-red-500">*</span>
                </label>
                {caissesLoading ? (
                  <div className="input-field text-gray-400">Chargement des caisses...</div>
                ) : caisses.length === 0 ? (
                  <div className="flex items-center gap-2 text-amber-600 bg-amber-50 p-3 rounded-lg text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    Aucune caisse active. Demandez à l'administrateur d'en créer une.
                  </div>
                ) : (
                  <SearchableSelect
                    required
                    options={caisses.map(c => ({ value: String(c.id), label: c.nom }))}
                    value={form.caisse_id}
                    onChange={(v) => setForm({ ...form, caisse_id: v })}
                    placeholder="-- Sélectionner une caisse --"
                  />
                )}
              </div>

              {/* Membre */}
              <div>
                <label className="label">Membre (optionnel)</label>
                <SearchableSelect
                  options={membres.map(m => ({ value: String(m.id), label: `${m.nom} ${m.prenom}` }))}
                  value={form.membre_id}
                  onChange={(v) => setForm({ ...form, membre_id: v })}
                  placeholder="-- Don externe / non membre --"
                />
              </div>

              {/* Montant */}
              <div>
                <label className="label">Montant (€) <span className="text-red-500">*</span></label>
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  className="input-field"
                  placeholder="0.00"
                  value={form.montant}
                  onChange={e => setForm({ ...form, montant: e.target.value })}
                />
              </div>

              {/* Date */}
              <div>
                <label className="label">Date</label>
                <input
                  type="date"
                  className="input-field"
                  value={form.date_don}
                  onChange={e => setForm({ ...form, date_don: e.target.value })}
                />
              </div>

              {/* Commentaire */}
              <div>
                <label className="label">Commentaire</label>
                <textarea
                  className="input-field"
                  rows={2}
                  placeholder="Remarque éventuelle..."
                  value={form.commentaire}
                  onChange={e => setForm({ ...form, commentaire: e.target.value })}
                />
              </div>

              {/* Anonyme */}
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.anonyme}
                  onChange={e => setForm({ ...form, anonyme: e.target.checked })}
                  className="rounded border-gray-300"
                />
                Don anonyme (le nom ne sera pas affiché)
              </label>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={caisses.length === 0}
                  className="btn-primary flex-1"
                >
                  Enregistrer
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn-secondary flex-1"
                >
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
