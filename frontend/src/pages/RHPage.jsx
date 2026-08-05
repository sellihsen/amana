import { libellesOptions } from '../utils/options'
import { envoyerOperation } from '../services/operations'
import { formaterEur as formatEur } from '../utils/money'
import { useEffect, useState, useCallback } from 'react'
import {
  Users, Banknote, Plus, Pencil, Trash2, AlertCircle,
  CheckCircle2, XCircle, ChevronDown, UserCheck, UserX,
  CreditCard, Calendar,
} from 'lucide-react'
import api from '../services/api'
import ExportButtons from '../components/ExportButtons'
import SearchableSelect from '../components/SearchableSelect'

// ─── Constantes ───────────────────────────────────────────────────────────────
const ROLES = [
  'Imam', 'Mouadhine', 'Enseignant',
  "Agent d'entretien", 'Secrétaire', 'Comptable', 'Autre',
]
const STATUTS = ['actif', 'inactif']

const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString('fr-FR') : '—'

const badgeStatut = (s) =>
  s === 'actif'
    ? 'bg-green-100 text-green-700'
    : 'bg-gray-100 text-gray-500'

const badgeType = (t) => {
  if (t === 'Salaire mensuel')         return 'bg-blue-50 text-blue-700'
  if (t === "Prime de l'Aïd")          return 'bg-amber-50 text-amber-700'
  if (t === 'Indemnité exceptionnelle') return 'bg-purple-50 text-purple-700'
  return 'bg-gray-100 text-gray-600'
}

// ─── Modal fiche personnel ────────────────────────────────────────────────────
const emptyFiche = {
  nom: '', prenom: '', role_poste: 'Imam',
  telephone: '', email: '', salaire_base: '',
  date_embauche: new Date().toISOString().split('T')[0],
  statut: 'actif', notes: '',
}

function ModalFiche({ fiche, onClose, onSaved }) {
  const [form, setForm]     = useState(fiche ? { ...fiche, salaire_base: fiche.salaire_base ?? '' } : emptyFiche)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const isEdit = Boolean(fiche)

  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault(); setError('')
    setLoading(true)
    try {
      if (isEdit) await api.put(`/personnel/${fiche.id}`, form)
      else        await api.post('/personnel', form)
      onSaved(); onClose()
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur lors de la sauvegarde.')
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 my-4">
        <h2 className="text-lg font-bold mb-1">
          {isEdit ? `Modifier — ${fiche.nom} ${fiche.prenom || ''}` : 'Nouvel employé'}
        </h2>
        <p className="text-sm text-gray-500 mb-5">
          {isEdit ? 'Mettez à jour la fiche.' : 'Créez une nouvelle fiche de personnel.'}
        </p>
        {error && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm mb-4">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Nom <span className="text-red-500">*</span></label>
              <input required className="input-field" value={form.nom} onChange={f('nom')} />
            </div>
            <div>
              <label className="label">Prénom</label>
              <input className="input-field" value={form.prenom} onChange={f('prenom')} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Rôle / Poste <span className="text-red-500">*</span></label>
              <SearchableSelect
                required
                options={ROLES}
                value={form.role_poste}
                onChange={(v) => setForm(p => ({ ...p, role_poste: v }))}
                placeholder="-- Choisir un rôle --"
              />
            </div>
            <div>
              <label className="label">Statut</label>
              <SearchableSelect
                options={STATUTS}
                value={form.statut}
                onChange={(v) => setForm(p => ({ ...p, statut: v }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Salaire de base (€) <span className="text-red-500">*</span></label>
              <input required type="number" min="0" step="0.01" className="input-field"
                     placeholder="0.00" value={form.salaire_base} onChange={f('salaire_base')} />
            </div>
            <div>
              <label className="label">Date d'embauche</label>
              <input type="date" className="input-field" value={form.date_embauche} onChange={f('date_embauche')} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Téléphone</label>
              <input className="input-field" value={form.telephone} onChange={f('telephone')} />
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" className="input-field" value={form.email} onChange={f('email')} />
            </div>
          </div>
          <div>
            <label className="label">Notes internes</label>
            <textarea className="input-field" rows={2} value={form.notes} onChange={f('notes')}
                      placeholder="Informations complémentaires..." />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? 'Sauvegarde...' : (isEdit ? 'Mettre à jour' : 'Créer la fiche')}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Annuler</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Modal paiement de salaire ────────────────────────────────────────────────
const MOIS_FR = [
  'Janvier','Février','Mars','Avril','Mai','Juin',
  'Juillet','Août','Septembre','Octobre','Novembre','Décembre',
]

function buildMoisLabel() {
  const d = new Date()
  return `${MOIS_FR[d.getMonth()]} ${d.getFullYear()}`
}

const emptyPaiement = {
  personnel_id: '',
  montant_verse: '',
  type_paiement: 'Salaire mensuel',
  date_versement: new Date().toISOString().split('T')[0],
  mois_concerne: buildMoisLabel(),
  commentaire: '',
}

function ModalPaiement({ personnel, onClose, onSaved, defaultPersonnelId, typesPaiement }) {
  const [form, setForm]       = useState({
    ...emptyPaiement,
    personnel_id: defaultPersonnelId || '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    if (!form.personnel_id) { setForm(p => ({ ...p, montant_verse: '' })); return }
    const emp = personnel.find(p => String(p.id) === String(form.personnel_id))
    if (emp) setForm(p => ({ ...p, montant_verse: String(emp.salaire_base) }))
  }, [form.personnel_id, personnel])

  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault(); setError('')
    setLoading(true)
    try {
      await envoyerOperation(
        '/personnel/paiements',
        { ...form, personnel_id: parseInt(form.personnel_id, 10) },
        { champsMontant: ['montant_verse'] }
      )
      onSaved(); onClose()
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur lors de l\'enregistrement.')
    } finally { setLoading(false) }
  }

  const moisOptions = Array.from({ length: 14 }, (_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() - 6 + i)
    return `${MOIS_FR[d.getMonth()]} ${d.getFullYear()}`
  })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center gap-3 mb-1">
          <CreditCard className="w-5 h-5 text-amana-600" />
          <h2 className="text-lg font-bold">Enregistrer un paiement</h2>
        </div>
        <p className="text-sm text-gray-500 mb-5">
          Le montant sera automatiquement déduit du solde de la mosquée.
        </p>
        {error && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm mb-4">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Employé */}
          <div>
            <label className="label">Employé <span className="text-red-500">*</span></label>
            <SearchableSelect
              required
              options={personnel.map(p => ({
                value: String(p.id),
                label: `${p.nom} ${p.prenom} — ${p.role_poste} (${formatEur(p.salaire_base)}/mois)`,
              }))}
              value={form.personnel_id}
              onChange={(v) => setForm(p => ({ ...p, personnel_id: v }))}
              placeholder="-- Sélectionner un employé --"
            />
          </div>
          {/* Montant */}
          <div>
            <label className="label">
              Montant versé (€) <span className="text-red-500">*</span>
              {form.personnel_id && (
                <span className="ml-2 text-xs text-gray-400 font-normal">
                  (salaire de base pré-rempli)
                </span>
              )}
            </label>
            <input required type="number" min="0.01" step="0.01" className="input-field"
                   placeholder="0.00" value={form.montant_verse} onChange={f('montant_verse')} />
          </div>
          {/* Type */}
          <div>
            <label className="label">Type de paiement</label>
            <SearchableSelect
              options={typesPaiement}
              value={form.type_paiement}
              onChange={(v) => setForm(p => ({ ...p, type_paiement: v }))}
            />
          </div>
          {/* Mois concerné + date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Mois concerné</label>
              <select className="input-field" value={form.mois_concerne} onChange={f('mois_concerne')}>
                {moisOptions.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Date de versement</label>
              <input type="date" className="input-field" value={form.date_versement} onChange={f('date_versement')} />
            </div>
          </div>
          {/* Commentaire */}
          <div>
            <label className="label">Commentaire</label>
            <textarea className="input-field" rows={2} value={form.commentaire} onChange={f('commentaire')}
                      placeholder="Remarque éventuelle..." />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? 'Enregistrement...' : 'Confirmer le paiement'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Annuler</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Page principale RH ───────────────────────────────────────────────────────
export default function RHPage() {
  const [onglet,      setOnglet]      = useState('fiches')
  const [personnel,   setPersonnel]   = useState([])
  const [actifs,      setActifs]      = useState([])
  const [paiements,   setPaiements]   = useState([])
  const [typesPaiement, setTypesPaiement] = useState([])
  // Totaux et ventilations calculés par PostgreSQL. Valeurs neutres avant le
  // premier chargement : le rendu ne doit jamais dépendre d'un appel en cours.
  const [syntheseRh, setSyntheseRh] = useState({
    totaux: { montant: '0.00', nombre: 0 },
    par_type: [],
    masse_salariale: '0.00',
    effectif_actif: 0,
  })
  const [loading,     setLoading]     = useState(true)
  const [modalFiche,    setModalFiche]    = useState(null)
  const [modalPaiement, setModalPaiement] = useState(false)
  const [deleteErr, setDeleteErr] = useState('')

  const loadPersonnel = useCallback(() => {
    return Promise.all([
      api.get('/personnel').then(r => setPersonnel(r.data)),
      api.get('/personnel/actifs').then(r => setActifs(r.data)),
    ])
  }, [])

  const loadPaiements = useCallback(() =>
    api.get('/personnel/paiements/tous').then(r => { setPaiements(r.data.items); setSyntheseRh(r.data) })
  , [])

  const loadOptions = useCallback(() =>
    api.get('/options').then(r => setTypesPaiement(libellesOptions(r.data.types_paiement_rh)))
  , [])

  const loadAll = useCallback(() => {
    setLoading(true)
    Promise.all([loadPersonnel(), loadPaiements(), loadOptions()])
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [loadPersonnel, loadPaiements, loadOptions])

  useEffect(() => { loadAll() }, [loadAll])

  const handleDeleteFiche = async (p) => {
    setDeleteErr('')
    if (!confirm(`Supprimer la fiche de ${p.nom} ${p.prenom || ''} ?`)) return
    try {
      await api.delete(`/personnel/${p.id}`)
      loadPersonnel()
    } catch (err) {
      setDeleteErr(err.response?.data?.message || 'Erreur lors de la suppression.')
    }
  }

  const handleDeletePaiement = async (id) => {
    setDeleteErr('')
    if (!confirm('Annuler ce paiement ?')) return
    try {
      await api.delete(`/personnel/paiements/${id}`)
      loadAll()
    } catch (err) {
      // Un paiement comptabilisé n'est pas supprimable : le serveur renvoie
      // 405 et invite à créer une contre-écriture.
      setDeleteErr(err.response?.data?.message || 'Erreur lors de la suppression.')
    }
  }

  const nbActifs       = personnel.filter(p => p.statut === 'actif').length
  // Masse salariale et total versé viennent de PostgreSQL : l'interface
  // n'additionne aucun montant (constitution I).
  const masseSalariale = syntheseRh.masse_salariale
  const totalVerse     = syntheseRh.totaux.montant

  const personnelColumns = [
    { key: 'employe',      label: 'Employé',      width: 25 },
    { key: 'role',         label: 'Rôle',         width: 20 },
    { key: 'salaire_base', label: 'Salaire base', format: 'eur', width: 18 },
    { key: 'date_embauche',label: 'Embauche',     format: 'date', width: 15 },
    { key: 'total_verse',  label: 'Versé total',  format: 'eur', width: 18 },
    { key: 'statut',       label: 'Statut',       width: 12 },
  ]

  const personnelExport = personnel.map(p => ({
    employe:       `${p.nom} ${p.prenom || ''}`,
    role:          p.role_poste,
    salaire_base:  p.salaire_base,
    date_embauche: p.date_embauche,
    total_verse:   p.total_verse,
    statut:        p.statut,
  }))

  const paiementsColumns = [
    { key: 'employe',    label: 'Employé',    width: 25 },
    { key: 'type',       label: 'Type',       width: 22 },
    { key: 'montant',    label: 'Montant',    format: 'eur', width: 18 },
    { key: 'mois',       label: 'Mois',       width: 20 },
    { key: 'date_versement', label: 'Date',   format: 'date', width: 15 },
    { key: 'commentaire', label: 'Commentaire', width: 25 },
  ]

  const paiementsExport = paiements.map(p => ({
    employe:        `${p.personnel_nom} ${p.personnel_prenom || ''}`,
    type:           p.type_paiement,
    montant:        p.montant_verse,
    mois:           p.mois_concerne || '—',
    date_versement: p.date_versement,
    commentaire:    p.commentaire || '',
  }))

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 rounded-xl">
            <Users className="w-6 h-6 text-indigo-700" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Ressources Humaines</h1>
            <p className="text-sm text-gray-500">Personnel & suivi des salaires</p>
          </div>
        </div>
        <button
          onClick={() => setModalPaiement(true)}
          className="btn-primary flex items-center gap-2"
        >
          <CreditCard className="w-4 h-4" />
          Enregistrer un paiement
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card flex items-start gap-4">
          <div className="p-3 bg-indigo-500 rounded-xl">
            <UserCheck className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Employés actifs</p>
            <p className="text-2xl font-bold text-gray-900">{nbActifs}</p>
          </div>
        </div>
        <div className="card flex items-start gap-4">
          <div className="p-3 bg-amber-500 rounded-xl">
            <Banknote className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Masse salariale / mois</p>
            <p className="text-2xl font-bold text-gray-900">{formatEur(masseSalariale)}</p>
          </div>
        </div>
        <div className="card flex items-start gap-4">
          <div className="p-3 bg-red-500 rounded-xl">
            <CreditCard className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Total versé (all time)</p>
            <p className="text-2xl font-bold text-gray-900">{formatEur(totalVerse)}</p>
          </div>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 border-b border-gray-200">
        {[
          { key: 'fiches',    label: 'Fiches Personnel',       icon: Users },
          { key: 'paiements', label: 'Historique des Paiements', icon: Banknote },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setOnglet(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              onglet === key
                ? 'border-amana-600 text-amana-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Message d'erreur suppression */}
      {deleteErr && (
        <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 p-3 rounded-lg text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{deleteErr}
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-400">Chargement...</div>
      ) : (
        <>
          {/* ── Onglet Fiches Personnel ─────────────────────────────────────── */}
          {onglet === 'fiches' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <ExportButtons
                  data={personnelExport}
                  columns={personnelColumns}
                  filename="fiches-personnel"
                  title="Fiches Personnel"
                />
                <button
                  onClick={() => setModalFiche('create')}
                  className="btn-primary flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Ajouter un employé
                </button>
              </div>

              <div className="card p-0 overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      {['Employé', 'Rôle', 'Salaire de base', 'Embauche', 'Versé total', 'Statut', 'Actions']
                        .map(h => (
                          <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
                        ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {personnel.length === 0 && (
                      <tr>
                        <td colSpan={7} className="text-center py-10 text-gray-400">
                          Aucun employé enregistré.
                        </td>
                      </tr>
                    )}
                    {personnel.map(p => (
                      <tr key={p.id} className={`hover:bg-gray-50 ${p.statut === 'inactif' ? 'opacity-60' : ''}`}>
                        <td className="px-4 py-3.5">
                          <p className="font-medium text-gray-800">{p.nom} {p.prenom || ''}</p>
                          {p.email && <p className="text-xs text-gray-400">{p.email}</p>}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full text-xs font-medium">
                            {p.role_poste}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 font-semibold text-gray-800 tabular-nums">
                          {formatEur(p.salaire_base)}
                        </td>
                        <td className="px-4 py-3.5 text-gray-500 text-xs">{formatDate(p.date_embauche)}</td>
                        <td className="px-4 py-3.5 text-red-500 font-semibold tabular-nums">
                          {formatEur(p.total_verse)}
                          <span className="text-gray-400 font-normal text-xs ml-1">
                            ({p.nb_paiements} versement{p.nb_paiements > 1 ? 's' : ''})
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badgeStatut(p.statut)}`}>
                            {p.statut}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setModalFiche(p)}
                              className="p-1.5 text-gray-400 hover:text-amana-600 hover:bg-amana-50 rounded-lg"
                              title="Modifier"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteFiche(p)}
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
            </div>
          )}

          {/* ── Onglet Historique Paiements ─────────────────────────────────── */}
          {onglet === 'paiements' && (
            <div className="space-y-4">
              {/* Résumé par type */}
              {paiements.length > 0 && (
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {typesPaiement.map(type => {
                      const ligne = syntheseRh.par_type.find(t => t.type_paiement === type)
                      const tot   = ligne ? ligne.montant : '0.00'
                      const sous  = { length: ligne ? ligne.nombre : 0 }
                      return (
                        <div key={type} className="card py-3 px-4">
                          <p className="text-xs text-gray-500">{type}</p>
                          <p className="text-xl font-bold text-gray-800 mt-0.5">{formatEur(tot)}</p>
                          <p className="text-xs text-gray-400">{sous.length} versement{sous.length > 1 ? 's' : ''}</p>
                        </div>
                      )
                    })}
                  </div>
                  <ExportButtons
                    data={paiementsExport}
                    columns={paiementsColumns}
                    filename="paiements-salaires"
                    title="Paiements de salaires"
                  />
                </div>
              )}

              <div className="card p-0 overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      {['Employé', 'Type', 'Montant', 'Mois concerné', 'Date versement', 'Commentaire', 'Saisi par', '']
                        .map(h => (
                          <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
                        ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {paiements.length === 0 && (
                      <tr>
                        <td colSpan={8} className="text-center py-10 text-gray-400">
                          Aucun paiement enregistré.
                        </td>
                      </tr>
                    )}
                    {paiements.map(p => (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3.5">
                          <p className="font-medium text-gray-800">
                            {p.personnel_nom} {p.personnel_prenom || ''}
                          </p>
                          <p className="text-xs text-gray-400">{p.role_poste}</p>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badgeType(p.type_paiement)}`}>
                            {p.type_paiement}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 font-semibold text-red-500 tabular-nums">
                          {formatEur(p.montant_verse)}
                        </td>
                        <td className="px-4 py-3.5 text-gray-500 text-xs">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            {p.mois_concerne || '—'}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-gray-500 text-xs">
                          {formatDate(p.date_versement)}
                        </td>
                        <td className="px-4 py-3.5 text-gray-400 max-w-[160px] truncate text-xs">
                          {p.commentaire || '—'}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-gray-500">
                          {p.utilisateur_nom || 'Système'}
                        </td>
                        <td className="px-4 py-3.5">
                          <button
                            onClick={() => handleDeletePaiement(p.id)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                            title="Annuler ce paiement"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {modalFiche !== null && (
        <ModalFiche
          fiche={modalFiche === 'create' ? null : modalFiche}
          onClose={() => setModalFiche(null)}
          onSaved={loadAll}
        />
      )}
      {modalPaiement && (
        <ModalPaiement
          personnel={actifs}
          typesPaiement={typesPaiement}
          onClose={() => setModalPaiement(false)}
          onSaved={loadAll}
        />
      )}
    </div>
  )
}
