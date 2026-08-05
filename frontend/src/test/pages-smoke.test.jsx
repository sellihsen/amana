/**
 * Chaque page se monte sans exception.
 *
 * Ce test existe à cause d'un défaut réel : `RHPage` et `MadrasaPage`
 * utilisaient un état (`syntheseRh`, `syntheseMadrasa`) qui n'avait jamais été
 * déclaré. Les deux pages s'affichaient entièrement blanches — React démonte
 * l'arbre quand le rendu lève une exception.
 *
 * Ni le build Vite ni les 935 autres tests ne pouvaient le voir : le premier ne
 * détecte pas les identifiants indéfinis à l'exécution, les seconds
 * n'assemblaient jamais une page complète.
 */
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import api from '../services/api'
import { useAuthStore } from '../store/authStore'

import DashboardPage from '../pages/DashboardPage'
import MembresPage from '../pages/MembresPage'
import DonsPage from '../pages/DonsPage'
import CotisationsPage from '../pages/CotisationsPage'
import DepensesPage from '../pages/DepensesPage'
import RHPage from '../pages/RHPage'
import MadrasaPage from '../pages/MadrasaPage'
import BilansPage from '../pages/BilansPage'
import StockPage from '../pages/StockPage'
import SocialPage from '../pages/SocialPage'
import AdminPage from '../pages/AdminPage'

/** Réponses minimales mais conformes au contrat réel de l'API. */
const REPONSES = {
  '/dashboard': {
    annee: 2026,
    periode: { debut: '2026-01-01', fin: '2027-01-01' },
    general: {
      total_dons: '0.00', total_cotisations: '0.00', total_madrasa: '0.00',
      total_entrees: '0.00', total_depenses_directes: '0.00',
      total_salaires: '0.00', total_depenses: '0.00', solde: '0.00',
    },
    social: { total_collecte: '0.00', total_distribue: '0.00', reste_disponible: '0.00', caisses: [] },
    evolution_mensuelle: Array.from({ length: 12 }, (_, i) => ({
      mois: i + 1, entrees: '0.00', sorties: '0.00', solde: '0.00',
    })),
    rh: { effectif_actif: 0, total_salaires_verses: '0.00' },
    madrasa: { eleves_actifs: 0, nb_classes: 0, total_ecolages: '0.00', total_en_attente: '0.00', nb_en_attente: 0 },
    operations_recentes: [],
    membres: { total: 0, actifs: 0 },
    alertes_stock: [],
    projet: {
      budget_previsionnel: '300000.00', capacite_totale: 7000,
      capacite_salle_priere: 3000, capacite_etages: 4000,
      total_collecte: '0.00', nb_donateurs: 0,
    },
    devise: 'EUR',
  },
  '/membres': { items: [], total: 0 },
  '/dons': { items: [], totaux: { montant: '0.00', nombre: 0 } },
  '/depenses': { items: [], totaux: { montant: '0.00', nombre: 0 } },
  '/cotisations': { items: [], totaux: { montant: '0.00', nombre: 0 } },
  '/personnel': [],
  '/personnel/actifs': [],
  '/personnel/paiements/tous': {
    items: [], totaux: { montant: '0.00', nombre: 0 },
    par_type: [], masse_salariale: '0.00', effectif_actif: 0,
  },
  '/eleves': [],
  '/eleves/actifs': [],
  '/eleves/cotisations/toutes': {
    items: [],
    totaux: { montant: '0.00', nombre: 0, nombre_en_attente: 0, montant_en_attente: '0.00' },
    par_methode: [],
  },
  '/eleves/cotisations/resume': {},
  '/stock': [],
  '/stock/alertes': [],
  '/caisses': [],
  '/options': {
    categories_depenses: [], classes_madrasa: [], types_paiement_rh: [], caisses: [],
  },
  '/social/bilan': {
    total_collecte: '0.00', total_distribue: '0.00', reste_disponible: '0.00', caisses: [],
  },
  '/social/familles': [],
  '/social/distributions': [],
  '/admin/users': [],
  '/admin/audit-events': { items: [], total: 0, limit: 50, offset: 0 },
  '/admin/caisses': [],
  '/admin/projet': {
    budget_previsionnel: '300000.00', capacite_salle_priere: 3000,
    capacite_etages: 4000, capacite_totale: 7000,
  },
  '/bilans/generate': {
    annee: 2026, periode: { debut: '2026-01-01', fin: '2027-01-01' },
    total_dons: '0.00', total_cotisations: '0.00', total_madrasa: '0.00',
    total_entrees: '0.00', total_depenses_directes: '0.00', total_salaires: '0.00',
    total_depenses: '0.00', solde: '0.00',
    social: { total_collecte: '0.00', total_distribue: '0.00', reste_disponible: '0.00', caisses: [] },
    detail: { dons_par_caisse: [], depenses_par_categorie: [], salaires_par_type: [] },
    devise: 'EUR',
  },
}

function reponsePour(url) {
  const chemin = String(url).split('?')[0].replace(/\/$/, '')
  if (chemin in REPONSES) return { data: REPONSES[chemin] }
  // Configuration : /admin/config/<type>
  if (chemin.startsWith('/admin/config/')) return { data: [] }
  return { data: [] }
}

let erreursConsole = []

beforeEach(() => {
  useAuthStore.setState({
    utilisateur: { id: 1, nom: 'Admin Test', email: 'a@test.local', role: 'admin' },
    statutSession: 'authentifie',
  })
  vi.spyOn(api, 'get').mockImplementation((url) => Promise.resolve(reponsePour(url)))
  vi.spyOn(api, 'post').mockResolvedValue({ data: {} })
  vi.spyOn(api, 'put').mockResolvedValue({ data: {} })
  vi.spyOn(api, 'delete').mockResolvedValue({ data: {} })

  erreursConsole = []
  vi.spyOn(console, 'error').mockImplementation((...args) => {
    erreursConsole.push(args.join(' '))
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

const PAGES = [
  ['DashboardPage', DashboardPage],
  ['MembresPage', MembresPage],
  ['DonsPage', DonsPage],
  ['CotisationsPage', CotisationsPage],
  ['DepensesPage', DepensesPage],
  ['RHPage', RHPage],
  ['MadrasaPage', MadrasaPage],
  ['BilansPage', BilansPage],
  ['StockPage', StockPage],
  ['SocialPage', SocialPage],
  ['AdminPage', AdminPage],
]

describe.each(PAGES)('%s', (nom, Page) => {
  it('se monte et rend du contenu, sans exception', async () => {
    const { container } = render(
      <MemoryRouter>
        <Page />
      </MemoryRouter>
    )

    // Attend la fin des chargements déclenchés au montage.
    await waitFor(() => expect(api.get).toHaveBeenCalled())

    // Une page qui lève au rendu laisse un conteneur vide : c'est exactement
    // le symptôme de l'écran blanc.
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(50)
    })

    // Aucune erreur React (variable indéfinie, enfant invalide, etc.).
    const fatales = erreursConsole.filter((e) =>
      /is not defined|Cannot read|is not a function|Objects are not valid as a React child/.test(e)
    )
    expect(fatales).toEqual([])
  })
})
