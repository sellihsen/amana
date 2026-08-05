import { libellesOptions } from '../utils/options'
import { envoyerOperation } from '../services/operations'
import { formaterEur as formatEur } from '../utils/money'
import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import api from '../services/api'
import ExportButtons from '../components/ExportButtons'
import SearchableSelect from '../components/SearchableSelect'


const caisseLabels = {
  electricite: 'Électricité',
  eau:         'Eau',
  loyer:       'Loyer',
  entretien:   'Entretien',
  materiel:    'Matériel',
  salaire:     'Salaire',
  evenement:   'Événement',
  autre:       'Autre',
}

export default function DepensesPage() {
  const [depenses, setDepenses] = useState([])
  const [totaux, setTotaux] = useState({ montant: '0.00', nombre: 0 })
  const [categories, setCategories] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ libelle: '', montant: '', categorie: 'autre', date_depense: new Date().toISOString().split('T')[0], commentaire: '', numero_facture: '' })

  const load = () => api.get('/depenses').then(r => { setDepenses(r.data.items); setTotaux(r.data.totaux) }).catch(console.error)

  const loadCategories = () =>
    // /options ne renvoie que des références ACTIVES, sous forme { id, nom }.
    api.get('/options').then(r => setCategories(libellesOptions(r.data.categories_depenses))).catch(console.error)

  useEffect(() => { load(); loadCategories() }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      await envoyerOperation('/depenses', { ...form })
      setShowModal(false)
      setForm({ libelle: '', montant: '', categorie: categories[0] || 'autre', date_depense: new Date().toISOString().split('T')[0], commentaire: '', numero_facture: '' })
      load()
    } catch (err) {
      alert(err.response?.data?.message || 'Erreur.')
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Supprimer cette dépense ?')) return
    await api.delete(`/depenses/${id}`)
    load()
  }

  // Total calculé par PostgreSQL : l'interface ne somme aucun montant.
  const total = totaux.montant

  const columns = [
    { key: 'libelle',    label: 'Libellé',   width: 30 },
    { key: 'categorie',  label: 'Catégorie', width: 20 },
    { key: 'montant',    label: 'Montant',   format: 'eur', width: 18 },
    { key: 'date_depense', label: 'Date',    format: 'date', width: 15 },
    { key: 'commentaire', label: 'Commentaire', width: 30 },
  ]

  const exportData = depenses.map(d => ({
    libelle:      d.libelle,
    categorie:    caisseLabels[d.categorie] || d.categorie,
    montant:      d.montant,
    date_depense: d.date_depense,
    commentaire:  d.commentaire || '',
    numero_facture: d.numero_facture || '',
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dépenses</h1>
          <p className="text-sm text-gray-500 mt-0.5">Total : <span className="font-semibold text-red-600">{formatEur(total)}</span></p>
        </div>
        <div className="flex items-center gap-3">
          <ExportButtons data={exportData} columns={columns} filename="depenses" title="Dépenses" />
          <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Nouvelle dépense
          </button>
        </div>
      </div>

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {['Libellé', 'Catégorie', 'Montant', 'Date', 'N° Facture', 'Commentaire', 'Enregistré par', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {depenses.length === 0 && (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">Aucune dépense enregistrée.</td></tr>
            )}
            {depenses.map(d => (
              <tr key={d.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{d.libelle}</td>
                <td className="px-4 py-3">
                  <span className="bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full text-xs font-medium">{caisseLabels[d.categorie] || d.categorie}</span>
                </td>
                <td className="px-4 py-3 font-semibold text-red-500">{formatEur(d.montant)}</td>
                <td className="px-4 py-3 text-gray-500">{new Date(d.date_depense).toLocaleDateString('fr-FR')}</td>
                <td className="px-4 py-3 text-xs text-gray-500 font-mono">{d.numero_facture || '-'}</td>
                <td className="px-4 py-3 text-gray-400 max-w-xs truncate">{d.commentaire || '-'}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{d.utilisateur_nom || 'Système'}</td>
                <td className="px-4 py-3">
                  <button onClick={() => handleDelete(d.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold mb-4">Nouvelle dépense</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">Libellé *</label>
                <input required className="input-field" value={form.libelle} onChange={e => setForm({...form, libelle: e.target.value})} />
              </div>
              <div>
                <label className="label">Montant (€) *</label>
                <input required type="number" min="0.01" step="0.01" className="input-field" value={form.montant} onChange={e => setForm({...form, montant: e.target.value})} />
              </div>
              <div>
                <label className="label">Catégorie</label>
                <SearchableSelect
                  options={categories}
                  value={form.categorie}
                  onChange={(v) => setForm({ ...form, categorie: v })}
                  placeholder="-- Choisir une catégorie --"
                />
              </div>
              <div>
                <label className="label">Date</label>
                <input type="date" className="input-field" value={form.date_depense} onChange={e => setForm({...form, date_depense: e.target.value})} />
              </div>
              <div>
                <label className="label">Numéro de facture</label>
                <input className="input-field" value={form.numero_facture} onChange={e => setForm({...form, numero_facture: e.target.value})} placeholder="Optionnel" />
              </div>
              <div>
                <label className="label">Commentaire</label>
                <textarea className="input-field" rows={2} value={form.commentaire} onChange={e => setForm({...form, commentaire: e.target.value})} />
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
