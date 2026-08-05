-- ============================================================================
-- 014 — Domaines monétaires exacts
--
-- Constitution I : « Monetary columns MUST be PostgreSQL NUMERIC with an
-- explicit scale and a CHECK constraint expressing their valid range. »
--
-- Deux domaines :
--   • montant_eur_positif      : 0.01 … 9999999999.99
--   • montant_eur_non_negatif  : 0.00 … 9999999999.99
--
-- Préflight : la migration s'ARRÊTE avec un diagnostic si des données
-- existantes ne peuvent pas entrer dans le domaine visé. Aucune valeur n'est
-- corrigée silencieusement — un montant hors bornes est une décision humaine.
--
-- Migration idempotente.
-- ============================================================================

-- ─── 1. Domaines ────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'montant_eur_positif') THEN
    CREATE DOMAIN montant_eur_positif AS NUMERIC(12,2)
      CHECK (VALUE >= 0.01 AND VALUE <= 9999999999.99);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'montant_eur_non_negatif') THEN
    CREATE DOMAIN montant_eur_non_negatif AS NUMERIC(12,2)
      CHECK (VALUE >= 0.00 AND VALUE <= 9999999999.99);
  END IF;
END $$;

-- ─── 2. Préflight ───────────────────────────────────────────────────────────
-- Toute valeur incompatible interrompt la migration en nommant la table, la
-- colonne et le nombre de lignes fautives.

DO $$
DECLARE
  cible      RECORD;
  n_fautives BIGINT;
  borne_min  NUMERIC;
  diagnostic TEXT := '';
BEGIN
  FOR cible IN
    SELECT * FROM (VALUES
      ('dons',                    'montant',                 'positif'),
      ('cotisations',             'montant',                 'positif'),
      ('depenses',                'montant',                 'positif'),
      ('paiements_salaires',      'montant_verse',           'positif'),
      ('cotisations_madrasa',     'montant',                 'positif'),
      ('distributions_sociales',  'montant_verse',           'positif'),
      ('personnel',               'salaire_base',            'non_negatif'),
      ('familles_necessiteuses',  'ressources_mensuelles',   'non_negatif'),
      ('familles_necessiteuses',  'montant_recommande_aide', 'non_negatif'),
      ('projet_config',           'budget_previsionnel',     'non_negatif')
    ) AS t(table_nom, colonne, genre)
  LOOP
    -- La colonne peut déjà avoir été convertie lors d'une exécution précédente.
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = cible.table_nom
         AND column_name = cible.colonne
    );

    borne_min := CASE WHEN cible.genre = 'positif' THEN 0.01 ELSE 0.00 END;

    EXECUTE format(
      'SELECT COUNT(*) FROM %I WHERE %I IS NOT NULL AND (%I < %L OR %I > 9999999999.99)',
      cible.table_nom, cible.colonne, cible.colonne, borne_min, cible.colonne
    ) INTO n_fautives;

    IF n_fautives > 0 THEN
      diagnostic := diagnostic || format(
        E'\n  • %s.%s : %s ligne(s) hors du domaine %s (attendu entre %s et 9999999999.99)',
        cible.table_nom, cible.colonne, n_fautives, cible.genre, borne_min
      );
    END IF;
  END LOOP;

  IF diagnostic <> '' THEN
    RAISE EXCEPTION
      E'Migration 014 interrompue : des montants existants sont hors bornes.%s\n\nCorrigez ou annulez ces lignes explicitement avant de rejouer la migration.',
      diagnostic;
  END IF;
END $$;

-- ─── 3. Conversion des colonnes ─────────────────────────────────────────────
-- `ALTER … TYPE` est rejoué sans effet si la colonne porte déjà le domaine.

DO $$
DECLARE
  cible RECORD;
  type_actuel TEXT;
  domaine TEXT;
BEGIN
  FOR cible IN
    SELECT * FROM (VALUES
      ('dons',                    'montant',                 'montant_eur_positif'),
      ('cotisations',             'montant',                 'montant_eur_positif'),
      ('depenses',                'montant',                 'montant_eur_positif'),
      ('paiements_salaires',      'montant_verse',           'montant_eur_positif'),
      ('cotisations_madrasa',     'montant',                 'montant_eur_positif'),
      ('distributions_sociales',  'montant_verse',           'montant_eur_positif'),
      ('personnel',               'salaire_base',            'montant_eur_non_negatif'),
      ('familles_necessiteuses',  'ressources_mensuelles',   'montant_eur_non_negatif'),
      ('familles_necessiteuses',  'montant_recommande_aide', 'montant_eur_non_negatif'),
      ('projet_config',           'budget_previsionnel',     'montant_eur_non_negatif')
    ) AS t(table_nom, colonne, domaine_cible)
  LOOP
    SELECT domain_name INTO type_actuel
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = cible.table_nom
       AND column_name = cible.colonne;

    CONTINUE WHEN NOT FOUND;
    CONTINUE WHEN type_actuel IS NOT DISTINCT FROM cible.domaine_cible;

    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE %I',
      cible.table_nom, cible.colonne, cible.domaine_cible
    );
  END LOOP;
END $$;

-- ─── 4. Retrait des CHECK devenus redondants ────────────────────────────────
-- Le domaine porte désormais la règle ; deux expressions du même invariant
-- finiraient par diverger.

ALTER TABLE dons                   DROP CONSTRAINT IF EXISTS dons_montant_check;
ALTER TABLE cotisations            DROP CONSTRAINT IF EXISTS cotisations_montant_check;
ALTER TABLE depenses               DROP CONSTRAINT IF EXISTS depenses_montant_check;
ALTER TABLE paiements_salaires     DROP CONSTRAINT IF EXISTS paiements_salaires_montant_verse_check;
ALTER TABLE cotisations_madrasa    DROP CONSTRAINT IF EXISTS cotisations_madrasa_montant_check;
ALTER TABLE distributions_sociales DROP CONSTRAINT IF EXISTS distributions_sociales_montant_verse_check;
ALTER TABLE personnel              DROP CONSTRAINT IF EXISTS personnel_salaire_base_check;
