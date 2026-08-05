import JournalAudit from '../components/JournalAudit'
import { useEffect, useState } from 'react'
import { formaterEur as formatEur } from '../utils/money'
import {
  Settings, Plus, Pencil, Trash2, AlertCircle,
  CheckCircle2, XCircle, ToggleLeft, ToggleRight, HardHat, Save, History,
  Users, Shield, Search, X,
} from 'lucide-react'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'
import { useCapacite } from '../components/RoleGuard'
import { CAPACITES } from '../utils/permissions'

// ─── Composant Toggle ─────────────────────────────────────────────────────────
function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`
        relative inline-flex items-center h-6 w-11 rounded-full transition-colors duration-200 focus:outline-none
        ${checked ? 'bg-amana-600' : 'bg-gray-300'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      <span
        className={`
          inline-block w-4 h-4 bg-white rounded-full shadow transform transition-transform duration-200
          ${checked ? 'translate-x-6' : 'translate-x-1'}
        `}
      />
    </button>
  )
}

// ─── Afficher la liste des catégories avec leurs labels français ──────────────
const LABELS = {
  electricite: 'Électricité',
  eau:         'Eau',
  loyer:       'Loyer',
  entretien:   'Entretien',
  materiel:    'Matériel',
  salaire:     'Salaire',
  evenement:   'Événement',
  autre:       'Autre',
}

// ─── Modal générique pour les configurations ──────────────────────────────────
function ConfigModal({ item, type, onClose, onSaved }) {
  const [nom,         setNom]         = useState(item?.nom         ?? '')
  const [affectation, setAffectation] = useState(item?.affectation ?? 'Fonctionnement')
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')

  const isEdit = Boolean(item)

  const typeLabel = {
    'categories-depenses':  'Catégorie de dépenses',
    'classes-madrasa':      'Classe Madrasa',
    'types-paiement-rh':    'Type de paiement RH',
    'caisses':              'Caisse',
  }[type]

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const body = type === 'caisses' ? { nom, affectation } : { nom }
      if (isEdit) {
        await api.put(`/admin/${type === 'caisses' ? 'caisses' : `config/${type}`}/${item.id}`, body)
      } else {
        if (type === 'caisses') {
          await api.post('/admin/caisses', body)
        } else {
          await api.post(`/admin/config/${type}`, { nom })
        }
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur lors de la sauvegarde.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold mb-1">
          {isEdit ? `Modifier : ${item.nom}` : `Nouvelle ${typeLabel}`}
        </h2>
        <p className="text-sm text-gray-500 mb-5">
          {isEdit ? 'Mettez à jour le nom.' : `Ajoutez une nouvelle ${typeLabel.toLowerCase()}.`}
        </p>

        {error && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm mb-4">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">
              Nom <span className="text-red-500">*</span>
            </label>
            <input
              required
              className="input-field"
              placeholder="Ex : ..."
              value={nom}
              onChange={e => setNom(e.target.value)}
            />
          </div>
          {type === 'caisses' && (
            <div>
              <label className="label">Affectation</label>
              <select className="input-field" value={affectation} onChange={e => setAffectation(e.target.value)}>
                <option value="Fonctionnement">Fonctionnement (caisse générale)</option>
                <option value="Chantier">Chantier (dédié au projet de construction)</option>
                <option value="Social">Social (Zakat, Orphelins, Solidarité)</option>
              </select>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="btn-primary flex-1"
            >
              {loading ? 'Sauvegarde...' : (isEdit ? 'Mettre à jour' : 'Ajouter')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary flex-1"
            >
              Annuler
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Section de configuration générique ───────────────────────────────────────
function ConfigSection({ title, description, type, apiPath, showToggle, displayLabel }) {
  const [items,       setItems]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const [loadError,   setLoadError]   = useState('')
  const [modal,       setModal]       = useState(null)
  const [togglingId,  setTogglingId]  = useState(null)
  const [deleteError, setDeleteError] = useState('')

  const load = () => {
    setLoading(true)
    setLoadError('')
    const url = type === 'caisses' ? '/admin/caisses' : `/admin/config/${type}`
    api.get(url)
      .then(r => setItems(r.data))
      .catch(err => setLoadError(err.response?.data?.message || err.message || 'Erreur de chargement.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [type])

  const handleToggle = async (item, newValue) => {
    setTogglingId(item.id)
    try {
      const url = type === 'caisses' ? `/admin/caisses/${item.id}` : `/admin/config/${type}/${item.id}`
      await api.put(url, { actif: newValue })
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, actif: newValue } : i))
    } catch (err) {
      alert(err.response?.data?.message || 'Erreur.')
    } finally {
      setTogglingId(null)
    }
  }

  const handleDelete = async (item) => {
    setDeleteError('')
    if (!confirm(`Supprimer "${item.nom}" ?`)) return
    try {
      const url = type === 'caisses' ? `/admin/caisses/${item.id}` : `/admin/config/${type}/${item.id}`
      await api.delete(url)
      load()
    } catch (err) {
      setDeleteError(err.response?.data?.message || 'Erreur lors de la suppression.')
    }
  }

  return (
    <section className="card">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-gray-800">{title}</h2>
          <p className="text-sm text-gray-500 mt-0.5">{description}</p>
        </div>
        <button
          onClick={() => setModal('create')}
          className="btn-primary flex items-center gap-2 flex-shrink-0 ml-4"
        >
          <Plus className="w-4 h-4" />
          Ajouter
        </button>
      </div>

      {deleteError && (
        <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 p-3 rounded-lg text-sm mb-4">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{deleteError}
        </div>
      )}

      {loadError && !loading && (
        <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 p-4 rounded-lg text-sm mb-4">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <div>
            <p className="font-medium">Erreur de chargement</p>
            <p className="text-red-500 mt-0.5">{loadError}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-gray-400">Chargement...</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-100">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Nom</th>
                {showToggle && <th className="text-center px-4 py-3 font-medium text-gray-600">Statut</th>}
                {type === 'caisses' && (
                  <>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Affectation</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Dons</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Total</th>
                  </>
                )}
                {type !== 'caisses' && (
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Références</th>
                )}
                <th className="text-center px-4 py-3 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gray-400">
                    Aucun élément configuré.
                  </td>
                </tr>
              )}
              {items.map(item => (
                <tr key={item.id} className={item.actif === false ? 'bg-gray-50/50 opacity-75' : 'hover:bg-gray-50'}>
                  <td className="px-4 py-3">
                    <span className={`font-medium ${item.actif === false ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                      {displayLabel ? (LABELS[item.nom] || item.nom) : item.nom}
                    </span>
                  </td>
                  {showToggle && (
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <Toggle
                          checked={item.actif !== false}
                          onChange={(val) => handleToggle(item, val)}
                          disabled={togglingId === item.id}
                        />
                        <span className={`text-xs font-medium ${item.actif !== false ? 'text-amana-600' : 'text-gray-400'}`}>
                          {item.actif !== false ? 'Actif' : 'Inactif'}
                        </span>
                      </div>
                    </td>
                  )}
                  {type === 'caisses' && (
                    <>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          item.affectation === 'Chantier'
                            ? 'bg-amber-50 text-amber-700'
                            : item.affectation === 'Social'
                            ? 'bg-purple-50 text-purple-700'
                            : 'bg-blue-50 text-blue-700'
                        }`}>
                          {item.affectation || 'Fonctionnement'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">{item.nb_dons}</td>
                      <td className="px-4 py-3 text-right font-semibold text-amana-700">{formatEur(item.total_dons)}</td>
                    </>
                  )}
                  {type !== 'caisses' && (
                    <td className="px-4 py-3 text-center text-gray-500">{item.nb_references}</td>
                  )}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => setModal(item)}
                        className="p-1.5 text-gray-400 hover:text-amana-600 hover:bg-amana-50 rounded-lg"
                        title="Modifier"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(item)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                        title="Supprimer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showToggle && (
        <div className="mt-4 flex items-center gap-4 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-amana-400" />
            Actif : visible dans les formulaires
          </span>
          <span className="flex items-center gap-1">
            <XCircle className="w-3.5 h-3.5 text-gray-300" />
            Inactif : masqué, historique conservé
          </span>
        </div>
      )}

      {modal !== null && (
        <ConfigModal
          item={modal === 'create' ? null : modal}
          type={type}
          onClose={() => setModal(null)}
          onSaved={load}
        />
      )}
    </section>
  )
}

// ─── Section Budget du Projet ────────────────────────────────────────────────
function BudgetSection() {
  const [budget,     setBudget]     = useState('300000.00')
  const [capaciteSp, setCapaciteSp] = useState('3000')
  const [capaciteEt, setCapaciteEt] = useState('4000')
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [message,    setMessage]    = useState('')

  useEffect(() => {
    api.get('/admin/projet')
      .then(r => {
        setBudget(String(r.data.budget_previsionnel))
        setCapaciteSp(String(r.data.capacite_salle_priere))
        setCapaciteEt(String(r.data.capacite_etages))
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setMessage('')
    try {
      await api.put('/admin/projet', {
        budget_previsionnel: normaliserSaisie(String(budget)) || '300000.00',
        capacite_salle_priere: parseInt(capaciteSp) || 3000,
        capacite_etages: parseInt(capaciteEt) || 4000,
      })
      setMessage('✅ Budget mis à jour.')
    } catch (err) {
      setMessage('❌ ' + (err.response?.data?.message || 'Erreur.'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return null

  return (
    <section className="card">
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2 bg-amber-50 rounded-xl"><HardHat className="w-5 h-5 text-amber-600" /></div>
        <div>
          <h2 className="text-lg font-bold text-gray-800">Projet de Construction — Mosquée Bilal</h2>
          <p className="text-sm text-gray-500">Budget prévisionnel et capacités</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <div>
          <label className="label">Budget prévisionnel (€)</label>
          <input type="number" min="0" step="1000" className="input-field" value={budget} onChange={e => setBudget(e.target.value)} />
        </div>
        <div>
          <label className="label">Capacité — Salle de prière</label>
          <input type="number" min="0" className="input-field" value={capaciteSp} onChange={e => setCapaciteSp(e.target.value)} />
        </div>
        <div>
          <label className="label">Capacité — Autres étages</label>
          <input type="number" min="0" className="input-field" value={capaciteEt} onChange={e => setCapaciteEt(e.target.value)} />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
          <Save className="w-4 h-4" />{saving ? 'Sauvegarde...' : 'Enregistrer'}
        </button>
        {message && <span className="text-sm">{message}</span>}
        <span className="text-xs text-gray-400 ml-auto">Capacité totale calculée : {parseInt(capaciteSp) + parseInt(capaciteEt) || 0} personnes</span>
      </div>
    </section>
  )
}

// ─── Section Gestion des Utilisateurs ─────────────────────────────────────
function UsersSection() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState(null)
  const utilisateurCourant = useAuthStore(s => s.utilisateur)

  const load = () => {
    setLoading(true)
    api.get('/admin/users')
      .then(r => setUsers(r.data))
      .catch(err => setError(err.response?.data?.message || 'Erreur de chargement.'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const handleDelete = async (id, email) => {
    if (id === utilisateurCourant?.id) return alert('Vous ne pouvez pas supprimer votre propre compte.')
    if (!confirm(`Supprimer l'utilisateur "${email}" ?`)) return
    try {
      await api.delete(`/admin/users/${id}`)
      load()
    } catch (err) {
      alert(err.response?.data?.message || 'Erreur.')
    }
  }

  return (
    <section className="card">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-50 rounded-xl"><Users className="w-5 h-5 text-indigo-600" /></div>
          <div>
            <h2 className="text-lg font-bold text-gray-800">Gestion des Utilisateurs</h2>
            <p className="text-sm text-gray-500">Comptes, rôles et droits d'accès</p>
          </div>
        </div>
        <button onClick={() => setModal({})} className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold px-4 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm">
          <Plus className="w-4 h-4" /> Ajouter un utilisateur
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 p-3 rounded-lg text-sm mb-4">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-100">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Nom</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Rôle</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={4} className="text-center py-8 text-gray-400">Chargement...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={4} className="text-center py-8 text-gray-400">Aucun utilisateur.</td></tr>
            ) : users.map(u => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-800">{u.nom}</td>
                <td className="px-4 py-3 text-gray-500">{u.email}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    u.role === 'admin' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'
                  }`}>
                    {u.role === 'admin' ? 'Admin' : 'Lecteur'}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <button onClick={() => setModal(u)} className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-lg" title="Modifier">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(u.id, u.email)} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg" title="Supprimer">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <UserModal
          item={modal.id ? modal : null}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load() }}
        />
      )}
    </section>
  )
}

// ─── Modal Utilisateur ──────────────────────────────────────────────────
function UserModal({ item, onClose, onSaved }) {
  const [nom, setNom] = useState(item?.nom || '')
  const [email, setEmail] = useState(item?.email || '')
  const [motDePasse, setMotDePasse] = useState('')
  const [role, setRole] = useState(item?.role || 'lecteur')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const isEdit = Boolean(item)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const body = { nom, email, role }
      if (motDePasse) body.mot_de_passe = motDePasse
      if (isEdit) {
        await api.put(`/admin/users/${item.id}`, body)
      } else {
        if (!motDePasse) { setError('Le mot de passe est requis.'); setLoading(false); return }
        await api.post('/admin/users', body)
      }
      onSaved()
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur lors de la sauvegarde.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 bg-indigo-50 rounded-xl"><Shield className="w-5 h-5 text-indigo-600" /></div>
          <div>
            <h2 className="text-lg font-bold">{isEdit ? `Modifier : ${item.nom}` : 'Ajouter un utilisateur'}</h2>
            <p className="text-sm text-gray-500">{isEdit ? 'Mettez à jour les informations.' : 'Créez un nouveau compte.'}</p>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm mb-4">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Nom <span className="text-red-500">*</span></label>
            <input required className="input-field" value={nom} onChange={e => setNom(e.target.value)} placeholder="Nom complet" />
          </div>
          <div>
            <label className="label">Email <span className="text-red-500">*</span></label>
            <input required type="email" className="input-field" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemple.com" />
          </div>
          <div>
            <label className="label">{isEdit ? 'Nouveau mot de passe (laisser vide pour conserver)' : 'Mot de passe'} <span className="text-red-500">{isEdit ? '' : '*'}</span></label>
            <input type="password" className="input-field" value={motDePasse} onChange={e => setMotDePasse(e.target.value)} placeholder={isEdit ? '••••••••' : 'Min. 6 caractères'} minLength={isEdit ? 0 : 6} />
          </div>
          <div>
            <label className="label">Rôle <span className="text-red-500">*</span></label>
            <select className="input-field" value={role} onChange={e => setRole(e.target.value)}>
              <option value="lecteur">Utilisateur (accès standard)</option>
              <option value="admin">Administrateur (accès complet)</option>
            </select>
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

// ─── Section Historique des Actions ────────────────────────────────────────
const ACTION_CATEGORIES = [
  { value: '', label: 'Tout' },
  { value: 'Ajout don,Suppression don', label: 'Dons' },
  { value: 'Création dépense,Suppression dépense', label: 'Dépenses' },
  { value: 'Ajout employé,Modification employé,Suppression employé,Versement salaire,Suppression paiement', label: 'Ressources Humaines' },
  { value: 'Ajout famille,Modification famille,Suppression famille,Distribution sociale', label: 'Social' },
  { value: 'Ajout cotisation,Modification cotisation', label: 'Cotisations' },
  { value: 'Ajout utilisateur,Modification utilisateur,Suppression utilisateur', label: 'Utilisateurs' },
]

// ─── Page principale Administration ──────────────────────────────────────────
export default function AdminPage() {
  // Garde de présentation seulement : la route et le serveur imposent
  // déjà la capacité ADMIN.
  const peutAdministrer = useCapacite(CAPACITES.ADMIN)

  if (!peutAdministrer) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
        <XCircle className="w-14 h-14 text-red-300" />
        <h2 className="text-xl font-bold text-gray-700">Accès restreint</h2>
        <p className="text-gray-500 max-w-sm">
          Cette section est réservée aux administrateurs de l'application.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* En-tête */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-amana-100 rounded-xl">
          <Settings className="w-6 h-6 text-amana-700" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Administration</h1>
          <p className="text-sm text-gray-500">Configuration et paramètres de l'application</p>
        </div>
      </div>

      {/* Budget du Projet */}
      <BudgetSection />

      {/* Caisses */}
      <ConfigSection
        title="Configuration des Caisses"
        description="Gérez les destinations de dons. Une caisse désactivée n'apparaît plus dans le formulaire mais son historique financier est conservé."
        type="caisses"
        showToggle={true}
      />

      {/* Catégories de dépenses */}
      <ConfigSection
        title="Catégories de Dépenses"
        description="Gérez les catégories disponibles dans le formulaire de dépenses."
        type="categories-depenses"
        showToggle={true}
        displayLabel={true}
      />

      {/* Classes Madrasa */}
      <ConfigSection
        title="Classes / Niveaux — Madrasa"
        description="Gérez les classes disponibles pour l'inscription des élèves à l'école coranique."
        type="classes-madrasa"
        showToggle={true}
      />

      {/* Types de paiement RH */}
      <ConfigSection
        title="Types de Paiement — Ressources Humaines"
        description="Gérez les types de paiement disponibles pour les salaires et primes du personnel."
        type="types-paiement-rh"
        showToggle={true}
      />

      {/* Gestion des Utilisateurs */}
      <UsersSection />

      {/* Historique des Actions */}
      <JournalAudit />
    </div>
  )
}
