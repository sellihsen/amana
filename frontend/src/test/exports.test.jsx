/**
 * T096 [US8] — Exports XLSX et PDF : projection filtrée, colonnes, EUR, dates
 * et caractères accentués.
 */
import { describe, it, expect } from 'vitest'

import { projeter, valeurCellule, formaterCellule } from '../utils/export'

const colonnes = [
  { key: 'donateur', label: 'Donateur' },
  { key: 'caisse_nom', label: 'Caisse' },
  { key: 'montant', label: 'Montant', format: 'eur' },
  { key: 'date_don', label: 'Date', format: 'date' },
  { key: 'commentaire', label: 'Commentaire' },
]

const lignes = [
  {
    donateur: 'Amara Diallo',
    caisse_nom: 'Zakat al-Fitr',
    montant: '1234.50',
    date_don: '2026-03-10',
    commentaire: 'Don très généreux — à réaffecter',
  },
  {
    donateur: 'Anonyme',
    caisse_nom: 'Dons du Vendredi (Joumouah)',
    montant: '0.10',
    date_don: '2026-01-01',
    commentaire: null,
  },
]

describe('projection', () => {
  it('ne retient que les colonnes demandées, dans l’ordre', () => {
    const { entetes, corps } = projeter(lignes, colonnes)

    expect(entetes).toEqual(['Donateur', 'Caisse', 'Montant', 'Date', 'Commentaire'])
    expect(corps).toHaveLength(2)
    expect(corps[0]).toHaveLength(5)
  })

  it('exporte exactement la collection reçue, sans en ajouter', () => {
    const filtrees = [lignes[0]]
    const { corps } = projeter(filtrees, colonnes)
    expect(corps).toHaveLength(1)
    expect(corps[0][0]).toBe('Amara Diallo')
  })

  it('produit un export vide pour une liste vide', () => {
    const { corps } = projeter([], colonnes)
    expect(corps).toEqual([])
  })

  it('lit une clé imbriquée', () => {
    const { corps } = projeter([{ membre: { nom: 'Fatima' } }], [
      { key: 'membre.nom', label: 'Membre' },
    ])
    expect(corps[0][0]).toBe('Fatima')
  })

  it('remplace une valeur absente par une chaîne vide', () => {
    const { corps } = projeter(lignes, colonnes)
    expect(corps[1][4]).toBe('')
  })
})

describe('format monétaire', () => {
  it('rend un montant EUR lisible en français', () => {
    const rendu = formaterCellule('1234.50', 'eur')
    expect(rendu).toMatch(/1[\s\u00a0\u202f]?234,50/)
    expect(rendu).toMatch(/€/)
  })

  it('ne perd pas les centimes', () => {
    expect(formaterCellule('0.10', 'eur')).toMatch(/0,10/)
    expect(formaterCellule('0.01', 'eur')).toMatch(/0,01/)
  })

  it('rend un zéro exact', () => {
    expect(formaterCellule('0.00', 'eur')).toMatch(/0,00/)
    expect(formaterCellule(null, 'eur')).toMatch(/0,00/)
  })

  it('fournit un nombre exact pour une cellule Excel', () => {
    // Excel doit recevoir un nombre pour pouvoir totaliser lui-même.
    expect(valeurCellule('1234.50', 'eur')).toBe(1234.5)
    expect(valeurCellule('0.10', 'eur')).toBe(0.1)
    expect(valeurCellule(null, 'eur')).toBe(0)
  })
})

describe('format de date', () => {
  it('rend une date au format français', () => {
    expect(formaterCellule('2026-03-10', 'date')).toBe('10/03/2026')
  })

  it('gère une date ISO complète', () => {
    expect(formaterCellule('2026-03-10T10:00:00.000Z', 'date')).toMatch(/10\/03\/2026/)
  })

  it('rend une chaîne vide pour une date absente', () => {
    expect(formaterCellule(null, 'date')).toBe('')
    expect(formaterCellule('', 'date')).toBe('')
  })

  it('ne dénature pas une date invalide', () => {
    expect(formaterCellule('pas-une-date', 'date')).toBe('pas-une-date')
  })
})

describe('caractères accentués', () => {
  it('préserve les accents et signes français', () => {
    const { corps } = projeter(lignes, colonnes)
    expect(corps[0][4]).toBe('Don très généreux — à réaffecter')
    expect(corps[0][1]).toBe('Zakat al-Fitr')
  })

  it.each(['é', 'è', 'ê', 'à', 'ù', 'ç', 'ô', 'î', '—', '’', '€'])(
    'préserve « %s »',
    (caractere) => {
      const { corps } = projeter([{ v: `test${caractere}` }], [{ key: 'v', label: 'V' }])
      expect(corps[0][0]).toBe(`test${caractere}`)
    }
  );

  it('conserve les majuscules accentuées', () => {
    const { corps } = projeter([{ v: 'ÉCOLE À Ç' }], [{ key: 'v', label: 'V' }])
    expect(corps[0][0]).toBe('ÉCOLE À Ç')
  })
})
