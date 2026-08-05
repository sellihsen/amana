/**
 * T066 [US4] — Interface Social : bilan, erreurs de solde et permissions.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach, vi } from 'vitest'

import BilanSocial from '../components/BilanSocial'
import { useAuthStore } from '../store/authStore'
import { CAPACITES, possede } from '../utils/permissions'
import { MontantInvalideError, normaliserMontants } from '../services/operations'

const bilan = {
  total_collecte: '1000.00',
  total_distribue: '250.00',
  reste_disponible: '750.00',
  devise: 'EUR',
  caisses: [
    {
      caisse_id: 1,
      caisse_nom: 'Zakat al-Fitr',
      total_collecte: '1000.00',
      total_distribue: '250.00',
      reste_disponible: '750.00',
      nb_distributions: 2,
    },
  ],
}

beforeEach(() => {
  useAuthStore.setState({ utilisateur: null, statutSession: 'inconnu' })
  vi.restoreAllMocks()
})

describe('affichage du bilan', () => {
  it('présente collecté, distribué et disponible', () => {
    render(<BilanSocial bilan={bilan} />)

    expect(screen.getByTestId('social-collecte')).toHaveTextContent('1 000,00')
    expect(screen.getByTestId('social-distribue')).toHaveTextContent('250,00')
    expect(screen.getByTestId('social-disponible')).toHaveTextContent('750,00')
  })

  it('affiche des zéros exacts quand rien n’a été collecté', () => {
    render(
      <BilanSocial
        bilan={{
          total_collecte: '0.00',
          total_distribue: '0.00',
          reste_disponible: '0.00',
          caisses: [],
        }}
      />
    )
    expect(screen.getByTestId('social-disponible')).toHaveTextContent('0,00')
  })

  it('détaille chaque caisse', () => {
    render(<BilanSocial bilan={bilan} />)
    expect(screen.getByText('Zakat al-Fitr')).toBeInTheDocument()
  })

  it('signale un disponible épuisé', () => {
    render(
      <BilanSocial
        bilan={{ ...bilan, reste_disponible: '0.00', caisses: [] }}
      />
    )
    expect(screen.getByTestId('social-disponible')).toHaveTextContent('0,00')
  })

  it('n’affiche jamais un montant recalculé côté client', () => {
    // Les trois valeurs viennent telles quelles du serveur.
    render(<BilanSocial bilan={{ ...bilan, reste_disponible: '749.99' }} />)
    expect(screen.getByTestId('social-disponible')).toHaveTextContent('749,99')
  })
})

describe('permissions Social', () => {
  it('le trésorier peut enregistrer un versement', () => {
    expect(possede('tresorier', CAPACITES.BUSINESS_WRITE)).toBe(true)
  })

  it('le lecteur ne peut pas enregistrer de versement', () => {
    expect(possede('lecteur', CAPACITES.BUSINESS_WRITE)).toBe(false)
  })

  it('l’aide sociale n’exige pas la capacité ADMIN', () => {
    expect(possede('tresorier', CAPACITES.ADMIN)).toBe(false)
    expect(possede('tresorier', CAPACITES.BUSINESS_WRITE)).toBe(true)
  })
})

describe('saisie du montant de distribution', () => {
  it('normalise une saisie française en chaîne EUR', () => {
    const sortie = normaliserMontants({ montant_verse: '1 250,50' }, ['montant_verse'])
    expect(sortie.montant_verse).toBe('1250.50')
  })

  it('refuse une précision excessive plutôt que d’arrondir', () => {
    expect(() => normaliserMontants({ montant_verse: '10,456' }, ['montant_verse'])).toThrow(
      MontantInvalideError
    )
  })

  it('refuse une saisie non numérique', () => {
    expect(() => normaliserMontants({ montant_verse: 'beaucoup' }, ['montant_verse'])).toThrow()
  })
})
