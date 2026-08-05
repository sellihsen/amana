/**
 * T056 [US3] — Pages personnes : recherche, statuts et refus de suppression.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach, vi } from 'vitest'

import MessageHistorique from '../components/MessageHistorique'
import { useAuthStore } from '../store/authStore'
import { CAPACITES, possede } from '../utils/permissions'

beforeEach(() => {
  useAuthStore.setState({ utilisateur: null, statutSession: 'inconnu' })
  vi.restoreAllMocks()
})

describe('MessageHistorique', () => {
  it('explique qu’il faut désactiver plutôt que supprimer', () => {
    render(
      <MessageHistorique
        erreur={{
          response: {
            status: 409,
            data: {
              code: 'HISTORY_EXISTS',
              message: 'Ce membre possède des dons ou des cotisations.',
            },
          },
        }}
      />
    )

    const alerte = screen.getByRole('alert')
    expect(alerte).toHaveTextContent(/cotisations/i)
    expect(alerte).toHaveTextContent(/désactiv/i)
  })

  it('affiche le message brut pour une autre erreur', () => {
    render(
      <MessageHistorique
        erreur={{ response: { status: 400, data: { code: 'VALIDATION_ERROR', message: 'Nom requis.' } } }}
      />
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Nom requis.')
  })

  it('n’affiche rien sans erreur', () => {
    const { container } = render(<MessageHistorique erreur={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('distingue un refus de permission', () => {
    render(
      <MessageHistorique
        erreur={{ response: { status: 403, data: { code: 'FORBIDDEN', message: 'Interdit.' } } }}
      />
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/permission|autoris/i)
  })
})

describe('capacités sur les pages personnes', () => {
  it('un lecteur ne peut ni créer ni supprimer', () => {
    expect(possede('lecteur', CAPACITES.BUSINESS_WRITE)).toBe(false)
  })

  it('un trésorier peut gérer membres, personnel et élèves', () => {
    expect(possede('tresorier', CAPACITES.BUSINESS_WRITE)).toBe(true)
  })

  it('la gestion des personnes n’exige jamais la capacité ADMIN', () => {
    // Créer un membre ou un élève est une écriture métier, pas de
    // l'administration : un trésorier doit pouvoir le faire.
    expect(possede('tresorier', CAPACITES.BUSINESS_WRITE)).toBe(true)
    expect(possede('tresorier', CAPACITES.ADMIN)).toBe(false)
  })
})

describe('normalisation de période Madrasa', () => {
  it('accepte les écritures usuelles d’un mois', async () => {
    const { normaliserPeriodeAffichee } = await import('../utils/periode')
    expect(normaliserPeriodeAffichee('2026-09-01')).toMatch(/septembre 2026/i)
    expect(normaliserPeriodeAffichee(null)).toBe('—')
  })

  it('liste les mois dans l’ordre chronologique', async () => {
    const { moisOptions } = await import('../utils/periode')
    const options = moisOptions(2026)
    expect(options).toHaveLength(12)
    expect(options[0].valeur).toBe('2026-01')
    expect(options[11].valeur).toBe('2026-12')
    expect(options[8].libelle).toMatch(/septembre/i)
  })
})
