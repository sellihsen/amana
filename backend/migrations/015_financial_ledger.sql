-- ============================================================================
-- 015 — Grand livre financier
--
-- Le grand livre est l'AUTORITÉ des totaux. Les tables métier conservent le
-- détail fonctionnel ; elles ne portent plus la vérité comptable.
--
-- Invariants (data-model.md) :
--   • une source ordinaire possède au plus une écriture;
--   • une écriture ordinaire possède au plus une contre-écriture;
--   • aucune ligne du grand livre n'est modifiable ni supprimable;
--   • une source comptabilisée devient immuable et non supprimable;
--   • les totaux GENERAL ignorent SOCIAL, et réciproquement.
--
-- Migration idempotente.
-- ============================================================================

-- ─── 1. Table ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ecritures_financieres (
  id                 BIGSERIAL PRIMARY KEY,
  type_ecriture      TEXT NOT NULL,
  perimetre          TEXT NOT NULL,
  sens               TEXT NOT NULL,
  montant            montant_eur_positif NOT NULL,
  devise             CHAR(3) NOT NULL DEFAULT 'EUR',
  date_effet         DATE NOT NULL,
  source_type        TEXT NOT NULL,
  source_id          BIGINT,
  caisse_id          INTEGER REFERENCES caisses(id) ON DELETE RESTRICT,
  cree_par           INTEGER REFERENCES utilisateurs(id) ON DELETE RESTRICT,
  acteur_nom         TEXT NOT NULL DEFAULT 'Système',
  acteur_role        TEXT,
  contre_ecriture_de BIGINT REFERENCES ecritures_financieres(id) ON DELETE RESTRICT,
  motif              TEXT,
  idempotency_id     BIGINT REFERENCES demandes_idempotentes(id) ON DELETE RESTRICT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT ecritures_type_check CHECK (type_ecriture IN (
    'DON', 'COTISATION_MEMBRE', 'ECOLAGE', 'DEPENSE',
    'PAIEMENT_SALAIRE', 'DISTRIBUTION_SOCIALE', 'CONTRE_ECRITURE'
  )),
  CONSTRAINT ecritures_perimetre_check CHECK (perimetre IN ('GENERAL', 'SOCIAL')),
  CONSTRAINT ecritures_sens_check      CHECK (sens IN ('CREDIT', 'DEBIT')),
  CONSTRAINT ecritures_devise_check    CHECK (devise = 'EUR'),
  CONSTRAINT ecritures_acteur_role_check
    CHECK (acteur_role IS NULL OR acteur_role IN ('admin', 'tresorier', 'lecteur')),

  -- Une caisse est obligatoire là où l'argent est physiquement rattaché.
  CONSTRAINT ecritures_caisse_requise CHECK (
    caisse_id IS NOT NULL
    OR type_ecriture NOT IN ('DON', 'DISTRIBUTION_SOCIALE')
  ),

  -- Une contre-écriture exige un motif ; une écriture ordinaire n'en a pas.
  CONSTRAINT ecritures_motif_contre_ecriture CHECK (
    (contre_ecriture_de IS NULL AND type_ecriture <> 'CONTRE_ECRITURE')
    OR (contre_ecriture_de IS NOT NULL
        AND type_ecriture = 'CONTRE_ECRITURE'
        AND motif IS NOT NULL
        AND char_length(btrim(motif)) > 0)
  )
);

-- Une écriture ordinaire par source.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ecritures_source_unique
  ON ecritures_financieres (source_type, source_id)
  WHERE contre_ecriture_de IS NULL AND source_id IS NOT NULL;

-- Une seule contre-écriture par écriture d'origine.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ecritures_contrepassee_unique
  ON ecritures_financieres (contre_ecriture_de)
  WHERE contre_ecriture_de IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ecritures_idempotency
  ON ecritures_financieres (idempotency_id)
  WHERE idempotency_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ecritures_perimetre_date ON ecritures_financieres (perimetre, date_effet);
CREATE INDEX IF NOT EXISTS idx_ecritures_caisse         ON ecritures_financieres (caisse_id);
CREATE INDEX IF NOT EXISTS idx_ecritures_type           ON ecritures_financieres (type_ecriture);
CREATE INDEX IF NOT EXISTS idx_ecritures_cree_par       ON ecritures_financieres (cree_par);
CREATE INDEX IF NOT EXISTS idx_ecritures_date_effet     ON ecritures_financieres (date_effet DESC);

-- ─── 2. Une contre-écriture ne vise jamais une contre-écriture ──────────────

CREATE OR REPLACE FUNCTION ecritures_verifier_contre_ecriture() RETURNS TRIGGER AS $$
DECLARE
  origine ecritures_financieres%ROWTYPE;
BEGIN
  IF NEW.contre_ecriture_de IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO origine FROM ecritures_financieres WHERE id = NEW.contre_ecriture_de;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Écriture d''origine introuvable : %', NEW.contre_ecriture_de
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF origine.contre_ecriture_de IS NOT NULL THEN
    RAISE EXCEPTION 'Une contre-écriture ne peut pas être contrepassée.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  -- La contre-écriture reprend montant, devise, périmètre et caisse de
  -- l'original, et inverse le sens.
  IF NEW.montant <> origine.montant
     OR NEW.devise <> origine.devise
     OR NEW.perimetre <> origine.perimetre
     OR NEW.caisse_id IS DISTINCT FROM origine.caisse_id THEN
    RAISE EXCEPTION
      'Une contre-écriture doit reprendre montant, devise, périmètre et caisse de son origine.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.sens = origine.sens THEN
    RAISE EXCEPTION 'Une contre-écriture doit inverser le sens de son origine.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ecritures_contre_ecriture ON ecritures_financieres;
CREATE TRIGGER trg_ecritures_contre_ecriture
  BEFORE INSERT ON ecritures_financieres
  FOR EACH ROW EXECUTE FUNCTION ecritures_verifier_contre_ecriture();

-- ─── 3. Grand livre append-only ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ecritures_append_only() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'Le grand livre est append-only : % interdit. Utilisez une contre-écriture.', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ecritures_no_update ON ecritures_financieres;
CREATE TRIGGER trg_ecritures_no_update
  BEFORE UPDATE ON ecritures_financieres
  FOR EACH ROW EXECUTE FUNCTION ecritures_append_only();

DROP TRIGGER IF EXISTS trg_ecritures_no_delete ON ecritures_financieres;
CREATE TRIGGER trg_ecritures_no_delete
  BEFORE DELETE ON ecritures_financieres
  FOR EACH ROW EXECUTE FUNCTION ecritures_append_only();

-- ─── 4. Liens depuis les sources ────────────────────────────────────────────

ALTER TABLE dons                   ADD COLUMN IF NOT EXISTS ecriture_id BIGINT;
ALTER TABLE cotisations            ADD COLUMN IF NOT EXISTS ecriture_id BIGINT;
ALTER TABLE depenses               ADD COLUMN IF NOT EXISTS ecriture_id BIGINT;
ALTER TABLE paiements_salaires     ADD COLUMN IF NOT EXISTS ecriture_id BIGINT;
ALTER TABLE cotisations_madrasa    ADD COLUMN IF NOT EXISTS ecriture_id BIGINT;
ALTER TABLE distributions_sociales ADD COLUMN IF NOT EXISTS ecriture_id BIGINT;

-- Traçabilité de l'auteur là où elle manquait.
ALTER TABLE dons                   ADD COLUMN IF NOT EXISTS cree_par INTEGER;
ALTER TABLE cotisations            ADD COLUMN IF NOT EXISTS cree_par INTEGER;
ALTER TABLE cotisations_madrasa    ADD COLUMN IF NOT EXISTS cree_par INTEGER;
ALTER TABLE distributions_sociales ADD COLUMN IF NOT EXISTS cree_par INTEGER;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'dons', 'cotisations', 'depenses', 'paiements_salaires',
    'cotisations_madrasa', 'distributions_sociales'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = t || '_ecriture_id_fkey'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (ecriture_id)
           REFERENCES ecritures_financieres(id) ON DELETE RESTRICT',
        t, t || '_ecriture_id_fkey'
      );
    END IF;

    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I (ecriture_id) WHERE ecriture_id IS NOT NULL',
      'idx_' || t || '_ecriture_unique', t
    );
  END LOOP;

  FOREACH t IN ARRAY ARRAY['dons', 'cotisations', 'cotisations_madrasa', 'distributions_sociales'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = t || '_cree_par_fkey'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (cree_par)
           REFERENCES utilisateurs(id) ON DELETE RESTRICT',
        t, t || '_cree_par_fkey'
      );
    END IF;
  END LOOP;
END $$;

-- ─── 5. Reprise de l'historique ─────────────────────────────────────────────
-- Chaque ligne métier existante reçoit son écriture. Le périmètre est déduit de
-- l'affectation actuelle de la caisse ; l'acteur historique est inconnu, donc
-- « Système ».

-- 5.1 Dons
INSERT INTO ecritures_financieres
  (type_ecriture, perimetre, sens, montant, date_effet, source_type, source_id,
   caisse_id, cree_par, acteur_nom, created_at)
SELECT
  'DON',
  CASE WHEN c.affectation = 'Social' THEN 'SOCIAL' ELSE 'GENERAL' END,
  'CREDIT',
  d.montant,
  COALESCE(d.date_don, CURRENT_DATE),
  'don',
  d.id,
  d.caisse_id,
  d.cree_par,
  'Système',
  COALESCE(d.created_at, NOW())
FROM dons d
JOIN caisses c ON c.id = d.caisse_id
WHERE d.ecriture_id IS NULL
  AND d.caisse_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM ecritures_financieres e
     WHERE e.source_type = 'don' AND e.source_id = d.id AND e.contre_ecriture_de IS NULL
  );

UPDATE dons d SET ecriture_id = e.id
  FROM ecritures_financieres e
 WHERE e.source_type = 'don' AND e.source_id = d.id AND e.contre_ecriture_de IS NULL
   AND d.ecriture_id IS NULL;

-- 5.2 Cotisations de membres payées
INSERT INTO ecritures_financieres
  (type_ecriture, perimetre, sens, montant, date_effet, source_type, source_id,
   cree_par, acteur_nom, created_at)
SELECT
  'COTISATION_MEMBRE', 'GENERAL', 'CREDIT', c.montant,
  COALESCE(c.date_paiement, CURRENT_DATE), 'cotisation', c.id, c.cree_par, 'Système',
  COALESCE(c.created_at, NOW())
FROM cotisations c
WHERE c.ecriture_id IS NULL
  AND c.statut = 'payee'
  AND NOT EXISTS (
    SELECT 1 FROM ecritures_financieres e
     WHERE e.source_type = 'cotisation' AND e.source_id = c.id AND e.contre_ecriture_de IS NULL
  );

UPDATE cotisations c SET ecriture_id = e.id
  FROM ecritures_financieres e
 WHERE e.source_type = 'cotisation' AND e.source_id = c.id AND e.contre_ecriture_de IS NULL
   AND c.ecriture_id IS NULL;

-- 5.3 Dépenses
INSERT INTO ecritures_financieres
  (type_ecriture, perimetre, sens, montant, date_effet, source_type, source_id,
   cree_par, acteur_nom, created_at)
SELECT
  'DEPENSE', 'GENERAL', 'DEBIT', d.montant,
  COALESCE(d.date_depense, CURRENT_DATE), 'depense', d.id, d.cree_par, 'Système',
  COALESCE(d.created_at, NOW())
FROM depenses d
WHERE d.ecriture_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM ecritures_financieres e
     WHERE e.source_type = 'depense' AND e.source_id = d.id AND e.contre_ecriture_de IS NULL
  );

UPDATE depenses d SET ecriture_id = e.id
  FROM ecritures_financieres e
 WHERE e.source_type = 'depense' AND e.source_id = d.id AND e.contre_ecriture_de IS NULL
   AND d.ecriture_id IS NULL;

-- 5.4 Paiements de salaires
INSERT INTO ecritures_financieres
  (type_ecriture, perimetre, sens, montant, date_effet, source_type, source_id,
   cree_par, acteur_nom, created_at)
SELECT
  'PAIEMENT_SALAIRE', 'GENERAL', 'DEBIT', p.montant_verse,
  COALESCE(p.date_versement, CURRENT_DATE), 'paiement_salaire', p.id, p.cree_par, 'Système',
  COALESCE(p.created_at, NOW())
FROM paiements_salaires p
WHERE p.ecriture_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM ecritures_financieres e
     WHERE e.source_type = 'paiement_salaire' AND e.source_id = p.id AND e.contre_ecriture_de IS NULL
  );

UPDATE paiements_salaires p SET ecriture_id = e.id
  FROM ecritures_financieres e
 WHERE e.source_type = 'paiement_salaire' AND e.source_id = p.id AND e.contre_ecriture_de IS NULL
   AND p.ecriture_id IS NULL;

-- 5.5 Écolages payés
INSERT INTO ecritures_financieres
  (type_ecriture, perimetre, sens, montant, date_effet, source_type, source_id,
   cree_par, acteur_nom, created_at)
SELECT
  'ECOLAGE', 'GENERAL', 'CREDIT', cm.montant,
  COALESCE(cm.date_paiement, CURRENT_DATE), 'cotisation_madrasa', cm.id, cm.cree_par, 'Système',
  COALESCE(cm.created_at, NOW())
FROM cotisations_madrasa cm
WHERE cm.ecriture_id IS NULL
  AND cm.statut_paiement = 'payé'
  AND NOT EXISTS (
    SELECT 1 FROM ecritures_financieres e
     WHERE e.source_type = 'cotisation_madrasa' AND e.source_id = cm.id AND e.contre_ecriture_de IS NULL
  );

UPDATE cotisations_madrasa cm SET ecriture_id = e.id
  FROM ecritures_financieres e
 WHERE e.source_type = 'cotisation_madrasa' AND e.source_id = cm.id AND e.contre_ecriture_de IS NULL
   AND cm.ecriture_id IS NULL;

-- 5.6 Distributions sociales
INSERT INTO ecritures_financieres
  (type_ecriture, perimetre, sens, montant, date_effet, source_type, source_id,
   caisse_id, cree_par, acteur_nom, created_at)
SELECT
  'DISTRIBUTION_SOCIALE', 'SOCIAL', 'DEBIT', ds.montant_verse,
  COALESCE(ds.date_versement, CURRENT_DATE), 'distribution_sociale', ds.id,
  ds.caisse_origine_id, ds.cree_par, 'Système',
  COALESCE(ds.created_at, NOW())
FROM distributions_sociales ds
WHERE ds.ecriture_id IS NULL
  AND ds.caisse_origine_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM ecritures_financieres e
     WHERE e.source_type = 'distribution_sociale' AND e.source_id = ds.id AND e.contre_ecriture_de IS NULL
  );

UPDATE distributions_sociales ds SET ecriture_id = e.id
  FROM ecritures_financieres e
 WHERE e.source_type = 'distribution_sociale' AND e.source_id = ds.id AND e.contre_ecriture_de IS NULL
   AND ds.ecriture_id IS NULL;

-- ─── 6. Immutabilité des sources comptabilisées ─────────────────────────────
-- Une ligne rattachée au grand livre ne peut plus changer de montant, de date,
-- de caisse ni de bénéficiaire, et ne peut plus être supprimée. La correction
-- passe exclusivement par une contre-écriture.

CREATE OR REPLACE FUNCTION source_comptabilisee_immuable() RETURNS TRIGGER AS $$
DECLARE
  champs TEXT[] := TG_ARGV;
  champ  TEXT;
  ancien TEXT;
  nouveau TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.ecriture_id IS NOT NULL THEN
      RAISE EXCEPTION
        'Cette opération est comptabilisée et ne peut pas être supprimée : créez une contre-écriture.'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;

  -- Le rattachement initial au grand livre est autorisé.
  IF OLD.ecriture_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.ecriture_id IS DISTINCT FROM OLD.ecriture_id THEN
    RAISE EXCEPTION 'Le rattachement comptable d''une opération ne peut pas être modifié.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  FOREACH champ IN ARRAY champs LOOP
    EXECUTE format('SELECT ($1).%I::TEXT', champ) INTO ancien USING OLD;
    EXECUTE format('SELECT ($1).%I::TEXT', champ) INTO nouveau USING NEW;
    IF ancien IS DISTINCT FROM nouveau THEN
      RAISE EXCEPTION
        'Cette opération est comptabilisée : « % » ne peut plus être modifié. Créez une contre-écriture.',
        champ
        USING ERRCODE = 'restrict_violation';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_dons_immuable ON dons;
CREATE TRIGGER trg_dons_immuable
  BEFORE UPDATE OR DELETE ON dons
  FOR EACH ROW EXECUTE FUNCTION source_comptabilisee_immuable('montant', 'caisse_id', 'date_don', 'membre_id');

DROP TRIGGER IF EXISTS trg_cotisations_immuable ON cotisations;
CREATE TRIGGER trg_cotisations_immuable
  BEFORE UPDATE OR DELETE ON cotisations
  FOR EACH ROW EXECUTE FUNCTION source_comptabilisee_immuable('montant', 'membre_id', 'annee', 'mois', 'statut', 'date_paiement');

DROP TRIGGER IF EXISTS trg_depenses_immuable ON depenses;
CREATE TRIGGER trg_depenses_immuable
  BEFORE UPDATE OR DELETE ON depenses
  FOR EACH ROW EXECUTE FUNCTION source_comptabilisee_immuable('montant', 'date_depense');

DROP TRIGGER IF EXISTS trg_paiements_salaires_immuable ON paiements_salaires;
CREATE TRIGGER trg_paiements_salaires_immuable
  BEFORE UPDATE OR DELETE ON paiements_salaires
  FOR EACH ROW EXECUTE FUNCTION source_comptabilisee_immuable('montant_verse', 'personnel_id', 'date_versement');

DROP TRIGGER IF EXISTS trg_cotisations_madrasa_immuable ON cotisations_madrasa;
CREATE TRIGGER trg_cotisations_madrasa_immuable
  BEFORE UPDATE OR DELETE ON cotisations_madrasa
  FOR EACH ROW EXECUTE FUNCTION source_comptabilisee_immuable('montant', 'eleve_id', 'statut_paiement', 'date_paiement');

DROP TRIGGER IF EXISTS trg_distributions_sociales_immuable ON distributions_sociales;
CREATE TRIGGER trg_distributions_sociales_immuable
  BEFORE UPDATE OR DELETE ON distributions_sociales
  FOR EACH ROW EXECUTE FUNCTION source_comptabilisee_immuable('montant_verse', 'famille_id', 'caisse_origine_id', 'date_versement');
