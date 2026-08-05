/**
 * T039 [US2] — Parcours de contre-écriture.
 *
 * Corriger une opération comptabilisée passe par une contre-écriture motivée,
 * jamais par une modification ou une suppression.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach, vi } from 'vitest'

import BoutonContreEcriture from '../components/BoutonContreEcriture'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'

function connecterEn(role) {
  useAuthStore.setState({
    utilisateur: { id: 1, nom: 'Test', email: 't@test.local', role },
    statutSession: 'authentifie',
  })
}

const ecriture = {
  id: 42,
  type_ecriture: 'DON',
  montant: '250.00',
  sens: 'CREDIT',
  perimetre: 'GENERAL',
  est_annulee: false,
}

beforeEach(() => {
  useAuthStore.setState({ utilisateur: null, statutSession: 'inconnu' })
  vi.restoreAllMocks()
})

describe('visibilité', () => {
  it('est proposé au trésorier', () => {
    connecterEn('tresorier')
    render(<BoutonContreEcriture ecriture={ecriture} />)
    expect(screen.getByRole('button', { name: /contre-écriture/i })).toBeInTheDocument()
  })

  it('est masqué au lecteur', () => {
    connecterEn('lecteur')
    render(<BoutonContreEcriture ecriture={ecriture} />)
    expect(screen.queryByRole('button', { name: /contre-écriture/i })).not.toBeInTheDocument()
  })

  it('est masqué pour une écriture déjà annulée', () => {
    connecterEn('admin')
    render(<BoutonContreEcriture ecriture={{ ...ecriture, est_annulee: true }} />)
    expect(screen.queryByRole('button', { name: /contre-écriture/i })).not.toBeInTheDocument()
    expect(screen.getByText(/annulée/i)).toBeInTheDocument()
  })
})

describe('saisie du motif', () => {
  it('exige un motif avant d’envoyer', async () => {
    connecterEn('tresorier')
    const envoi = vi.spyOn(api, 'post')
    const utilisateur = userEvent.setup()

    render(<BoutonContreEcriture ecriture={ecriture} />)
    await utilisateur.click(screen.getByRole('button', { name: /contre-écriture/i }))
    await utilisateur.click(screen.getByRole('button', { name: /confirmer/i }))

    expect(envoi).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/motif/i)
  })

  it('envoie le motif et une clé d’idempotence', async () => {
    connecterEn('tresorier')
    const envoi = vi
      .spyOn(api, 'post')
      .mockResolvedValue({ data: { origine: ecriture, contre_ecriture: { id: 43 } } })
    const utilisateur = userEvent.setup()

    render(<BoutonContreEcriture ecriture={ecriture} />)
    await utilisateur.click(screen.getByRole('button', { name: /contre-écriture/i }))
    await utilisateur.type(screen.getByLabelText(/motif/i), 'Erreur de caisse')
    await utilisateur.click(screen.getByRole('button', { name: /confirmer/i }))

    await waitFor(() => expect(envoi).toHaveBeenCalledTimes(1))
    const [chemin, corps, options] = envoi.mock.calls[0]
    expect(chemin).toBe('/ecritures-financieres/42/contre-ecritures')
    expect(corps).toEqual({ motif: 'Erreur de caisse' })
    expect(options.headers['Idempotency-Key']).toEqual(expect.any(String))
    expect(options.headers['Idempotency-Key'].length).toBeGreaterThan(0)
  })

  it('réutilise la même clé si l’utilisateur réessaie après une erreur réseau', async () => {
    connecterEn('tresorier')
    const envoi = vi
      .spyOn(api, 'post')
      .mockRejectedValueOnce({ response: { status: 500, data: { message: 'Erreur' } } })
      .mockResolvedValueOnce({ data: { origine: ecriture, contre_ecriture: { id: 43 } } })
    const utilisateur = userEvent.setup()

    render(<BoutonContreEcriture ecriture={ecriture} />)
    await utilisateur.click(screen.getByRole('button', { name: /contre-écriture/i }))
    await utilisateur.type(screen.getByLabelText(/motif/i), 'Erreur de caisse')
    await utilisateur.click(screen.getByRole('button', { name: /confirmer/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())

    await utilisateur.click(screen.getByRole('button', { name: /confirmer/i }))
    await waitFor(() => expect(envoi).toHaveBeenCalledTimes(2))

    // Une seule contre-écriture doit résulter des deux tentatives.
    expect(envoi.mock.calls[0][2].headers['Idempotency-Key']).toBe(
      envoi.mock.calls[1][2].headers['Idempotency-Key']
    )
  })
})

describe('retours du serveur', () => {
  it('affiche le message d’une écriture déjà annulée', async () => {
    connecterEn('tresorier')
    vi.spyOn(api, 'post').mockRejectedValue({
      response: { status: 409, data: { code: 'ALREADY_REVERSED', message: 'Déjà contrepassée.' } },
    })
    const utilisateur = userEvent.setup()

    render(<BoutonContreEcriture ecriture={ecriture} />)
    await utilisateur.click(screen.getByRole('button', { name: /contre-écriture/i }))
    await utilisateur.type(screen.getByLabelText(/motif/i), 'Erreur')
    await utilisateur.click(screen.getByRole('button', { name: /confirmer/i }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/déjà/i))
  })

  it('affiche un refus de permission sans déconnecter', async () => {
    connecterEn('tresorier')
    vi.spyOn(api, 'post').mockRejectedValue({
      response: { status: 403, data: { code: 'FORBIDDEN', message: 'Interdit.' } },
    })
    const utilisateur = userEvent.setup()

    render(<BoutonContreEcriture ecriture={ecriture} />)
    await utilisateur.click(screen.getByRole('button', { name: /contre-écriture/i }))
    await utilisateur.type(screen.getByLabelText(/motif/i), 'Erreur')
    await utilisateur.click(screen.getByRole('button', { name: /confirmer/i }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(useAuthStore.getState().utilisateur).not.toBeNull()
  })

  it('notifie le parent après succès', async () => {
    connecterEn('tresorier')
    vi.spyOn(api, 'post').mockResolvedValue({
      data: { origine: ecriture, contre_ecriture: { id: 43 } },
    })
    const surSucces = vi.fn()
    const utilisateur = userEvent.setup()

    render(<BoutonContreEcriture ecriture={ecriture} surSucces={surSucces} />)
    await utilisateur.click(screen.getByRole('button', { name: /contre-écriture/i }))
    await utilisateur.type(screen.getByLabelText(/motif/i), 'Erreur')
    await utilisateur.click(screen.getByRole('button', { name: /confirmer/i }))

    await waitFor(() => expect(surSucces).toHaveBeenCalledTimes(1))
  })
})
