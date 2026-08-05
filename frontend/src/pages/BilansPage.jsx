import { formaterEur as formatEur } from '../utils/money'
import { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown, Wallet, Calendar, ArrowRight } from 'lucide-react'
import api from '../services/api'
import ExportButtons from '../components/ExportButtons'

const StatCard = ({ label, value, icon: Icon, color }) => (
  <div className="card flex items-start gap-4">
    <div className={`p-3 rounded-xl flex-shrink-0 ${color}`}>
      <Icon className="w-6 h-6 text-white" />
    </div>
    <div>
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  </div>
)


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

export default function BilansPage() {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/bilans/generate?annee=${year}`)
      .then((r) => setData(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [year])

  const exportColumns = (data) =>
    data && data.length > 0
      ? Object.keys(data[0]).map((key) => ({
          key,
          label: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '),
          format: typeof data[0][key] === 'number' ? 'eur' : undefined,
        }))
      : []

  if (loading) return <div className="text-center py-20 text-gray-400">Chargement...</div>
  if (!data)   return <div className="text-center py-20 text-red-500">Erreur de chargement.</div>

  // Réponse canonique : montants en chaînes EUR, Social séparé du général.
  const resume = {
    total_recettes: data.total_entrees,
    total_depenses: data.total_depenses,
    solde_net: data.solde,
  }
  const recettes = {
    total: data.total_entrees,
    dons: { total: data.total_dons, par_caisse: data.detail.dons_par_caisse },
    cotisations_membres: { total: data.total_cotisations },
    ecolages_madrasa: { total: data.total_madrasa },
  }
  const depenses = {
    total: data.total_depenses,
    directes: { total: data.total_depenses_directes, par_categorie: data.detail.depenses_par_categorie },
    salaires: { total: data.total_salaires, par_type: data.detail.salaires_par_type },
  }
  const social = data.social

  // Prepare data tables for export
  const recettesTable = [
    { libelle: 'Dons', montant: recettes.dons.total },
    ...recettes.dons.par_caisse.map((c) => ({
      libelle: `  ↳ ${c.caisse}`,
      montant: c.total,
    })),
    { libelle: 'Cotisations membres', montant: recettes.cotisations_membres.total },
    { libelle: 'Écolages Madrasa',    montant: recettes.ecolages_madrasa.total },
  ]

  const depensesTable = [
    { libelle: 'Dépenses directes', montant: depenses.directes.total },
    ...depenses.directes.par_categorie.map((c) => ({
      libelle: `  ↳ ${caisseLabels[c.categorie] || c.categorie}`,
      montant: c.total,
    })),
    { libelle: 'Salaires et primes', montant: depenses.salaires.total },
    ...depenses.salaires.par_type.map((s) => ({
      libelle: `  ↳ ${s.type_paiement}`,
      montant: s.total,
    })),
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Comptabilité & Bilans</h1>
          <p className="text-sm text-gray-500 mt-1">
            Bilan financier annuel — exercice {year}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value))}
              className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-amana-500 appearance-none cursor-pointer"
            >
              {Array.from({ length: 5 }, (_, i) => currentYear - 2 + i).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Total Recettes"
          value={formatEur(resume.total_recettes)}
          icon={TrendingUp}
          color="bg-green-500"
        />
        <StatCard
          label="Total Dépenses"
          value={formatEur(resume.total_depenses)}
          icon={TrendingDown}
          color="bg-red-500"
        />
        <StatCard
          label="Résultat Net"
          value={formatEur(resume.solde_net)}
          icon={Wallet}
          color={String(resume.solde_net).startsWith('-') ? 'bg-red-600' : 'bg-amana-600'}
        />
      </div>

      {/* Two-column tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recettes detail */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">Détail des Recettes</h2>
            <span className="text-sm font-bold text-green-600">{formatEur(recettes.total)}</span>
          </div>
          <div className="space-y-1">
            {/* Dons */}
            <div className="flex items-center justify-between py-2 border-b border-gray-50">
              <p className="text-sm font-medium text-gray-700">Dons</p>
              <span className="text-sm font-semibold text-green-600">{formatEur(recettes.dons.total)}</span>
            </div>
            {recettes.dons.par_caisse.filter(c => c.total !== '0.00').map((c) => (
              <div key={c.nom} className="flex items-center justify-between py-1 pl-4">
                <p className="text-xs text-gray-500">{c.nom}</p>
                <span className="text-xs text-green-500">{formatEur(c.total)}</span>
              </div>
            ))}
            {/* Cotisations */}
            <div className="flex items-center justify-between py-2 border-b border-gray-50">
              <p className="text-sm font-medium text-gray-700">Cotisations membres</p>
              <span className="text-sm font-semibold text-green-600">{formatEur(recettes.cotisations_membres.total)}</span>
            </div>
            {/* Madrasa */}
            <div className="flex items-center justify-between py-2">
              <p className="text-sm font-medium text-gray-700">Écolages Madrasa</p>
              <span className="text-sm font-semibold text-green-600">{formatEur(recettes.ecolages_madrasa.total)}</span>
            </div>
          </div>
        </div>

        {/* Depenses detail */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">Détail des Dépenses</h2>
            <span className="text-sm font-bold text-red-500">{formatEur(depenses.total)}</span>
          </div>
          <div className="space-y-1">
            {/* Dépenses directes */}
            <div className="flex items-center justify-between py-2 border-b border-gray-50">
              <p className="text-sm font-medium text-gray-700">Dépenses directes</p>
              <span className="text-sm font-semibold text-red-500">{formatEur(depenses.directes.total)}</span>
            </div>
            {depenses.directes.par_categorie.filter(c => c.total !== '0.00').map((c) => (
              <div key={c.categorie} className="flex items-center justify-between py-1 pl-4">
                <p className="text-xs text-gray-500">{caisseLabels[c.categorie] || c.categorie}</p>
                <span className="text-xs text-red-400">{formatEur(c.total)}</span>
              </div>
            ))}
            {/* Salaires */}
            <div className="flex items-center justify-between py-2 border-b border-gray-50">
              <p className="text-sm font-medium text-gray-700">Salaires et primes</p>
              <span className="text-sm font-semibold text-red-500">{formatEur(depenses.salaires.total)}</span>
            </div>
            {depenses.salaires.par_type.filter(s => s.total !== '0.00').map((s) => (
              <div key={s.type_paiement} className="flex items-center justify-between py-1 pl-4">
                <p className="text-xs text-gray-500">{s.type_paiement}</p>
                <span className="text-xs text-red-400">{formatEur(s.total)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* Aide sociale — périmètre strictement séparé du solde général */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-800">Aide sociale</h2>
          <span className="text-xs text-gray-400">Périmètre séparé du bilan général</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="py-2">
            <p className="text-xs text-gray-500">Collecté</p>
            <p className="text-lg font-bold text-green-600">{formatEur(social.total_collecte)}</p>
          </div>
          <div className="py-2">
            <p className="text-xs text-gray-500">Distribué</p>
            <p className="text-lg font-bold text-red-500">{formatEur(social.total_distribue)}</p>
          </div>
          <div className="py-2">
            <p className="text-xs text-gray-500">Disponible</p>
            <p className="text-lg font-bold text-gray-900">{formatEur(social.reste_disponible)}</p>
          </div>
        </div>
      </div>


      {/* Tableaux complets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tableau recettes */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">Recettes</h2>
            <ExportButtons
              data={recettesTable}
              columns={[
                { key: 'libelle', label: 'Libellé', width: 40 },
                { key: 'montant', label: 'Montant', format: 'eur', width: 20 },
              ]}
              filename={`recettes-${year}`}
              title={`Recettes ${year}`}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left pb-2 font-medium text-gray-500">Libellé</th>
                  <th className="text-right pb-2 font-medium text-gray-500">Montant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recettesTable.map((r, i) => (
                  <tr key={i} className={r.libelle.startsWith('  ↳') ? '' : 'bg-gray-50/50'}>
                    <td className={`py-2 ${r.libelle.startsWith('  ↳') ? 'text-gray-500 text-xs' : 'font-medium text-gray-800'}`}>
                      {r.libelle}
                    </td>
                    <td className={`py-2 text-right font-semibold ${r.libelle.startsWith('  ↳') ? 'text-green-500 text-xs' : 'text-green-600'}`}>
                      {formatEur(r.montant)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Tableau depenses */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">Dépenses</h2>
            <ExportButtons
              data={depensesTable}
              columns={[
                { key: 'libelle', label: 'Libellé', width: 40 },
                { key: 'montant', label: 'Montant', format: 'eur', width: 20 },
              ]}
              filename={`depenses-${year}`}
              title={`Dépenses ${year}`}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left pb-2 font-medium text-gray-500">Libellé</th>
                  <th className="text-right pb-2 font-medium text-gray-500">Montant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {depensesTable.map((r, i) => (
                  <tr key={i} className={r.libelle.startsWith('  ↳') ? '' : 'bg-gray-50/50'}>
                    <td className={`py-2 ${r.libelle.startsWith('  ↳') ? 'text-gray-500 text-xs' : 'font-medium text-gray-800'}`}>
                      {r.libelle}
                    </td>
                    <td className={`py-2 text-right font-semibold ${r.libelle.startsWith('  ↳') ? 'text-red-400 text-xs' : 'text-red-500'}`}>
                      {formatEur(r.montant)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Export complet du bilan */}
      <div className="card">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Bilan complet {year}</h2>
            <p className="text-sm text-gray-500 mt-1">Télécharger l'intégralité du bilan financier</p>
          </div>
          <ExportButtons
            data={[
              { rubrique: 'Total Recettes',        montant: resume.total_recettes },
              { rubrique: 'Total Dépenses',        montant: resume.total_depenses },
              { rubrique: 'Résultat Net',          montant: resume.solde_net },
            ]}
            columns={[
              { key: 'rubrique', label: 'Rubrique', width: 35 },
              { key: 'montant',  label: 'Montant',  format: 'eur', width: 20 },
            ]}
            filename={`bilan-financier-${year}`}
            title={`Bilan financier ${year}`}
          />
        </div>
      </div>
    </div>
  )
}
