const { assertTestDatabaseName } = require('../helpers/database');

/**
 * Garde du harnais de test.
 *
 * Les tests d'intégration créent et DÉTRUISENT leur base à chaque exécution.
 * Cette garde est la seule chose qui empêche une variable d'environnement mal
 * renseignée d'effacer une base réelle.
 */
describe('harnais de test', () => {
  it.each([
    ['amana_db', 'la base de production réelle'],
    ['postgres', 'la base de maintenance'],
    ['amana_restauration_essai', 'la base de test de restauration'],
    ['production', 'un nom explicite'],
    ['amana_test_bis', 'un suffixe _test non final'],
  ])('refuse « %s » (%s)', (nom) => {
    expect(() => assertTestDatabaseName(nom)).toThrow(/_test/);
  });

  it('refuse un nom vide ou absent', () => {
    for (const nom of ['', '   ', undefined, null]) {
      expect(() => assertTestDatabaseName(nom)).toThrow();
    }
  });

  it('accepte une base suffixée _test', () => {
    expect(assertTestDatabaseName('amana_test')).toBe('amana_test');
  });
});
