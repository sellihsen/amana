/**
 * T074 [US7] — Journal d'audit dans l'administration : filtres et lecture seule.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach, vi } from 'vitest'

import JournalAudit from '../components/JournalAudit'
import api from '../services/api'

const reponse = {
  data: {
    items: [
      {
        id: 2,
        type_evenement: 'member.updated',
        evenement_description: 'Modification d’un membre',
        resultat: 'SUCCES',
        utilisateur_nom: 'Fatima',
        acteur_role: 'tresorier',
        entite_type: 'membre',
        entite_id: '7',
        avant: { nom: 'Ancien' },
        apres: { nom: 'Nouveau' },
        date_action: '2026-03-10T10:00:00.000Z',
        ip: '127.0.0.1',
      },
      {
        id: 1,
        type_evenement: 'auth.login.failed',
        evenement_description: 'Tentative de connexion refusée',
        resultat: 'REFUS',
        utilisateur_nom: 'Inconnu',
        acteur_role: null,
        entite_type: 'utilisateur',
        entite_id: '3',
        avant: null,
        apres: null,
        date_action: '2026-03-10T09:00:00.000Z',
        ip: '127.0.0.1',
      },
    ],
    total: 2,
    limit: 50,
    offset: 0,
  },
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('affichage', () => {
  it('liste les événements avec acteur et résultat', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(reponse)
    render(<JournalAudit />)

    await waitFor(() => expect(screen.getByText('member.updated')).toBeInTheDocument())
    expect(screen.getByText('auth.login.failed')).toBeInTheDocument()
    expect(screen.getByText('Fatima')).toBeInTheDocument()
    expect(screen.getAllByText(/SUCCES|REFUS/).length).toBeGreaterThanOrEqual(2)
  })

  it('interroge /admin/audit-events', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue(reponse)
    render(<JournalAudit />)

    await waitFor(() => expect(get).toHaveBeenCalled())
    expect(get.mock.calls[0][0]).toBe('/admin/audit-events')
  })

  it('affiche l’état avant et après', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(reponse)
    const utilisateur = userEvent.setup()
    render(<JournalAudit />)

    await waitFor(() => expect(screen.getByText('member.updated')).toBeInTheDocument())
    await utilisateur.click(screen.getAllByRole('button', { name: /détail/i })[0])

    expect(screen.getByText(/Ancien/)).toBeInTheDocument()
    expect(screen.getByText(/Nouveau/)).toBeInTheDocument()
  })

  it('signale une liste vide sans prétendre à un succès', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { items: [], total: 0, limit: 50, offset: 0 } })
    render(<JournalAudit />)

    await waitFor(() => expect(screen.getByText(/aucun événement/i)).toBeInTheDocument())
  })

  it('affiche une erreur de chargement au lieu d’une liste vide', async () => {
    vi.spyOn(api, 'get').mockRejectedValue({
      response: { status: 500, data: { message: 'Erreur interne.' } },
    })
    render(<JournalAudit />)

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.queryByText(/aucun événement/i)).not.toBeInTheDocument()
  })
})

describe('filtres', () => {
  it('transmet le type d’événement', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue(reponse)
    const utilisateur = userEvent.setup()
    render(<JournalAudit />)

    await waitFor(() => expect(get).toHaveBeenCalled())
    await utilisateur.type(screen.getByLabelText(/type d’événement/i), 'don.posted')
    await utilisateur.click(screen.getByRole('button', { name: /filtrer/i }))

    await waitFor(() => {
      const dernier = get.mock.calls[get.mock.calls.length - 1]
      expect(dernier[1].params.event_type).toBe('don.posted')
    })
  })

  it('transmet la recherche et les dates', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue(reponse)
    const utilisateur = userEvent.setup()
    render(<JournalAudit />)

    await waitFor(() => expect(get).toHaveBeenCalled())
    await utilisateur.type(screen.getByLabelText(/recherche/i), 'Fatima')
    await utilisateur.click(screen.getByRole('button', { name: /filtrer/i }))

    await waitFor(() => {
      const dernier = get.mock.calls[get.mock.calls.length - 1]
      expect(dernier[1].params.search).toBe('Fatima')
    })
  })
})

describe('lecture seule', () => {
  it('n’expose aucune action de modification ou de suppression', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(reponse)
    render(<JournalAudit />)

    await waitFor(() => expect(screen.getByText('member.updated')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /supprimer/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /modifier/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /éditer/i })).not.toBeInTheDocument()
  })
})
