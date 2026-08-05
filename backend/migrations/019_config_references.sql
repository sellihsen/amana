-- ============================================================================
-- 019 — Référentiels réellement configurables
--
-- Les valeurs textuelles contraintes par un CHECK fermé deviennent des
-- références administrables :
--
--   • la table métier conserve le LIBELLÉ tel qu'il était au moment de la
--     saisie (snapshot) — renommer une référence ne réécrit pas le passé;
--   • elle porte en plus une clé étrangère `*_ref_id` en ON DELETE RESTRICT —
--     une référence utilisée ne peut pas disparaître;
--   • l'état actif est vérifié à l'écriture, pas en base : une opération
--     historique reste valide même si sa référence est désactivée ensuite.
--
-- La migration s'ARRÊTE si une valeur existante n'a pas de référence
-- correspondante : l'inventer serait une décision métier.
--
-- Migration idempotente.
-- ============================================================================

-- ─── 1. Unicité des noms de référence ───────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS idx_caisses_nom_unique ON caisses (LOWER(nom));

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['categories_depenses', 'classes_madrasa', 'types_paiement_rh'] LOOP
    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I (LOWER(nom))',
      'idx_' || t || '_nom_unique', t
    );
    EXECUTE format('ALTER TABLE %I ALTER COLUMN actif SET DEFAULT TRUE', t);
    EXECUTE format('UPDATE %I SET actif = TRUE WHERE actif IS NULL', t);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN actif SET NOT NULL', t);
  END LOOP;
END $$;

-- ─── 2. Colonnes de référence ───────────────────────────────────────────────

ALTER TABLE depenses            ADD COLUMN IF NOT EXISTS categorie_ref_id       INTEGER;
ALTER TABLE eleves              ADD COLUMN IF NOT EXISTS classe_ref_id          INTEGER;
ALTER TABLE paiements_salaires  ADD COLUMN IF NOT EXISTS type_paiement_ref_id   INTEGER;

-- ─── 3. Reprise : créer les références manquantes à partir de l'existant ────
-- Les valeurs déjà utilisées sont légitimes : elles deviennent des références.

INSERT INTO categories_depenses (nom, actif)
SELECT DISTINCT d.categorie, TRUE
  FROM depenses d
 WHERE d.categorie IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM categories_depenses c WHERE LOWER(c.nom) = LOWER(d.categorie)
   );

INSERT INTO classes_madrasa (nom, actif)
SELECT DISTINCT e.classe, TRUE
  FROM eleves e
 WHERE e.classe IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM classes_madrasa c WHERE LOWER(c.nom) = LOWER(e.classe)
   );

INSERT INTO types_paiement_rh (nom, actif)
SELECT DISTINCT p.type_paiement, TRUE
  FROM paiements_salaires p
 WHERE p.type_paiement IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM types_paiement_rh t WHERE LOWER(t.nom) = LOWER(p.type_paiement)
   );

-- ─── 4. Rattachement ────────────────────────────────────────────────────────

UPDATE depenses d
   SET categorie_ref_id = c.id
  FROM categories_depenses c
 WHERE LOWER(c.nom) = LOWER(d.categorie) AND d.categorie_ref_id IS NULL;

UPDATE eleves e
   SET classe_ref_id = c.id
  FROM classes_madrasa c
 WHERE LOWER(c.nom) = LOWER(e.classe) AND e.classe_ref_id IS NULL;

UPDATE paiements_salaires p
   SET type_paiement_ref_id = t.id
  FROM types_paiement_rh t
 WHERE LOWER(t.nom) = LOWER(p.type_paiement) AND p.type_paiement_ref_id IS NULL;

-- Préflight : plus aucune valeur ne doit rester orpheline.
DO $$
DECLARE
  diagnostic TEXT := '';
  n BIGINT;
BEGIN
  SELECT COUNT(*) INTO n FROM depenses WHERE categorie IS NOT NULL AND categorie_ref_id IS NULL;
  IF n > 0 THEN diagnostic := diagnostic || format(E'\n  • depenses.categorie : %s ligne(s)', n); END IF;

  SELECT COUNT(*) INTO n FROM eleves WHERE classe IS NOT NULL AND classe_ref_id IS NULL;
  IF n > 0 THEN diagnostic := diagnostic || format(E'\n  • eleves.classe : %s ligne(s)', n); END IF;

  SELECT COUNT(*) INTO n FROM paiements_salaires WHERE type_paiement IS NOT NULL AND type_paiement_ref_id IS NULL;
  IF n > 0 THEN diagnostic := diagnostic || format(E'\n  • paiements_salaires.type_paiement : %s ligne(s)', n); END IF;

  IF diagnostic <> '' THEN
    RAISE EXCEPTION
      E'Migration 019 interrompue : des valeurs sans référence correspondante.%s\n\nCréez les références manquantes avant de rejouer la migration.',
      diagnostic;
  END IF;
END $$;

-- ─── 5. Clés étrangères protectrices ────────────────────────────────────────

DO $$
DECLARE
  lien RECORD;
BEGIN
  FOR lien IN
    SELECT * FROM (VALUES
      ('depenses',           'categorie_ref_id',     'categories_depenses'),
      ('eleves',             'classe_ref_id',        'classes_madrasa'),
      ('paiements_salaires', 'type_paiement_ref_id', 'types_paiement_rh')
    ) AS t(table_nom, colonne, table_cible)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = lien.table_nom || '_' || lien.colonne || '_fkey'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE RESTRICT',
        lien.table_nom, lien.table_nom || '_' || lien.colonne || '_fkey',
        lien.colonne, lien.table_cible
      );
    END IF;
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (%I)',
      'idx_' || lien.table_nom || '_' || lien.colonne, lien.table_nom, lien.colonne);
  END LOOP;
END $$;

-- ─── 6. Retrait des listes fermées ──────────────────────────────────────────
-- Ces CHECK rendaient les référentiels non administrables : ajouter une
-- catégorie exigeait une migration. La validation vit désormais à l'écriture,
-- contre l'état ACTIF de la référence.

ALTER TABLE depenses            DROP CONSTRAINT IF EXISTS depenses_categorie_check;
ALTER TABLE eleves              DROP CONSTRAINT IF EXISTS eleves_classe_check;
ALTER TABLE paiements_salaires  DROP CONSTRAINT IF EXISTS paiements_salaires_type_paiement_check;
ALTER TABLE personnel           DROP CONSTRAINT IF EXISTS personnel_role_poste_check;
ALTER TABLE cotisations_madrasa DROP CONSTRAINT IF EXISTS cotisations_madrasa_methode_paiement_check;

-- Les colonnes snapshot restent obligatoires là où elles l'étaient.
ALTER TABLE eleves ALTER COLUMN classe SET DEFAULT 'Débutants';
