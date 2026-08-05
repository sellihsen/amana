import MessageHistorique from '../components/MessageHistorique'
import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Search } from 'lucide-react'
import api from '../services/api'
import ExportButtons from '../components/ExportButtons'

const STATUTS = ['actif', 'inactif', 'suspendu']

const badgeColor = (s) => ({
  actif:    'bg-green-100 text-green-700',
  inactif:  'bg-gray-100 text-gray-600',
  suspendu: 'bg-red-100 text-red-600',
}[s] || 'bg-gray-100 text-gray-600')

const emptyForm = { nom: '', prenom: '', email: '', telephone: '', adresse: '', statut: 'actif' }

export default function MembresPage() {
  const [membres, setMembres] = useState([])
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [erreur, setErreur] = useState(null)

  const load = () => api.get('/membres').then(r => setMembres(r.data.items)).catch(console.error)
  useEffect(() => { load() }, [])

  const filtered = membres.filter(m =>
    `${m.nom} ${m.prenom} ${m.email}`.toLowerCase().includes(search.toLowerCase())
  )

  const openCreate = () => { setEditing(null); setForm(emptyForm); setShowModal(true) }
  const openEdit   = (m) => { setEditing(m); setForm({ nom: m.nom, prenom: m.prenom || '', email: m.email || '', telephone: m.telephone || '', adresse: m.adresse || '', statut: m.statut }); setShowModal(true) }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      if (editing) await api.put(`/membres/${editing.id}`, form)
      else         await api.post('/membres', form)
      setShowModal(false)
      load()
    } catch (err) {
      setErreur(err)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Supprimer ce membre ?')) return
    setErreur(null)
    try {
      await api.delete(`/membres/${id}`)
      load()
    } catch (err) {
      // 409 HISTORY_EXISTS : la suppression est refusée pour préserver les
      // dons et cotisations rattachés. On propose la désactivation.
      setErreur(err)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Membres</h1>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Nouveau membre
        </button>
      </div>

      <MessageHistorique erreur={erreur} />

      {/* Recherche + Export */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-field pl-10 w-full"
            placeholder="Rechercher un membre..."
          />
        </div>
        <ExportButtons
          data={filtered}
          columns={[
            { key: 'nom', label: 'Nom', width: 20 },
            { key: 'prenom', label: 'Prénom', width: 20 },
            { key: 'email', label: 'Email', width: 30 },
            { key: 'telephone', label: 'Téléphone', width: 20 },
            { key: 'statut', label: 'Statut', width: 15 },
            { key: 'date_adhesion', label: 'Adhésion', format: 'date', width: 15 },
          ]}
          filename="membres"
          title="Liste des membres"
        />
      </div>

      {/* Tableau */}
      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {['Nom', 'Email', 'Téléphone', 'Statut', 'Adhésion', 'Actions'].map(h => (
                <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">Aucun membre.</td></tr>
            )}
            {filtered.map(m => (
              <tr key={m.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{m.nom} {m.prenom}</td>
                <td className="px-4 py-3 text-gray-500">{m.email || '-'}</td>
                <td className="px-4 py-3 text-gray-500">{m.telephone || '-'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badgeColor(m.statut)}`}>
                    {m.statut}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {m.date_adhesion ? new Date(m.date_adhesion).toLocaleDateString('fr-FR') : '-'}
                </td>
                <td className="px-4 py-3 flex gap-2">
                  <button onClick={() => openEdit(m)} className="p-1.5 text-gray-400 hover:text-amana-600 rounded">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(m.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold mb-4">{editing ? 'Modifier le membre' : 'Nouveau membre'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Nom *</label>
                  <input required className="input-field" value={form.nom} onChange={e => setForm({...form, nom: e.target.value})} />
                </div>
                <div>
                  <label className="label">Prénom</label>
                  <input className="input-field" value={form.prenom} onChange={e => setForm({...form, prenom: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="label">Email</label>
                <input type="email" className="input-field" value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
              </div>
              <div>
                <label className="label">Téléphone</label>
                <input className="input-field" value={form.telephone} onChange={e => setForm({...form, telephone: e.target.value})} />
              </div>
              <div>
                <label className="label">Adresse</label>
                <textarea className="input-field" rows={2} value={form.adresse} onChange={e => setForm({...form, adresse: e.target.value})} />
              </div>
              <div>
                <label className="label">Statut</label>
                <select className="input-field" value={form.statut} onChange={e => setForm({...form, statut: e.target.value})}>
                  {STATUTS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1">
                  {editing ? 'Mettre à jour' : 'Créer'}
                </button>
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">
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
