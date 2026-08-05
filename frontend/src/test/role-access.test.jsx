/**
 * T025 [US1] — Gardes de rôle côté présentation.
 *
 * Les gardes de l'interface ne sont JAMAIS la sécurité : le serveur décide.
 * Ce qui est vérifié ici est qu'un utilisateur ne se voit pas proposer une
 * action que le serveur lui refusera.
 */
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, beforeEach } from 'vitest'

import {
  CAPACITES,
  possede,
  peutLire,
  peutEcrireMetier,
  peutAdministrer,
} from '../utils/permissions'
import RoleGuard from '../components/RoleGuard'
import { useAuthStore } from '../store/authStore'

beforeEach(() => {
  useAuthStore.setState({ utilisateur: null, statutSession: 'inconnu' })
})

describe('matrice de présentation', () => {
  it('reproduit exactement la matrice serveur', () => {
    const attendu = {
      admin: { READ: true, BUSINESS_WRITE: true, ADMIN: true },
      tresorier: { READ: true, BUSINESS_WRITE: true, ADMIN: false },
      lecteur: { READ: true, BUSINESS_WRITE: false, ADMIN: false },
    }

    for (const [role, capacites] of Object.entries(attendu)) {
      for (const [capacite, autorise] of Object.entries(capacites)) {
        expect(possede(role, CAPACITES[capacite])).toBe(autorise)
      }
    }
  })

  it('refuse tout à un rôle inconnu ou absent', () => {
    for (const role of [undefined, null, '', 'super-admin', 'root']) {
      expect(peutLire(role)).toBe(false)
      expect(peutEcrireMetier(role)).toBe(false)
      expect(peutAdministrer(role)).toBe(false)
    }
  })

  it('expose des aides cohérentes avec possede()', () => {
    expect(peutEcrireMetier('tresorier')).toBe(true)
    expect(peutAdministrer('tresorier')).toBe(false)
    expect(peutEcrireMetier('lecteur')).toBe(false)
  })
})

describe('RoleGuard', () => {
  function rendre(capacite, role, secours = null) {
    useAuthStore.setState({
      utilisateur: role ? { id: 1, nom: 'Test', email: 't@test.local', role } : null,
      statutSession: role ? 'authentifie' : 'anonyme',
    })
    return render(
      <MemoryRouter>
        <RoleGuard capacite={capacite} secours={secours}>
          <button>Action protégée</button>
        </RoleGuard>
      </MemoryRouter>
    )
  }

  it('affiche le contenu quand la capacité est accordée', () => {
    rendre(CAPACITES.BUSINESS_WRITE, 'tresorier')
    expect(screen.getByRole('button', { name: 'Action protégée' })).toBeInTheDocument()
  })

  it('masque le contenu quand la capacité manque', () => {
    rendre(CAPACITES.BUSINESS_WRITE, 'lecteur')
    expect(screen.queryByRole('button', { name: 'Action protégée' })).not.toBeInTheDocument()
  })

  it('masque l’administration au trésorier', () => {
    rendre(CAPACITES.ADMIN, 'tresorier')
    expect(screen.queryByRole('button', { name: 'Action protégée' })).not.toBeInTheDocument()
  })

  it('masque tout à un utilisateur anonyme', () => {
    rendre(CAPACITES.READ, null)
    expect(screen.queryByRole('button', { name: 'Action protégée' })).not.toBeInTheDocument()
  })

  it('affiche le contenu de secours quand il est fourni', () => {
    rendre(CAPACITES.ADMIN, 'lecteur', <p>Accès réservé</p>)
    expect(screen.getByText('Accès réservé')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Action protégée' })).not.toBeInTheDocument()
  })
})

describe('source du rôle', () => {
  it('ne lit jamais le rôle depuis localStorage', () => {
    window.localStorage.setItem(
      'auth-storage',
      JSON.stringify({ state: { user: { role: 'admin' } } })
    )
    window.localStorage.setItem(
      'mosquee-auth',
      JSON.stringify({ state: { user: { role: 'admin' } } })
    )

    useAuthStore.setState({
      utilisateur: { id: 1, nom: 'Test', email: 't@test.local', role: 'lecteur' },
      statutSession: 'authentifie',
    })

    render(
      <MemoryRouter>
        <RoleGuard capacite={CAPACITES.ADMIN}>
          <button>Administration</button>
        </RoleGuard>
      </MemoryRouter>
    )

    expect(screen.queryByRole('button', { name: 'Administration' })).not.toBeInTheDocument()
  })

  it('ne persiste aucune session dans le navigateur', () => {
    useAuthStore.setState({
      utilisateur: { id: 1, nom: 'Test', email: 't@test.local', role: 'admin' },
      statutSession: 'authentifie',
    })

    const contenu = JSON.stringify(window.localStorage)
    expect(contenu).not.toMatch(/t@test\.local/)
    expect(window.localStorage.getItem('mosquee-auth')).toBeNull()
  })
})
