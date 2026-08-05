import BilanSocial from '../components/BilanSocial'
import { envoyerOperation, normaliserMontants } from '../services/operations'
import { useEffect, useState } from 'react'
import { formaterEur as formatEur } from '../utils/money'
import {
  HandHeart, Users, Plus, Pencil, Trash2, AlertCircle, Search,
  ArrowRight, Wallet, TrendingUp, FileText,
} from 'lucide-react'
import api from '../services/api'
import { useCapacite } from '../components/RoleGuard'
import { CAPACITES } from '../utils/permissions'

const TABS = [
  { key: 'familles', label: 'Registre des Familles', icon: Users },
  { key: 'bilan',    label: 'Bilan & Distribution', icon: FileText },
]

const FREQUENCES = ['Mensuelle', 'Ponctuelle', 'Fêtes']

const emptyFamille = {
  nom_responsable: '', adresse: '', telephone: '',
  ressources_mensuelles: '', nb_membres_famille: '1',
  details_membres: '[]', montant_recommande_aide: '',
  frequence_aide: 'Mensuelle', commentaires: '',
}

export default function SocialPage() {
  const [tab, setTab] = useState('familles')
  // Le rôle vient de l'état de session alimenté par GET /auth/me, jamais du
  // stockage local. Enregistrer un versement est une écriture métier : elle
  // est ouverte au trésorier comme à l'administrateur.
  const peutEnregistrerVersement = useCapacite(CAPACITES.BUSINESS_WRITE)

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-rose-50 rounded-xl">
          <HandHeart className="w-6 h-6 text-rose-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Solidarité & Social</h1>
          <p className="text-sm text-gray-500">Gestion des familles nécessiteuses et distributions sociales</p>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>

      {tab === 'familles' && <RegistreFamilles />}
      {tab === 'bilan' && <BilanDistribution peutEnregistrerVersement={peutEnregistrerVersement} />}
    </div>
  )
}

// ─── SOUS-ONGLET 1 : Registre des Familles ──────────────────────────────
function RegistreFamilles() {
  const [familles, setFamilles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null) // null | 'create' | famille object
  const [fiche, setFiche] = useState(null)

  const load = () => {
    setLoading(true)
    api.get('/social/familles')
      .then(r => setFamilles(r.data))
      .catch(err => setError(err.response?.data?.message || 'Erreur.'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const filtered = familles.filter(f =>
    !search || f.nom_responsable.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-4">
      {/* Barre d'outils */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="input-field pl-9"
            placeholder="Rechercher une famille..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button onClick={() => setModal('create')} className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold px-4 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm">
          <Plus className="w-4 h-4" /> Ajouter une famille
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 p-3 rounded-lg text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      {/* Tableau */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Responsable</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Téléphone</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Membres</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Ressources</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Frédquence</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Déjà versé</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={7} className="text-center py-10 text-gray-400">Chargement...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-10 text-gray-400">Aucune famille enregistrée.</td></tr>
            ) : filtered.map(f => (
              <tr key={f.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setFiche(f)}>
                <td className="px-4 py-3 font-medium text-gray-800">{f.nom_responsable}</td>
                <td className="px-4 py-3 text-gray-500">{f.telephone || '—'}</td>
                <td className="px-4 py-3 text-center text-gray-700">{f.nb_membres_famille}</td>
                <td className="px-4 py-3 text-right text-gray-600">{formatEur(f.ressources_mensuelles)}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    f.frequence_aide === 'Mensuelle' ? 'bg-blue-50 text-blue-700'
                    : f.frequence_aide === 'Ponctuelle' ? 'bg-amber-50 text-amber-700'
                    : 'bg-green-50 text-green-700'
                  }`}>{f.frequence_aide}</span>
                </td>
                <td className="px-4 py-3 text-right font-semibold text-rose-600">{formatEur(f.total_aide_verse)}</td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={(e) => { e.stopPropagation(); setFiche(f) }}
                    className="p-1.5 text-amana-600 hover:bg-amana-50 rounded-lg"
                    title="Voir la fiche"
                  >
                    <FileText className="w-4 h-4" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setModal(f) }} className="p-1.5 text-gray-400 hover:text-amana-600 rounded-lg" title="Modifier">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(f.id) }} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg" title="Supprimer">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal de création / édition */}
      {modal && (
        <FamilleModal
          item={modal === 'create' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load() }}
        />
      )}

      {/* Fiche d'identification */}
      {fiche && <FicheFamille famille={fiche} onClose={() => setFiche(null)} />}
    </div>
  )

  async function handleDelete(id) {
    if (!confirm('Supprimer cette famille ?')) return
    try {
      await api.delete(`/social/familles/${id}`)
      load()
    } catch (err) {
      alert(err.response?.data?.message || 'Erreur.')
    }
  }
}

// ─── Modal Famille ──────────────────────────────────────────────────────
function FamilleModal({ item, onClose, onSaved }) {
  const [form, setForm] = useState(item ? {
    nom_responsable: item.nom_responsable,
    adresse: item.adresse || '',
    telephone: item.telephone || '',
    ressources_mensuelles: String(item.ressources_mensuelles || ''),
    nb_membres_famille: String(item.nb_membres_famille || '1'),
    montant_recommande_aide: String(item.montant_recommande_aide || ''),
    frequence_aide: item.frequence_aide || 'Mensuelle',
    commentaires: item.commentaires || '',
  } : emptyFamille)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const isEdit = Boolean(item)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      // Les montants de la fiche famille sont eux aussi des chaînes EUR
      // exactes : le serveur les valide comme tous les autres.
      const data = normaliserMontants(
        { ...form, nb_membres_famille: parseInt(form.nb_membres_famille, 10) || 1 },
        ['ressources_mensuelles', 'montant_recommande_aide']
      )
      if (isEdit) {
        await api.put(`/social/familles/${item.id}`, data)
      } else {
        await api.post('/social/familles', data)
      }
      onSaved()
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold mb-1">
          {isEdit ? `Modifier : ${item.nom_responsable}` : 'Ajouter une famille'}
        </h2>
        <p className="text-sm text-gray-500 mb-5">
          {isEdit ? 'Mettez à jour les informations.' : 'Enregistrez une nouvelle famille nécessiteuse.'}
        </p>
        {error && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm mb-4">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Nom du responsable <span className="text-red-500">*</span></label>
            <input required className="input-field" value={form.nom_responsable} onChange={e => setForm({...form, nom_responsable: e.target.value})} placeholder="Ex : Ahmed Mohamed" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Téléphone</label>
              <input className="input-field" value={form.telephone} onChange={e => setForm({...form, telephone: e.target.value})} placeholder="06..." />
            </div>
            <div>
              <label className="label">Ressources mensuelles (€)</label>
              <input type="number" min="0" className="input-field" value={form.ressources_mensuelles} onChange={e => setForm({...form, ressources_mensuelles: e.target.value})} placeholder="0" />
            </div>
          </div>
          <div>
            <label className="label">Adresse</label>
            <input className="input-field" value={form.adresse} onChange={e => setForm({...form, adresse: e.target.value})} placeholder="Adresse complète..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Nombre de membres</label>
              <input type="number" min="1" className="input-field" value={form.nb_membres_famille} onChange={e => setForm({...form, nb_membres_famille: e.target.value})} />
            </div>
            <div>
              <label className="label">Frédquence d'aide</label>
              <select className="input-field" value={form.frequence_aide} onChange={e => setForm({...form, frequence_aide: e.target.value})}>
                {FREQUENCES.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Montant recommandé (€)</label>
            <input type="number" min="0" className="input-field" value={form.montant_recommande_aide} onChange={e => setForm({...form, montant_recommande_aide: e.target.value})} placeholder="0" />
          </div>
          <div>
            <label className="label">Commentaires</label>
            <textarea className="input-field" rows={3} value={form.commentaires} onChange={e => setForm({...form, commentaires: e.target.value})} placeholder="Situation familiale, observations..." />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={loading} className="btn-primary flex-1">{loading ? 'Sauvegarde...' : (isEdit ? 'Mettre à jour' : 'Ajouter')}</button>
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Annuler</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Fiche d'identification famille ─────────────────────────────────────
function FicheFamille({ famille, onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get(`/social/familles/${famille.id}`)
      .then(r => setData(r.data))
      .catch(err => setError(err.response?.data?.message || 'Erreur.'))
      .finally(() => setLoading(false))
  }, [famille.id])

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 text-center text-gray-400">Chargement...</div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 text-center">
          <p className="text-red-600 mb-4">{error || 'Impossible de charger la fiche.'}</p>
          <button onClick={onClose} className="btn-secondary">Fermer</button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
        {/* En-tête */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{data.nom_responsable}</h2>
            <p className="text-sm text-gray-500 mt-1">Fiche d'identification</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
            ✕
          </button>
        </div>

        {/* Infos */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-gray-50 p-3 rounded-lg">
            <p className="text-xs text-gray-500 mb-1">Téléphone</p>
            <p className="text-sm font-medium">{data.telephone || 'Non renseigné'}</p>
          </div>
          <div className="bg-gray-50 p-3 rounded-lg">
            <p className="text-xs text-gray-500 mb-1">Adresse</p>
            <p className="text-sm font-medium">{data.adresse || 'Non renseignée'}</p>
          </div>
          <div className="bg-gray-50 p-3 rounded-lg">
            <p className="text-xs text-gray-500 mb-1">Membres du foyer</p>
            <p className="text-sm font-medium">{data.nb_membres_famille} personne(s)</p>
          </div>
          <div className="bg-gray-50 p-3 rounded-lg">
            <p className="text-xs text-gray-500 mb-1">Ressources mensuelles</p>
            <p className="text-sm font-medium">{formatEur(data.ressources_mensuelles)}</p>
          </div>
          <div className="bg-gray-50 p-3 rounded-lg">
            <p className="text-xs text-gray-500 mb-1">Aide recommandée</p>
            <p className="text-sm font-medium">{formatEur(data.montant_recommande_aide)}</p>
          </div>
          <div className="bg-gray-50 p-3 rounded-lg">
            <p className="text-xs text-gray-500 mb-1">Frédquence d'aide</p>
            <p className="text-sm font-medium">{data.frequence_aide}</p>
          </div>
        </div>

        {/* Total déjà versé */}
        <div className="flex items-center gap-4 mb-6 p-4 bg-rose-50 rounded-xl">
          <Wallet className="w-6 h-6 text-rose-500" />
          <div>
            <p className="text-xs text-rose-600 font-medium">Total des aides déjà versées</p>
            <p className="text-2xl font-bold text-rose-700">{formatEur(data.total_aide_verse)}</p>
            <p className="text-xs text-rose-500">{data.nb_aides} distribution(s)</p>
          </div>
        </div>

        {/* Historique */}
        <h3 className="font-semibold text-gray-800 mb-3">Historique des distributions</h3>
        {data.historique?.length === 0 ? (
          <p className="text-sm text-gray-400">Aucune distribution enregistrée.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Date</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Caisse d'origine</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Montant</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Commentaire</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.historique.map(d => (
                  <tr key={d.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-xs text-gray-500">{new Date(d.date_versement).toLocaleDateString('fr-FR')}</td>
                    <td className="px-3 py-2 font-medium text-gray-700">{d.caisse_nom || '—'}</td>
                    <td className="px-3 py-2 text-right font-semibold text-rose-600">{formatEur(d.montant_verse)}</td>
                    <td className="px-3 py-2 text-xs text-gray-400">{d.commentaire || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-end mt-6">
          <button onClick={onClose} className="btn-secondary">Fermer</button>
        </div>
      </div>
    </div>
  )
}

// ─── SOUS-ONGLET 2 : Bilan & Distribution ───────────────────────────────
function BilanDistribution({ peutEnregistrerVersement }) {
  const [bilan, setBilan] = useState({
    total_collecte: '0.00',
    total_distribue: '0.00',
    reste_disponible: '0.00',
    caisses: [],
  })
  const [caissesSociales, setCaissesSociales] = useState([])
  const [familles, setFamilles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [distrib, setDistrib] = useState({ famille_id: '', caisse_origine_id: '', montant_verse: '', date_versement: '', commentaire: '' })
  const [success, setSuccess] = useState('')

  const load = () => {
    setLoading(true)
    Promise.all([
      api.get('/social/bilan'),
      api.get('/social/familles'),
    ])
      .then(([b, f]) => {
        setBilan(b.data)
        setFamilles(f.data)
      })
      .catch(err => setError(err.response?.data?.message || 'Erreur.'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  // Caisses sociales pour le formulaire
  useEffect(() => {
    api.get('/caisses').then(r => setCaissesSociales(r.data.filter(c => c.affectation === 'Social'))).catch(() => {})
  }, [])

  const handleDistrib = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    try {
      await envoyerOperation('/social/distributions', distrib, {
        champsMontant: ['montant_verse'],
      })
      setDistrib({ famille_id: '', caisse_origine_id: '', montant_verse: '', date_versement: '', commentaire: '' })
      setSuccess('✅ Distribution enregistrée.')
      load()
      setTimeout(() => setSuccess(''), 4000)
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur lors de l\'enregistrement.')
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div role="alert" className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 p-3 rounded-lg text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      {/* Synthèse : collecté, distribué et disponible viennent du grand livre */}
      <BilanSocial bilan={bilan} />

      {/* Tableau d'équilibre */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Bilan des caisses sociales</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Caisse</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Collecté</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Distribué</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Reste disponible</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Familles aidées</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">Chargement...</td></tr>
            ) : bilan.caisses.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">Aucune caisse sociale configurée.</td></tr>
            ) : bilan.caisses.map(b => (
              <tr key={b.caisse_id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-800">{b.caisse_nom}</td>
                <td className="px-4 py-3 text-right text-green-600 font-medium">{formatEur(b.total_collecte)}</td>
                <td className="px-4 py-3 text-right text-rose-600 font-medium">{formatEur(b.total_distribue)}</td>
                <td className="px-4 py-3 text-right font-bold text-gray-900">{formatEur(b.reste_disponible)}</td>
                <td className="px-4 py-3 text-center text-gray-600">{b.nb_familles_aidees}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Formulaire de distribution */}
      {peutEnregistrerVersement && (
        <div className="card">
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-rose-500" />
            Enregistrer un versement d'aide
          </h2>

          {success && (
            <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 p-3 rounded-lg text-sm mb-4">
              {success}
            </div>
          )}

          <form onSubmit={handleDistrib} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="label">Famille <span className="text-red-500">*</span></label>
              <select required className="input-field" value={distrib?.famille_id || ''} onChange={e => setDistrib({...distrib, famille_id: parseInt(e.target.value)})}>
                <option value="">Sélectionner...</option>
                {familles.map(f => <option key={f.id} value={f.id}>{f.nom_responsable}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Caisse d'origine <span className="text-red-500">*</span></label>
              <select required className="input-field" value={distrib?.caisse_origine_id || ''} onChange={e => setDistrib({...distrib, caisse_origine_id: parseInt(e.target.value)})}>
                <option value="">Sélectionner...</option>
                {caissesSociales.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Montant versé (€) <span className="text-red-500">*</span></label>
              <input required type="number" min="1" step="0.01" className="input-field" value={distrib?.montant_verse || ''} onChange={e => setDistrib({...distrib, montant_verse: e.target.value})} placeholder="50" />
            </div>
            <div className="flex items-end">
              <button type="submit" className="btn-primary w-full flex items-center justify-center gap-2">
                <ArrowRight className="w-4 h-4" /> Valider
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
