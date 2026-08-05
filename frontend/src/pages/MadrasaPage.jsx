import { libellesOptions } from '../utils/options'
import { envoyerOperation } from '../services/operations'
import { formaterEur as formatEur } from '../utils/money'
import { useEffect, useState, useCallback } from 'react'
import {
  BookOpen, Users, Plus, Pencil, Trash2, AlertCircle,
  CheckCircle2, Clock, CreditCard, Calendar, GraduationCap,
} from 'lucide-react'
import api from '../services/api'
import ExportButtons from '../components/ExportButtons'
import SearchableSelect from '../components/SearchableSelect'

// ─── Constantes ───────────────────────────────────────────────────────────────
const METHODES   = ['Espèces', 'Virement', 'Chèque']
const STATUTS_P  = ['payé', 'en attente']
const MOIS_FR    = [
  'Janvier','Février','Mars','Avril','Mai','Juin',
  'Juillet','Août','Septembre','Octobre','Novembre','Décembre',
]

const formatDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '—'

const badgeClasse = (c) => {
  const map = {
    'Débutants':    'bg-sky-50 text-sky-700',
    'Niveau 1':     'bg-blue-50 text-blue-700',
    'Niveau 2':     'bg-indigo-50 text-indigo-700',
    'Niveau 3':     'bg-violet-50 text-violet-700',
    'Mémorisation': 'bg-emerald-50 text-emerald-700',
    'Tajwid avancé':'bg-teal-50 text-teal-700',
  }
  return map[c] || 'bg-gray-100 text-gray-600'
}
const badgeStatutP = (s) =>
  s === 'payé'
    ? 'bg-green-100 text-green-700'
    : 'bg-amber-100 text-amber-700'

// ─── Modal fiche élève ────────────────────────────────────────────────────────
const emptyEleve = {
  nom: '', prenom: '', classe: '',
  nom_parent: '', telephone_parent: '',
  date_inscription: new Date().toISOString().split('T')[0],
  statut: 'actif', notes: '',
}

function ModalEleve({ eleve, onClose, onSaved, classesOptions }) {
  const [form, setForm]       = useState(eleve
    ? { ...eleve }
    : { ...emptyEleve, classe: classesOptions[0] || '' })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const isEdit = Boolean(eleve)
  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault(); setError('')
    setLoading(true)
    try {
      if (isEdit) await api.put(`/eleves/${eleve.id}`, form)
      else        await api.post('/eleves', form)
      onSaved(); onClose()
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur lors de la sauvegarde.')
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 my-4">
        <div className="flex items-center gap-3 mb-1">
          <GraduationCap className="w-5 h-5 text-teal-600" />
          <h2 className="text-lg font-bold">
            {isEdit ? `Modifier — ${eleve.nom} ${eleve.prenom || ''}` : 'Inscrire un élève'}
          </h2>
        </div>
        <p className="text-sm text-gray-500 mb-5">
          {isEdit ? 'Mettez à jour la fiche de l\'élève.' : 'Complétez les informations d\'inscription.'}
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
              <label className="label">Classe <span className="text-red-500">*</span></label>
              <SearchableSelect
                required
                options={classesOptions}
                value={form.classe}
                onChange={(v) => setForm(p => ({ ...p, classe: v }))}
                placeholder="-- Choisir une classe --"
              />
            </div>
            <div>
              <label className="label">Statut</label>
              <select className="input-field" value={form.statut} onChange={f('statut')}>
                <option value="actif">Actif</option>
                <option value="inactif">Inactif</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Nom du parent</label>
              <input className="input-field" value={form.nom_parent} onChange={f('nom_parent')} />
            </div>
            <div>
              <label className="label">Téléphone parent</label>
              <input className="input-field" value={form.telephone_parent} onChange={f('telephone_parent')} />
            </div>
          </div>
          <div>
            <label className="label">Date d'inscription</label>
            <input type="date" className="input-field" value={form.date_inscription} onChange={f('date_inscription')} />
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input-field" rows={2} value={form.notes} onChange={f('notes')}
                      placeholder="Informations complémentaires..." />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? 'Sauvegarde...' : (isEdit ? 'Mettre à jour' : 'Inscrire l\'élève')}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Annuler</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Modal paiement écolage ───────────────────────────────────────────────────
function buildMoisLabel() {
  const d = new Date()
  return `${MOIS_FR[d.getMonth()]} ${d.getFullYear()}`
}

const emptyPaiement = {
  eleve_id: '', montant: '50', mois_concerne: buildMoisLabel(),
  date_paiement: new Date().toISOString().split('T')[0],
  methode_paiement: 'Espèces', statut_paiement: 'payé', commentaire: '',
}

function ModalPaiement({ eleves, onClose, onSaved, defaultEleveId }) {
  const [form, setForm]       = useState({ ...emptyPaiement, eleve_id: defaultEleveId || '' })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))

  const moisOptions = Array.from({ length: 15 }, (_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() - 11 + i)
    return `${MOIS_FR[d.getMonth()]} ${d.getFullYear()}`
  })

  const handleSubmit = async (e) => {
    e.preventDefault(); setError('')
    setLoading(true)
    try {
      await envoyerOperation('/eleves/cotisations', {
        ...form,
        eleve_id: parseInt(form.eleve_id, 10),
      })
      onSaved(); onClose()
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur lors de l\'enregistrement.')
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center gap-3 mb-1">
          <CreditCard className="w-5 h-5 text-teal-600" />
          <h2 className="text-lg font-bold">Enregistrer un paiement</h2>
        </div>
        <p className="text-sm text-gray-500 mb-5">
          Le montant sera automatiquement ajouté aux revenus de la Madrasa.
        </p>
        {error && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm mb-4">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Élève <span className="text-red-500">*</span></label>
            <SearchableSelect
              required
              options={eleves.map(e => ({
                value: String(e.id),
                label: `${e.nom} ${e.prenom || ''}${e.nom_parent ? ` (${e.nom_parent})` : ''} — ${e.classe}`,
              }))}
              value={form.eleve_id}
              onChange={(v) => setForm(p => ({ ...p, eleve_id: v }))}
              placeholder="-- Sélectionner un élève --"
              searchPlaceholder="Rechercher un élève..."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Montant (€) <span className="text-red-500">*</span></label>
              <input required type="number" min="0.01" step="0.01" className="input-field"
                     value={form.montant} onChange={f('montant')} />
            </div>
            <div>
              <label className="label">Méthode</label>
              <select className="input-field" value={form.methode_paiement} onChange={f('methode_paiement')}>
                {METHODES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Mois concerné <span className="text-red-500">*</span></label>
              <select className="input-field" value={form.mois_concerne} onChange={f('mois_concerne')}>
                {moisOptions.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Date de paiement</label>
              <input type="date" className="input-field" value={form.date_paiement} onChange={f('date_paiement')} />
            </div>
          </div>
          <div>
            <label className="label">Statut du paiement</label>
            <select className="input-field" value={form.statut_paiement} onChange={f('statut_paiement')}>
              {STATUTS_P.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Commentaire</label>
            <textarea className="input-field" rows={2} value={form.commentaire} onChange={f('commentaire')} />
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

// ─── Page principale Madrasa ──────────────────────────────────────────────────
export default function MadrasaPage() {
  const [onglet,       setOnglet]       = useState('eleves')
  const [eleves,       setEleves]       = useState([])
  const [elevesActifs, setElevesActifs] = useState([])
  const [cotisations,  setCotisations]  = useState([])
  const [classesOptions, setClassesOptions] = useState([])
  // Idem : totaux et ventilations viennent du serveur, jamais d'un calcul local.
  const [syntheseMadrasa, setSyntheseMadrasa] = useState({
    totaux: {
      montant: '0.00',
      nombre: 0,
      nombre_en_attente: 0,
      montant_en_attente: '0.00',
    },
    par_methode: [],
  })
  const [loading,      setLoading]      = useState(true)
  const [modalEleve,   setModalEleve]   = useState(null)
  const [modalPaiement,setModalPaiement]= useState(false)
  const [deleteErr,    setDeleteErr]    = useState('')
  const [filtreClasse, setFiltreClasse] = useState('')
  const [filtreStatut, setFiltreStatut] = useState('')

  const loadEleves = useCallback(() => Promise.all([
    api.get('/eleves').then(r => setEleves(r.data)),
    api.get('/eleves/actifs').then(r => setElevesActifs(r.data)),
  ]), [])

  const loadCotisations = useCallback(() =>
    api.get('/eleves/cotisations/toutes').then(r => { setCotisations(r.data.items); setSyntheseMadrasa(r.data) })
  , [])

  const loadOptions = useCallback(() =>
    api.get('/options').then(r => {
      setClassesOptions(libellesOptions(r.data.classes_madrasa))
      // Pré-sélectionner la première classe si elle n'est pas déjà définie
      if (r.data.classes_madrasa.length > 0) setFiltreClasse('')
    })
  , [])

  const loadAll = useCallback(() => {
    setLoading(true)
    Promise.all([loadEleves(), loadCotisations(), loadOptions()])
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [loadEleves, loadCotisations, loadOptions])

  useEffect(() => { loadAll() }, [loadAll])

  const handleDeleteEleve = async (e) => {
    setDeleteErr('')
    if (!confirm(`Supprimer la fiche de ${e.nom} ${e.prenom || ''} ?`)) return
    try {
      await api.delete(`/eleves/${e.id}`)
      loadEleves()
    } catch (err) {
      setDeleteErr(err.response?.data?.message || 'Erreur lors de la suppression.')
    }
  }

  const handleDeleteCotisation = async (id) => {
    setDeleteErr('')
    if (!confirm('Supprimer cette cotisation ?')) return
    try {
      await api.delete(`/eleves/cotisations/${id}`)
      loadAll()
    } catch (err) {
      // Un écolage comptabilisé n'est pas supprimable : le serveur renvoie 409
      // et invite à créer une contre-écriture.
      setDeleteErr(err.response?.data?.message || 'Erreur lors de la suppression.')
    }
  }

  const handleToggleStatutPaiement = async (cotis) => {
    const newStatut = cotis.statut_paiement === 'payé' ? 'en attente' : 'payé'
    try {
      await api.put(`/eleves/cotisations/${cotis.id}`, { statut_paiement: newStatut })
      loadAll()
    } catch (err) { alert(err.response?.data?.message || 'Erreur.') }
  }

  const elevesFiltres = eleves.filter(e => {
    if (filtreClasse && e.classe !== filtreClasse) return false
    if (filtreStatut && e.statut !== filtreStatut) return false
    return true
  })

  const nbActifs       = eleves.filter(e => e.statut === 'actif').length
  // Totaux calculés par PostgreSQL : l'interface n'additionne aucun montant.
  const totalPaye      = syntheseMadrasa.totaux.montant
  const nbEnAttente    = syntheseMadrasa.totaux.nombre_en_attente

  const elevesColumns = [
    { key: 'eleve',          label: 'Élève',      width: 22 },
    { key: 'classe',         label: 'Classe',     width: 18 },
    { key: 'parent',         label: 'Parent',     width: 22 },
    { key: 'date_inscription', label: 'Inscription', format: 'date', width: 15 },
    { key: 'total_paye',     label: 'Payé total', format: 'eur', width: 15 },
    { key: 'total_en_attente', label: 'En attente', format: 'eur', width: 15 },
    { key: 'statut',         label: 'Statut',     width: 12 },
  ]

  const elevesExport = elevesFiltres.map(e => ({
    eleve:           `${e.nom} ${e.prenom || ''}`,
    classe:          e.classe,
    parent:          e.nom_parent || '—',
    date_inscription: e.date_inscription,
    total_paye:      e.total_paye,
    total_en_attente: e.total_en_attente,
    statut:          e.statut,
  }))

  const cotisationsColumns = [
    { key: 'eleve',    label: 'Élève',    width: 22 },
    { key: 'classe',   label: 'Classe',   width: 18 },
    { key: 'mois',     label: 'Mois',     width: 18 },
    { key: 'montant',  label: 'Montant',  format: 'eur', width: 15 },
    { key: 'methode',  label: 'Méthode',  width: 15 },
    { key: 'date',     label: 'Date',     format: 'date', width: 15 },
    { key: 'statut',   label: 'Statut',   width: 15 },
  ]

  const cotisationsExport = cotisations.map(c => ({
    eleve:   `${c.eleve_nom} ${c.eleve_prenom || ''}`,
    classe:  c.eleve_classe,
    mois:    c.mois_concerne,
    montant: c.montant,
    methode: c.methode_paiement,
    date:    c.date_paiement,
    statut:  c.statut_paiement,
  }))

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-teal-100 rounded-xl">
            <BookOpen className="w-6 h-6 text-teal-700" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">École Coranique</h1>
            <p className="text-sm text-gray-500">Gestion des élèves et suivi des écolages</p>
          </div>
        </div>
        <button onClick={() => setModalPaiement(true)} className="btn-primary flex items-center gap-2">
          <CreditCard className="w-4 h-4" />
          Enregistrer un paiement
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card flex items-start gap-4">
          <div className="p-3 bg-teal-500 rounded-xl">
            <Users className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Élèves actifs</p>
            <p className="text-2xl font-bold text-gray-900">{nbActifs}</p>
            <p className="text-xs text-gray-400">
              {[...new Set(eleves.filter(e=>e.statut==='actif').map(e=>e.classe))].length} classe(s)
            </p>
          </div>
        </div>
        <div className="card flex items-start gap-4">
          <div className="p-3 bg-green-500 rounded-xl">
            <CheckCircle2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Écolages encaissés</p>
            <p className="text-2xl font-bold text-gray-900">{formatEur(totalPaye)}</p>
          </div>
        </div>
        <div className="card flex items-start gap-4">
          <div className="p-3 bg-amber-500 rounded-xl">
            <Clock className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Paiements en attente</p>
            <p className="text-2xl font-bold text-gray-900">{nbEnAttente}</p>
            <p className="text-xs text-gray-400">
              {formatEur(syntheseMadrasa.totaux.montant_en_attente)} à percevoir
            </p>
          </div>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 border-b border-gray-200">
        {[
          { key: 'eleves',      label: 'Gestion des Élèves',  icon: GraduationCap },
          { key: 'cotisations', label: 'Suivi des Écolages',   icon: CreditCard },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setOnglet(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              onglet === key
                ? 'border-teal-600 text-teal-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {/* Erreur suppression */}
      {deleteErr && (
        <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 p-3 rounded-lg text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{deleteErr}
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-400">Chargement...</div>
      ) : (
        <>
          {/* ── Onglet Gestion des Élèves ────────────────────────────────── */}
          {onglet === 'eleves' && (
            <div className="space-y-4">
              {/* Filtres + bouton + export */}
              <div className="flex flex-wrap items-center gap-3 justify-between">
                <div className="flex gap-2 flex-wrap">
                  <select
                    className="input-field w-auto text-sm"
                    value={filtreClasse}
                    onChange={e => setFiltreClasse(e.target.value)}
                  >
                    <option value="">Toutes les classes</option>
                    {classesOptions.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select
                    className="input-field w-auto text-sm"
                    value={filtreStatut}
                    onChange={e => setFiltreStatut(e.target.value)}
                  >
                    <option value="">Tous les statuts</option>
                    <option value="actif">Actif</option>
                    <option value="inactif">Inactif</option>
                  </select>
                </div>
                <div className="flex items-center gap-3">
                  <ExportButtons
                    data={elevesExport}
                    columns={elevesColumns}
                    filename="eleves-madrasa"
                    title="Registre des élèves"
                  />
                  <button
                    onClick={() => setModalEleve('create')}
                    className="btn-primary flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" /> Inscrire un élève
                  </button>
                </div>
              </div>

              <div className="card p-0 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      {['Élève', 'Classe', 'Parent / Contact', 'Inscription', 'Payé total', 'En attente', 'Statut', 'Actions']
                        .map(h => <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {elevesFiltres.length === 0 && (
                      <tr>
                        <td colSpan={8} className="text-center py-10 text-gray-400">
                          Aucun élève trouvé.
                        </td>
                      </tr>
                    )}
                    {elevesFiltres.map(e => (
                      <tr key={e.id} className={`hover:bg-gray-50 ${e.statut === 'inactif' ? 'opacity-60' : ''}`}>
                        <td className="px-4 py-3.5">
                          <p className="font-medium text-gray-800">{e.nom} {e.prenom || ''}</p>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badgeClasse(e.classe)}`}>
                            {e.classe}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="text-gray-700">{e.nom_parent || '—'}</p>
                          {e.telephone_parent && (
                            <p className="text-xs text-gray-400">{e.telephone_parent}</p>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-gray-500 text-xs">{formatDate(e.date_inscription)}</td>
                        <td className="px-4 py-3.5 font-semibold text-green-600 tabular-nums">
                          {formatEur(e.total_paye)}
                        </td>
                        <td className="px-4 py-3.5 tabular-nums">
                          {Number(e.total_en_attente) > 0
                            ? <span className="text-amber-600 font-semibold">{formatEur(e.total_en_attente)}</span>
                            : <span className="text-gray-300">—</span>
                          }
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            e.statut === 'actif' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                          }`}>
                            {e.statut}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setModalEleve(e)}
                              className="p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg"
                              title="Modifier"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteEleve(e)}
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

          {/* ── Onglet Suivi des Écolages ────────────────────────────────── */}
          {onglet === 'cotisations' && (
            <div className="space-y-4">
              {/* Résumé par méthode de paiement + export */}
              {cotisations.length > 0 && (
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {METHODES.map(methode => {
                      const ligne = syntheseMadrasa.par_methode.find(m => m.methode_paiement === methode)
                      const tot   = ligne ? ligne.montant : '0.00'
                      const sous  = { length: ligne ? ligne.nombre : 0 }
                      return (
                        <div key={methode} className="card py-3 px-4">
                          <p className="text-xs text-gray-500">{methode}</p>
                          <p className="text-xl font-bold text-gray-800 mt-0.5">{formatEur(tot)}</p>
                          <p className="text-xs text-gray-400">{sous.length} paiement{sous.length > 1 ? 's' : ''}</p>
                        </div>
                      )
                    })}
                  </div>
                  <ExportButtons
                    data={cotisationsExport}
                    columns={cotisationsColumns}
                    filename="ecolages-madrasa"
                    title="Écolages Madrasa"
                  />
                </div>
              )}

              <div className="card p-0 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      {['Élève', 'Classe', 'Mois', 'Montant', 'Méthode', 'Date', 'Statut', 'Actions']
                        .map(h => <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {cotisations.length === 0 && (
                      <tr>
                        <td colSpan={8} className="text-center py-10 text-gray-400">
                          Aucun paiement enregistré.
                        </td>
                      </tr>
                    )}
                    {cotisations.map(c => (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3.5 font-medium text-gray-800">
                          {c.eleve_nom} {c.eleve_prenom || ''}
                          {c.nom_parent && <p className="text-xs text-gray-400">{c.nom_parent}</p>}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badgeClasse(c.eleve_classe)}`}>
                            {c.eleve_classe}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-gray-600 text-xs">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            {c.mois_concerne}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 font-semibold tabular-nums">
                          <span className={c.statut_paiement === 'payé' ? 'text-green-600' : 'text-amber-600'}>
                            {formatEur(c.montant)}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-gray-500 text-xs">{c.methode_paiement}</td>
                        <td className="px-4 py-3.5 text-gray-500 text-xs">{formatDate(c.date_paiement)}</td>
                        <td className="px-4 py-3.5">
                          <button
                            onClick={() => handleToggleStatutPaiement(c)}
                            className={`px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer transition-colors ${badgeStatutP(c.statut_paiement)}`}
                            title="Cliquer pour basculer le statut"
                          >
                            {c.statut_paiement === 'payé'
                              ? <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Payé</span>
                              : <span className="flex items-center gap-1"><Clock className="w-3 h-3" />En attente</span>
                            }
                          </button>
                        </td>
                        <td className="px-4 py-3.5">
                          <button
                            onClick={() => handleDeleteCotisation(c.id)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
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
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {modalEleve !== null && (
        <ModalEleve
          eleve={modalEleve === 'create' ? null : modalEleve}
          classesOptions={classesOptions}
          onClose={() => setModalEleve(null)}
          onSaved={loadAll}
        />
      )}
      {modalPaiement && (
        <ModalPaiement
          eleves={elevesActifs}
          onClose={() => setModalPaiement(false)}
          onSaved={loadAll}
        />
      )}
    </div>
  )
}
