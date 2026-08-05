/**
 * La mise en page s'adapte aux écrans étroits.
 *
 * Ce test existe à cause d'un défaut réel : la barre latérale occupait 256 px
 * en permanence. Sur un téléphone de 375 px, il ne restait qu'une centaine de
 * pixels au contenu, et les tableaux étaient rognés par un `overflow-hidden`.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, beforeEach } from 'vitest'

import Layout from '../components/layout/Layout'
import Sidebar from '../components/layout/Sidebar'
import { useAuthStore } from '../store/authStore'

beforeEach(() => {
  useAuthStore.setState({
    utilisateur: { id: 1, nom: 'Admin Test', email: 'a@test.local', role: 'admin' },
    statutSession: 'authentifie',
  })
})

describe('barre latérale', () => {
  it('est hors écran tant que le tiroir est fermé', () => {
    const { container } = render(
      <MemoryRouter>
        <Sidebar ouvert={false} surFermeture={() => {}} />
      </MemoryRouter>
    )
    const aside = container.querySelector('aside')
    expect(aside.className).toContain('-translate-x-full')
    // Mais redevient visible dès le point de rupture large.
    expect(aside.className).toContain('lg:translate-x-0')
  })

  it('glisse à l’écran quand le tiroir est ouvert', () => {
    const { container } = render(
      <MemoryRouter>
        <Sidebar ouvert surFermeture={() => {}} />
      </MemoryRouter>
    )
    const aside = container.querySelector('aside')
    expect(aside.className).toContain('translate-x-0')
    expect(aside.className).not.toContain('-translate-x-full')
  })

  it('reste une colonne fixe sur grand écran', () => {
    const { container } = render(
      <MemoryRouter>
        <Sidebar ouvert={false} surFermeture={() => {}} />
      </MemoryRouter>
    )
    expect(container.querySelector('aside').className).toContain('lg:static')
  })

  it('offre une fermeture explicite en mode tiroir', async () => {
    let ferme = false
    render(
      <MemoryRouter>
        <Sidebar ouvert surFermeture={() => { ferme = true }} />
      </MemoryRouter>
    )
    await userEvent.click(screen.getByRole('button', { name: /fermer le menu/i }))
    expect(ferme).toBe(true)
  })
})

describe('ossature', () => {
  it('expose un bouton d’ouverture, masqué sur grand écran', () => {
    render(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>
    )
    const bouton = screen.getByRole('button', { name: /ouvrir le menu/i })
    expect(bouton).toBeInTheDocument()
    expect(bouton.className).toContain('lg:hidden')
  })

  it('ouvre puis referme le tiroir', async () => {
    const { container } = render(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>
    )
    const aside = container.querySelector('aside')
    expect(aside.className).toContain('-translate-x-full')

    await userEvent.click(screen.getByRole('button', { name: /ouvrir le menu/i }))
    expect(container.querySelector('aside').className).toContain('translate-x-0')

    await userEvent.click(screen.getByRole('button', { name: /fermer le menu/i }))
    expect(container.querySelector('aside').className).toContain('-translate-x-full')
  })

  it('empêche le contenu de déborder horizontalement', () => {
    const { container } = render(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>
    )
    // `min-w-0` autorise la colonne de contenu à se réduire ; sans lui, un
    // tableau large repousse toute la mise en page.
    expect(container.innerHTML).toContain('min-w-0')
  })
})

describe('tableaux', () => {
  const fs = require('fs')
  const path = require('path')
  const dossier = path.join(process.cwd(), 'src', 'pages')
  const pages = fs.readdirSync(dossier).filter((f) => f.endsWith('.jsx'))

  it.each(pages)('%s : aucun tableau n’est rogné', (page) => {
    const contenu = fs.readFileSync(path.join(dossier, page), 'utf8')
    if (!contenu.includes('<table')) return

    // `overflow-hidden` coupe les colonnes au lieu de permettre le défilement.
    const conteneursRognants = /className="[^"]*card p-0 overflow-hidden/.test(contenu)
    expect(conteneursRognants).toBe(false)
  })

  it.each(pages)('%s : les tableaux ont une largeur plancher', (page) => {
    const contenu = fs.readFileSync(path.join(dossier, page), 'utf8')
    const tableaux = contenu.match(/<table className="[^"]*"/g) || []
    for (const t of tableaux) {
      // Sans largeur minimale, les colonnes se compriment jusqu'à l'illisible.
      expect(t).toMatch(/min-w-/)
    }
  })
})
