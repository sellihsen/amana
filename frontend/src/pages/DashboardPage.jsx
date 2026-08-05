import BandeauAlertesStock from '../components/BandeauAlertesStock'
import { formaterEur as formatEur } from '../utils/money'
import { useEffect, useState } from 'react'
import {
  TrendingUp, TrendingDown, Heart, Users,
  BadgeDollarSign, Wallet, UserCog, Banknote, BookOpen, GraduationCap,
  AlertTriangle,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import api from '../services/api'
import maquetteSrc from '../assets/maquette.jpeg'

const StatCard = ({ label, value, icon: Icon, color, subtext }) => (
  <div className="card flex items-start gap-4">
    <div className={`p-3 rounded-xl flex-shrink-0 ${color}`}>
      <Icon className="w-6 h-6 text-white" />
    </div>
    <div className="min-w-0">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-900 truncate">{value}</p>
      {subtext && <p className="text-xs text-gray-400 mt-0.5">{subtext}</p>}
    </div>
  </div>
)


export default function DashboardPage() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  // Les alertes de stock viennent du tableau de bord : une seconde requête
  // vers /stock/alertes pourrait diverger de ce qui est affiché ici.
  useEffect(() => {
    api.get('/dashboard')
      .then(r => setData(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-center py-20 text-gray-400">Chargement...</div>
  if (!data)   return <div className="text-center py-20 text-red-500">Erreur de chargement.</div>

  const {
    general: finances,
    social,
    evolution_mensuelle,
    operations_recentes,
    rh, madrasa, projet, membres,
    alertes_stock: alertesStock = [],
  } = data

  const totalMembres = membres.total

  // Pourcentage d'avancement : simple ratio d'affichage, pas un total financier.
  const pctProjet =
    Number(projet?.budget_previsionnel) > 0
      ? Math.round((Number(projet.total_collecte) / Number(projet.budget_previsionnel)) * 100)
      : 0

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Tableau de bord</h1>

      {/* ── Bandeau alerte stock ──────────────────────────────────────────── */}
      <BandeauAlertesStock alertes={alertesStock} />

      {/* ── Projet — Mosquée Bilal ────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="flex flex-col lg:flex-row gap-8">
          <div className="lg:w-72 shrink-0 flex flex-col items-center text-center">
            <img
              src={maquetteSrc}
              alt="Maquette Mosquée Bilal"
              className="w-full h-48 lg:h-52 object-cover rounded-xl mb-4"
            />
            <p className="text-4xl font-bold text-emerald-600 mb-1">
              {projet ? formatEur(projet.total_collecte) : '—'}
            </p>
            <p className="text-xs text-gray-400 mb-3">collectés sur {projet ? formatEur(projet.budget_previsionnel) : '—'} €</p>
            <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all duration-700"
                style={{ width: `${Math.min(pctProjet, 100)}%` }}
              />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-bold text-gray-900 mb-3">Ensemble pour achever la Mosquée Bilal</h2>
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-emerald-50 text-emerald-700">
              ✨ Finalisation du chantier — Capacité globale : {projet ? new Intl.NumberFormat('fr-FR').format(projet.capacite_totale) : '7 000'} personnes
            </span>
          </div>
        </div>
      </div>

      {/* ── KPI Financiers ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <StatCard
          label="Solde actuel"
          value={formatEur(finances.solde)}
          icon={Wallet}
          color="bg-amana-600"
          subtext="Entrées − toutes dépenses"
        />
        <StatCard
          label="Total entrées"
          value={formatEur(finances.total_entrees)}
          icon={TrendingUp}
          color="bg-green-500"
        />
        <StatCard
          label="Total dépenses"
          value={formatEur(finances.total_depenses)}
          icon={TrendingDown}
          color="bg-red-500"
          subtext={`dont salaires : ${formatEur(finances.total_salaires)}`}
        />
        <StatCard
          label="Dons reçus"
          value={formatEur(finances.total_dons)}
          icon={Heart}
          color="bg-pink-500"
        />
        <StatCard
          label="Cotisations perçues"
          value={formatEur(finances.total_cotisations)}
          icon={BadgeDollarSign}
          color="bg-blue-500"
        />
        <StatCard
          label="Écolages Madrasa"
          value={formatEur(finances.total_madrasa)}
          icon={BookOpen}
          color="bg-teal-500"
          subtext="Inclus dans le total entrées"
        />
        <StatCard
          label="Membres"
          value={totalMembres}
          icon={Users}
          color="bg-purple-500"
        />
      </div>

      {/* ── KPI École Coranique ──────────────────────────────────────────── */}
      {madrasa && (
        <div>
          <h2 className="text-base font-semibold text-gray-700 mb-3">École Coranique (Madrasa)</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              label="Élèves actifs"
              value={madrasa.eleves_actifs}
              icon={GraduationCap}
              color="bg-teal-500"
              subtext={`${madrasa.nb_classes} classe(s)`}
            />
            <StatCard
              label="Écolages encaissés"
              value={formatEur(madrasa.total_ecolages)}
              icon={BookOpen}
              color="bg-green-500"
            />
            <StatCard
              label="En attente de paiement"
              value={madrasa.nb_en_attente}
              icon={BadgeDollarSign}
              color="bg-amber-500"
              subtext={formatEur(madrasa.total_en_attente)}
            />
          </div>
        </div>
      )}

      {/* ── KPI Ressources Humaines ──────────────────────────────────────── */}
      {rh && (
        <div>
          <h2 className="text-base font-semibold text-gray-700 mb-3">Ressources Humaines</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              label="Employés actifs"
              value={rh.effectif_actif}
              icon={UserCog}
              color="bg-indigo-500"
            />
            <StatCard
              label="Masse salariale / mois"
              value={formatEur(rh.total_salaires_verses)}
              icon={Banknote}
              color="bg-amber-500"
            />
            <StatCard
              label="Salaires versés ce mois"
              value={formatEur(rh.total_salaires_verses)}
              icon={TrendingDown}
              color="bg-orange-500"
              subtext="Inclus dans le total dépenses"
            />
          </div>
        </div>
      )}

      {/* ── Graphique dons par mois ──────────────────────────────────────── */}
      {evolution_mensuelle.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Dons — 12 derniers mois</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={evolution_mensuelle}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => formatEur(v)} />
              <Bar dataKey="total" fill="#22714e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Opérations récentes ──────────────────────────────────────────
          Une seule liste, alimentée par le grand livre : dons, cotisations,
          écolages, dépenses, salaires et distributions y figurent avec leur
          périmètre, plutôt que quatre listes qui pourraient diverger. */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Opérations récentes</h2>
        {operations_recentes.length === 0 ? (
          <p className="text-gray-400 text-sm">Aucune opération enregistrée.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-gray-500">
                <tr>
                  <th className="py-2 font-medium">Date</th>
                  <th className="py-2 font-medium">Type</th>
                  <th className="py-2 font-medium">Caisse</th>
                  <th className="py-2 font-medium">Périmètre</th>
                  <th className="py-2 font-medium text-right">Montant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {operations_recentes.map(o => (
                  <tr key={o.id}>
                    <td className="py-2.5 text-gray-500 whitespace-nowrap">
                      {o.date_effet ? new Date(o.date_effet).toLocaleDateString('fr-FR') : '—'}
                    </td>
                    <td className="py-2.5 text-gray-800">{o.type}</td>
                    <td className="py-2.5 text-gray-500">{o.caisse_nom || '—'}</td>
                    <td className="py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        o.perimetre === 'SOCIAL'
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {o.perimetre}
                      </span>
                    </td>
                    <td className={`py-2.5 text-right font-semibold ${
                      o.sens === 'CREDIT' ? 'text-green-600' : 'text-red-500'
                    }`}>
                      {o.sens === 'CREDIT' ? '+' : '−'} {formatEur(o.montant)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Aide sociale, strictement séparée du solde général ───────────── */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-800">Aide sociale</h2>
          <span className="text-xs text-gray-400">Périmètre séparé</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <p className="text-xs text-gray-500">Collecté</p>
            <p className="text-lg font-bold text-green-600">{formatEur(social.total_collecte)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Distribué</p>
            <p className="text-lg font-bold text-rose-600">{formatEur(social.total_distribue)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Disponible</p>
            <p className="text-lg font-bold text-gray-900">{formatEur(social.reste_disponible)}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
