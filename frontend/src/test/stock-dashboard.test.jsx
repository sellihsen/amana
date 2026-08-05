/**
 * T081 [US5] — Mouvements de stock et alerte globale.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach, vi } from 'vitest'

import MouvementStock from '../components/MouvementStock'
import BandeauAlertesStock from '../components/BandeauAlertesStock'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'

const produit = {
  id: 5,
  nom: 'Sacs de Ciment',
  quantite_actuelle: 10,
  quantite_minimale_alerte: 10,
  unite: 'Sacs',
}

function connecterEn(role) {
  useAuthStore.setState({
    utilisateur: { id: 1, nom: 'T', email: 't@test.local', role },
    statutSession: 'authentifie',
  })
}

beforeEach(() => {
  useAuthStore.setState({ utilisateur: null, statutSession: 'inconnu' })
  vi.restoreAllMocks()
})

describe('MouvementStock', () => {
  it('est masqué au lecteur', () => {
    connecterEn('lecteur')
    render(<MouvementStock produit={produit} />)
    expect(screen.queryByRole('button', { name: /entrée/i })).not.toBeInTheDocument()
  })

  it('propose entrée et sortie au trésorier', () => {
    connecterEn('tresorier')
    render(<MouvementStock produit={produit} />)
    expect(screen.getByRole('button', { name: /entrée/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sortie/i })).toBeInTheDocument()
  })

  it('envoie le mouvement avec une clé d’idempotence', async () => {
    connecterEn('tresorier')
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValue({ data: { quantite_avant: 10, quantite_apres: 7 } })
    const utilisateur = userEvent.setup()

    render(<MouvementStock produit={produit} />)
    await utilisateur.click(screen.getByRole('button', { name: /sortie/i }))
    await utilisateur.clear(screen.getByLabelText(/quantité/i))
    await utilisateur.type(screen.getByLabelText(/quantité/i), '3')
    await utilisateur.type(screen.getByLabelText(/motif/i), 'Chantier')
    await utilisateur.click(screen.getByRole('button', { name: /confirmer/i }))

    await waitFor(() => expect(post).toHaveBeenCalled())
    const [chemin, corps, options] = post.mock.calls[0]
    expect(chemin).toBe('/stock/5/mouvements')
    expect(corps).toEqual({ type: 'SORTIE', quantite: 3, motif: 'Chantier' })
    expect(options.headers['Idempotency-Key']).toEqual(expect.any(String))
  })

  it('refuse une quantité non entière avant l’envoi', async () => {
    connecterEn('tresorier')
    const post = vi.spyOn(api, 'post')
    const utilisateur = userEvent.setup()

    render(<MouvementStock produit={produit} />)
    await utilisateur.click(screen.getByRole('button', { name: /sortie/i }))
    await utilisateur.clear(screen.getByLabelText(/quantité/i))
    await utilisateur.type(screen.getByLabelText(/quantité/i), '0')
    await utilisateur.click(screen.getByRole('button', { name: /confirmer/i }))

    expect(post).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/entier|positif/i)
  })

  it('affiche le refus de stock insuffisant', async () => {
    connecterEn('tresorier')
    vi.spyOn(api, 'post').mockRejectedValue({
      response: {
        status: 409,
        data: { code: 'STOCK_INSUFFICIENT', message: 'Stock insuffisant : 10 Sacs disponible(s).' },
      },
    })
    const utilisateur = userEvent.setup()

    render(<MouvementStock produit={produit} />)
    await utilisateur.click(screen.getByRole('button', { name: /sortie/i }))
    await utilisateur.clear(screen.getByLabelText(/quantité/i))
    await utilisateur.type(screen.getByLabelText(/quantité/i), '50')
    await utilisateur.click(screen.getByRole('button', { name: /confirmer/i }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/insuffisant/i))
  })

  it('notifie le parent après succès', async () => {
    connecterEn('tresorier')
    vi.spyOn(api, 'post').mockResolvedValue({ data: { quantite_avant: 10, quantite_apres: 13 } })
    const surSucces = vi.fn()
    const utilisateur = userEvent.setup()

    render(<MouvementStock produit={produit} surSucces={surSucces} />)
    await utilisateur.click(screen.getByRole('button', { name: /entrée/i }))
    await utilisateur.clear(screen.getByLabelText(/quantité/i))
    await utilisateur.type(screen.getByLabelText(/quantité/i), '3')
    await utilisateur.click(screen.getByRole('button', { name: /confirmer/i }))

    await waitFor(() => expect(surSucces).toHaveBeenCalled())
  })
})

describe('BandeauAlertesStock', () => {
  it('n’affiche rien sans alerte', () => {
    const { container } = render(<BandeauAlertesStock alertes={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('signale les produits au seuil', () => {
    render(
      <BandeauAlertesStock
        alertes={[
          { id: 1, nom: 'Ciment', quantite_actuelle: 5, quantite_minimale_alerte: 10, unite: 'Sacs' },
          { id: 2, nom: 'Peinture', quantite_actuelle: 3, quantite_minimale_alerte: 10, unite: 'Litres' },
        ]}
      />
    )

    const alerte = screen.getByRole('alert')
    expect(alerte).toHaveTextContent('Ciment')
    expect(alerte).toHaveTextContent('Peinture')
    expect(alerte).toHaveTextContent('2')
  })

  it('utilise les données du tableau de bord, sans requête propre', () => {
    const get = vi.spyOn(api, 'get')
    render(<BandeauAlertesStock alertes={[{ id: 1, nom: 'Ciment', quantite_actuelle: 1, quantite_minimale_alerte: 5, unite: 'Sacs' }]} />)
    // Le bandeau ne déclenche aucun appel : il consomme /api/dashboard.
    expect(get).not.toHaveBeenCalled()
  })
})
