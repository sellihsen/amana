import { nouvelleCleIdempotence } from '../services/operations'
import { useEffect, useState } from 'react'
import {
  Package, Plus, Pencil, Trash2, AlertCircle, AlertTriangle,
  CheckCircle2, PlusCircle, MinusCircle,
} from 'lucide-react'
import api from '../services/api'
import ExportButtons from '../components/ExportButtons'

const EMPTY = {
  nom: '', categorie: 'Construction', quantite_actuelle: '',
  quantite_minimale_alerte: '10', unite: 'Pièces', emplacement: '',
}

export default function StockPage() {
  const [produits, setProduits] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionLoading, setActionLoading] = useState(null)

  const load = () => {
    setLoading(true)
    api.get('/stock').then(r => setProduits(r.data)).catch(console.error).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY)
    setError('')
    setShowModal(true)
  }

  const openEdit = (p) => {
    setEditing(p)
    setForm({
      nom: p.nom,
      categorie: p.categorie,
      quantite_actuelle: String(p.quantite_actuelle),
      quantite_minimale_alerte: String(p.quantite_minimale_alerte),
      unite: p.unite,
      emplacement: p.emplacement || '',
    })
    setError('')
    setShowModal(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      if (editing) {
        await api.put(`/stock/${editing.id}`, {
          ...form,
          quantite_actuelle: parseInt(form.quantite_actuelle) || 0,
          quantite_minimale_alerte: parseInt(form.quantite_minimale_alerte) || 10,
        })
      } else {
        await api.post('/stock', {
          ...form,
          quantite_actuelle: parseInt(form.quantite_actuelle) || 0,
          quantite_minimale_alerte: parseInt(form.quantite_minimale_alerte) || 10,
        })
      }
      setShowModal(false)
      load()
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur.')
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Supprimer ce produit ?')) return
    try {
      await api.delete(`/stock/${id}`)
      load()
    } catch (err) { alert('Erreur.') }
  }

  // Variation d'une unité. La clé d'idempotence protège du double clic ; un
  // refus (stock insuffisant) est affiché, jamais silencieusement écrêté.
  const handleQty = async (id, type) => {
    setActionLoading(id)
    setError('')
    try {
      await api.post(
        `/stock/${id}/mouvements`,
        { type, quantite: 1 },
        { headers: { 'Idempotency-Key': nouvelleCleIdempotence() } }
      )
      load()
    } catch (err) {
      setError(err.response?.data?.message || 'Le mouvement n’a pas pu être enregistré.')
    } finally {
      setActionLoading(null)
    }
  }

  const enAlerte = (p) => p.quantite_actuelle <= p.quantite_minimale_alerte
  const nbAlertes = produits.filter(enAlerte).length
  // Comptage d'unités physiques (pas un montant) : autorisé côté interface.
  const totalItems = produits.reduce((s, p) => s + p.quantite_actuelle, 0)

  const columns = [
    { key: 'nom', label: 'Produit', width: 25 },
    { key: 'categorie', label: 'Catégorie', width: 18 },
    { key: 'quantite_actuelle', label: 'Qté', width: 10 },
    { key: 'seuil', label: 'Seuil alerte', width: 14 },
    { key: 'statut', label: 'Statut', width: 18 },
    { key: 'unite', label: 'Unité', width: 12 },
    { key: 'emplacement', label: 'Emplacement', width: 20 },
  ]

  const exportData = produits.map(p => ({
    nom: p.nom,
    categorie: p.categorie,
    quantite_actuelle: p.quantite_actuelle,
    seuil: p.quantite_minimale_alerte,
    statut: enAlerte(p) ? 'Stock critique' : 'Stock OK',
    unite: p.unite,
    emplacement: p.emplacement || '—',
  }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-100 rounded-xl">
            <Package className="w-6 h-6 text-amber-700" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Gestion des Stocks</h1>
            <p className="text-sm text-gray-500">
              {totalItems} unités en stock · {produits.length} produit{produits.length > 1 ? 's' : ''}
              {nbAlertes > 0 && (
                <span className="ml-2 text-red-500 font-medium">· {nbAlertes} alerte{nbAlertes > 1 ? 's' : ''}</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ExportButtons data={exportData} columns={columns} filename="inventaire-stock" title="Inventaire des stocks" />
          <button onClick={openCreate} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Ajouter un produit
          </button>
        </div>
      </div>

      {/* Bandeau alerte */}
      {nbAlertes > 0 && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm font-medium">
            {nbAlertes} matériau ou fourniture{nbAlertes > 1 ? 'x sont' : ' est'} en stock critique (quantité ≤ seuil d'alerte).
          </p>
        </div>
      )}

      {/* Tableau */}
      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {['Produit', 'Catégorie', 'Quantité', 'Seuil', 'Statut', 'Unité', 'Emplacement', 'Actions'].map(h => (
                <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={8} className="text-center py-10 text-gray-400">Chargement...</td></tr>
            ) : produits.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-10 text-gray-400">Aucun produit en stock.</td></tr>
            ) : produits.map(p => {
              const alerte = enAlerte(p)
              return (
                <tr key={p.id} className={`hover:bg-gray-50 ${alerte ? 'bg-red-50/40' : ''}`}>
                  <td className="px-4 py-3 font-medium text-gray-800">{p.nom}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      p.categorie === 'Construction'
                        ? 'bg-orange-50 text-orange-700'
                        : p.categorie === "Fournitures École"
                        ? 'bg-teal-50 text-teal-700'
                        : 'bg-blue-50 text-blue-700'
                    }`}>
                      {p.categorie}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold tabular-nums">
                    <span className={alerte ? 'text-red-600' : 'text-gray-800'}>
                      {p.quantite_actuelle}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{p.quantite_minimale_alerte}</td>
                  <td className="px-4 py-3">
                    {alerte ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 animate-pulse">
                        <AlertTriangle className="w-3 h-3" />
                        Alerte Stock Critique
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        <CheckCircle2 className="w-3 h-3" />
                        Stock OK
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{p.unite}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{p.emplacement || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleQty(p.id, 'SORTIE')}
                        disabled={actionLoading === p.id || p.quantite_actuelle <= 0}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-30"
                        title="Sortie (retirer 1)"
                      >
                        <MinusCircle className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleQty(p.id, 'ENTREE')}
                        disabled={actionLoading === p.id}
                        className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg disabled:opacity-30"
                        title="Entrée (ajouter 1)"
                      >
                        <PlusCircle className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openEdit(p)}
                        className="p-1.5 text-gray-400 hover:text-amana-600 hover:bg-amana-50 rounded-lg"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold mb-1">
              {editing ? 'Modifier le produit' : 'Ajouter un produit'}
            </h2>
            <p className="text-sm text-gray-500 mb-5">
              {editing ? 'Mettez à jour les informations.' : 'Renseignez les détails du nouveau produit.'}
            </p>
            {error && (
              <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm mb-4">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">Nom du produit <span className="text-red-500">*</span></label>
                <input required className="input-field" value={form.nom} onChange={e => setForm({...form, nom: e.target.value})} placeholder="Ex : Sacs de ciment" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Catégorie</label>
                  <select className="input-field" value={form.categorie} onChange={e => setForm({...form, categorie: e.target.value})}>
                    <option value="Construction">Construction</option>
                    <option value="Fournitures École">Fournitures École</option>
                    <option value="Entretien">Entretien</option>
                  </select>
                </div>
                <div>
                  <label className="label">Unité</label>
                  <select className="input-field" value={form.unite} onChange={e => setForm({...form, unite: e.target.value})}>
                    <option value="Pièces">Pièces</option>
                    <option value="Sacs">Sacs</option>
                    <option value="Litres">Litres</option>
                    <option value="Kg">Kg</option>
                    <option value="Mètres">Mètres</option>
                    <option value="Boîtes">Boîtes</option>
                    <option value="Rouleaux">Rouleaux</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Quantité actuelle</label>
                  <input type="number" min="0" className="input-field" value={form.quantite_actuelle} onChange={e => setForm({...form, quantite_actuelle: e.target.value})} />
                </div>
                <div>
                  <label className="label">Seuil d'alerte</label>
                  <input type="number" min="0" className="input-field" value={form.quantite_minimale_alerte} onChange={e => setForm({...form, quantite_minimale_alerte: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="label">Emplacement / Zone de stockage</label>
                <input className="input-field" value={form.emplacement} onChange={e => setForm({...form, emplacement: e.target.value})} placeholder="Ex : Réserve RDC, Arrière bâtiment..." />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1">{editing ? 'Mettre à jour' : 'Ajouter'}</button>
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Annuler</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
