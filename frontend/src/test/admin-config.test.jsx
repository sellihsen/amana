/**
 * T089 [US6] — Administration des référentiels et listes d'options actives.
 */
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'

import { libellesOptions, optionsActives } from '../utils/options'
import MessageHistorique from '../components/MessageHistorique'
import { CAPACITES, possede } from '../utils/permissions'

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('normalisation des options', () => {
  it('extrait les libellés d’une liste { id, nom }', () => {
    const options = [
      { id: 1, nom: 'Électricité', actif: true },
      { id: 2, nom: 'Eau', actif: true },
    ]
    expect(libellesOptions(options)).toEqual(['Électricité', 'Eau'])
  })

  it('tolère une liste vide ou absente', () => {
    expect(libellesOptions([])).toEqual([])
    expect(libellesOptions(undefined)).toEqual([])
    expect(libellesOptions(null)).toEqual([])
  })

  it('ne conserve que les références actives', () => {
    const options = [
      { id: 1, nom: 'Active', actif: true },
      { id: 2, nom: 'Inactive', actif: false },
    ]
    expect(optionsActives(options)).toHaveLength(1)
    expect(optionsActives(options)[0].nom).toBe('Active')
  })

  it('conserve un libellé historique absent des options actives', () => {
    // Une opération passée référence « Ancienne », désormais désactivée : le
    // libellé doit rester sélectionné pour ne pas être perdu à l'affichage.
    const actives = [{ id: 1, nom: 'Active', actif: true }]
    const avecHistorique = optionsActives(actives, 'Ancienne')

    expect(avecHistorique.map((o) => o.nom)).toContain('Ancienne')
    expect(avecHistorique.map((o) => o.nom)).toContain('Active')
  })

  it('ne duplique pas un libellé déjà actif', () => {
    const actives = [{ id: 1, nom: 'Active', actif: true }]
    expect(optionsActives(actives, 'Active')).toHaveLength(1)
  })
})

describe('erreurs d’administration', () => {
  it('explique qu’une référence utilisée se désactive', () => {
    render(
      <MessageHistorique
        erreur={{
          response: {
            status: 409,
            data: {
              code: 'HISTORY_EXISTS',
              message: '« Électricité » est utilisé par 3 opération(s).',
            },
          },
        }}
      />
    )
    const alerte = screen.getByRole('alert')
    expect(alerte).toHaveTextContent(/3 opération/)
    expect(alerte).toHaveTextContent(/désactiv/i)
  })

  it('explique qu’une référence désactivée n’est plus sélectionnable', () => {
    render(
      <MessageHistorique
        erreur={{
          response: {
            status: 409,
            data: {
              code: 'INACTIVE_REFERENCE',
              message: '« Ancienne » est désactivé et ne peut plus être sélectionné.',
            },
          },
        }}
      />
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/désactivé/i)
  })
})

describe('accès à l’administration', () => {
  it('exige la capacité ADMIN', () => {
    expect(possede('admin', CAPACITES.ADMIN)).toBe(true)
    expect(possede('tresorier', CAPACITES.ADMIN)).toBe(false)
    expect(possede('lecteur', CAPACITES.ADMIN)).toBe(false)
  })
})
