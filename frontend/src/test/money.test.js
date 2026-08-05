/**
 * T039 [US2] — Format EUR côté interface.
 *
 * L'interface FORMATE, elle ne CALCULE pas. Aucun total n'est recomposé ici :
 * les montants viennent du serveur sous forme de chaînes exactes.
 */
import { describe, it, expect } from 'vitest'

import {
  MOTIF_EUR,
  estMontantValide,
  formaterEur,
  formaterMontantSaisi,
  normaliserSaisie,
  messageMontantInvalide,
} from '../utils/money'

describe('validation de saisie', () => {
  it.each(['0.00', '0.01', '125.00', '125.45', '9999999999.99'])('accepte %s', (v) => {
    expect(MOTIF_EUR.test(v)).toBe(true)
    expect(estMontantValide(v)).toBe(true)
  })

  it.each(['125', '125.4', '125.456', '125,45', '', 'abc', '-1.00', '01.00', '1e2'])(
    'refuse %s',
    (v) => {
      expect(estMontantValide(v)).toBe(false)
    }
  )

  it('refuse un nombre plutôt que de le convertir', () => {
    expect(estMontantValide(125.45)).toBe(false)
  })
})

describe('normalisation de saisie', () => {
  it('accepte la virgule décimale française et produit un point', () => {
    expect(normaliserSaisie('125,45')).toBe('125.45')
    expect(normaliserSaisie('125,4')).toBe('125.40')
    expect(normaliserSaisie('125,456')).toBeNull()
  })

  it('complète les décimales manquantes', () => {
    expect(normaliserSaisie('125')).toBe('125.00')
    expect(normaliserSaisie('125.5')).toBe('125.50')
    expect(normaliserSaisie('0')).toBe('0.00')
  })

  it('supprime les espaces de groupement', () => {
    expect(normaliserSaisie('1 250,00')).toBe('1250.00')
    expect(normaliserSaisie(' 125.45 ')).toBe('125.45')
  })

  it('retourne null pour une saisie inexploitable', () => {
    for (const v of ['', '   ', 'abc', '12.34.56', '-5', '1e3']) {
      expect(normaliserSaisie(v)).toBeNull()
    }
  })

  it('ne perd jamais de précision', () => {
    expect(normaliserSaisie('0.10')).toBe('0.10')
    expect(normaliserSaisie('1234567.89')).toBe('1234567.89')
  })
})

describe('affichage', () => {
  it('formate une chaîne EUR en français', () => {
    const rendu = formaterEur('1234.50')
    expect(rendu).toMatch(/1[\s\u00a0\u202f]?234,50/)
    expect(rendu).toMatch(/€/)
  })

  it('affiche un zéro exact', () => {
    expect(formaterEur('0.00')).toMatch(/0,00/)
    expect(formaterEur(null)).toMatch(/0,00/)
    expect(formaterEur(undefined)).toMatch(/0,00/)
  })

  it('n’altère jamais la valeur reçue du serveur', () => {
    expect(formaterMontantSaisi('9999999999.99')).toBe('9999999999.99')
    expect(formaterMontantSaisi('0.01')).toBe('0.01')
  })

  it('affiche un montant négatif sans le tronquer', () => {
    expect(formaterEur('-250.00')).toMatch(/250,00/)
    expect(formaterEur('-250.00')).toMatch(/-|−/)
  })

  it('ne recompose pas un montant depuis un flottant', () => {
    // 0.1 + 0.2 en binaire vaut 0.30000000000000004 : la chaîne serveur reste
    // la seule source.
    expect(formaterMontantSaisi('0.30')).toBe('0.30')
  })
})

describe('message d’erreur', () => {
  it('explique la règle des deux décimales', () => {
    expect(messageMontantInvalide()).toMatch(/deux décimales/i)
  })
})
