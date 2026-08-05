const { assertTestDatabaseName } = require('../helpers/database');

describe('harnais de test', () => {
  it('refuse une base qui n\'est pas suffixée _test', () => {
    expect(() => assertTestDatabaseName('mosquee_db')).toThrow(/_test/);
  });

  it('accepte une base suffixée _test', () => {
    expect(assertTestDatabaseName('mosquee_test')).toBe('mosquee_test');
  });
});
