/**
 * T010 — Clés d'idempotence et empreinte de requête.
 */
const {
  validerCleIdempotence,
  empreinteRequete,
  CLE_MAX_LONGUEUR,
} = require('../../src/utils/idempotency');

describe('validation de la clé', () => {
  it('accepte une clé de 1 à 128 caractères', () => {
    expect(validerCleIdempotence('a')).toBe('a');
    const longue = 'k'.repeat(CLE_MAX_LONGUEUR);
    expect(validerCleIdempotence(longue)).toBe(longue);
  });

  it('accepte un UUID', () => {
    const uuid = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
    expect(validerCleIdempotence(uuid)).toBe(uuid);
  });

  it('refuse une clé absente, vide ou trop longue', () => {
    expect(() => validerCleIdempotence(undefined)).toThrow();
    expect(() => validerCleIdempotence(null)).toThrow();
    expect(() => validerCleIdempotence('')).toThrow();
    expect(() => validerCleIdempotence('   ')).toThrow();
    expect(() => validerCleIdempotence('k'.repeat(CLE_MAX_LONGUEUR + 1))).toThrow();
  });

  it('refuse une clé non textuelle', () => {
    expect(() => validerCleIdempotence(42)).toThrow();
    expect(() => validerCleIdempotence({})).toThrow();
    expect(() => validerCleIdempotence(['a'])).toThrow();
  });
});

describe('empreinte de requête', () => {
  it('est stable pour un même contenu', () => {
    const a = empreinteRequete({ montant: '10.00', caisse_id: 1 });
    const b = empreinteRequete({ montant: '10.00', caisse_id: 1 });
    expect(a).toBe(b);
  });

  it("ne dépend pas de l'ordre des clés", () => {
    const a = empreinteRequete({ montant: '10.00', caisse_id: 1 });
    const b = empreinteRequete({ caisse_id: 1, montant: '10.00' });
    expect(a).toBe(b);
  });

  it('est stable pour des objets imbriqués désordonnés', () => {
    const a = empreinteRequete({ x: { p: 1, q: 2 }, y: [1, 2] });
    const b = empreinteRequete({ y: [1, 2], x: { q: 2, p: 1 } });
    expect(a).toBe(b);
  });

  it('change dès qu’une valeur change', () => {
    const a = empreinteRequete({ montant: '10.00' });
    const b = empreinteRequete({ montant: '10.01' });
    expect(a).not.toBe(b);
  });

  it('distingue une chaîne d’un nombre', () => {
    expect(empreinteRequete({ montant: '10' })).not.toBe(empreinteRequete({ montant: 10 }));
  });

  it('respecte l’ordre significatif d’un tableau', () => {
    expect(empreinteRequete({ v: [1, 2] })).not.toBe(empreinteRequete({ v: [2, 1] }));
  });

  it('distingue une clé absente d’une clé nulle', () => {
    expect(empreinteRequete({ a: 1 })).not.toBe(empreinteRequete({ a: 1, b: null }));
  });

  it('produit une empreinte hexadécimale de longueur fixe', () => {
    expect(empreinteRequete({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });
});
