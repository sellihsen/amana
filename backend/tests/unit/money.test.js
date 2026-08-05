/**
 * T010 — Validation des chaînes EUR.
 *
 * Constitution I : un montant n'est jamais approximé. Une précision autre que
 * deux décimales est refusée, jamais arrondie implicitement.
 */
const {
  MONEY_PATTERN,
  MONTANT_MAX,
  validerMontant,
  validerMontantPositif,
  validerMontantNonNegatif,
  formaterMontant,
} = require('../../src/utils/money');

describe('format accepté', () => {
  it.each([
    '0.00',
    '0.01',
    '1.00',
    '125.00',
    '125.45',
    '9999999999.99',
    '1000000.50',
  ])('accepte %s', (valeur) => {
    expect(MONEY_PATTERN.test(valeur)).toBe(true);
    expect(validerMontantNonNegatif(valeur, 'montant')).toBe(valeur);
  });
});

describe('précision refusée', () => {
  it.each([
    ['125', 'aucune décimale'],
    ['125.4', 'une seule décimale'],
    ['125.456', 'trois décimales'],
    ['125.4567', 'quatre décimales'],
    ['.50', 'partie entière absente'],
    ['125.', 'partie décimale absente'],
    ['0125.00', 'zéro non significatif'],
    ['1 25.00', 'espace'],
    ['125,45', 'virgule décimale'],
    ['1e2', 'notation scientifique'],
    ['+125.00', 'signe explicite'],
    ['', 'chaîne vide'],
    ['abc', 'texte'],
    ['NaN', 'NaN'],
    ['Infinity', 'Infinity'],
  ])('refuse %s (%s)', (valeur) => {
    expect(() => validerMontantNonNegatif(valeur, 'montant')).toThrow();
  });

  it('refuse un nombre JSON plutôt que de le convertir silencieusement', () => {
    expect(() => validerMontantNonNegatif(125.45, 'montant')).toThrow();
    expect(() => validerMontantNonNegatif(125, 'montant')).toThrow();
  });

  it('refuse null et undefined', () => {
    expect(() => validerMontantNonNegatif(null, 'montant')).toThrow();
    expect(() => validerMontantNonNegatif(undefined, 'montant')).toThrow();
  });

  it('ne perd jamais de précision sur une valeur non représentable en binaire', () => {
    // 0.1 + 0.2 vaut 0.30000000000000004 en flottant : la chaîne reste exacte.
    expect(validerMontantNonNegatif('0.30', 'montant')).toBe('0.30');
    expect(() => validerMontantNonNegatif(String(0.1 + 0.2), 'montant')).toThrow();
  });
});

describe('bornes', () => {
  it('refuse zéro pour un montant devant être positif', () => {
    expect(() => validerMontantPositif('0.00', 'montant')).toThrow();
    expect(validerMontantPositif('0.01', 'montant')).toBe('0.01');
  });

  it('accepte zéro pour un montant non négatif', () => {
    expect(validerMontantNonNegatif('0.00', 'montant')).toBe('0.00');
  });

  it('refuse un montant négatif', () => {
    expect(() => validerMontantNonNegatif('-1.00', 'montant')).toThrow();
    expect(() => validerMontantPositif('-0.01', 'montant')).toThrow();
  });

  it('refuse un montant au-delà de la borne haute', () => {
    expect(validerMontantPositif(MONTANT_MAX, 'montant')).toBe(MONTANT_MAX);
    expect(() => validerMontantPositif('10000000000.00', 'montant')).toThrow();
  });

  it('nomme le champ fautif dans l’erreur', () => {
    try {
      validerMontantPositif('12.345', 'montant_verse');
      throw new Error('aurait dû échouer');
    } catch (err) {
      expect(err.fieldErrors).toBeDefined();
      expect(Object.keys(err.fieldErrors)).toContain('montant_verse');
    }
  });
});

describe('formatage depuis PostgreSQL', () => {
  it('rend une chaîne à deux décimales', () => {
    expect(formaterMontant('125.00')).toBe('125.00');
    expect(formaterMontant('125.4')).toBe('125.40');
    expect(formaterMontant('125')).toBe('125.00');
    expect(formaterMontant(0)).toBe('0.00');
  });

  it('rend zéro exact pour une agrégation vide', () => {
    expect(formaterMontant(null)).toBe('0.00');
    expect(formaterMontant(undefined)).toBe('0.00');
  });

  it('ne calcule jamais : il formate seulement', () => {
    expect(formaterMontant('9999999999.99')).toBe('9999999999.99');
  });
});

describe('validerMontant générique', () => {
  it('respecte l’option min', () => {
    expect(validerMontant('5.00', { champ: 'm', min: '5.00' })).toBe('5.00');
    expect(() => validerMontant('4.99', { champ: 'm', min: '5.00' })).toThrow();
  });
});
