-- ============================================================================
-- 016 — Historique des personnes, périodes canoniques et unicités
--
-- 1. Les cascades destructrices deviennent RESTRICT : désactiver une personne
--    ne doit jamais effacer ses cotisations, paiements ou écolages.
-- 2. `cotisations_madrasa` reçoit une période canonique (1er du mois) à la
--    place d'un mois libre, et son unicité porte sur cette période.
-- 3. Les cotisations annuelles traitent l'absence de mois comme une valeur,
--    afin que deux cotisations annuelles ne puissent pas coexister.
--
-- La migration s'ARRÊTE avec un diagnostic si des doublons ou des périodes
-- ambiguës existent : ces cas demandent une décision humaine.
--
-- Migration idempotente.
-- ============================================================================

-- ─── 1. Période canonique des écolages ──────────────────────────────────────

ALTER TABLE cotisations_madrasa ADD COLUMN IF NOT EXISTS periode DATE;

/**
 * Convertit un mois libre en premier jour de mois.
 * Formats reconnus : « Septembre 2026 », « septembre 2026 », « 2026-09 »,
 * « 2026-09-15 ». Retourne NULL si la valeur est ininterprétable.
 */
CREATE OR REPLACE FUNCTION periode_canonique(valeur TEXT) RETURNS DATE AS $$
DECLARE
  normalise TEXT;
  mois_nom  TEXT;
  annee_txt TEXT;
  indice    INTEGER;
  mois_fr   TEXT[] := ARRAY[
    'janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'
  ];
BEGIN
  IF valeur IS NULL OR btrim(valeur) = '' THEN
    RETURN NULL;
  END IF;

  normalise := lower(btrim(valeur));
  -- Retire les accents des mois français.
  normalise := translate(normalise, 'àâäéèêëîïôöùûüç', 'aaaeeeeiioouuuc');

  -- Format ISO : 2026-09 ou 2026-09-15.
  IF normalise ~ '^\d{4}-\d{2}(-\d{2})?$' THEN
    BEGIN
      RETURN date_trunc('month', (substring(normalise from 1 for 7) || '-01')::DATE)::DATE;
    EXCEPTION WHEN OTHERS THEN
      RETURN NULL;
    END;
  END IF;

  -- Format « mois AAAA ».
  mois_nom  := split_part(normalise, ' ', 1);
  annee_txt := split_part(normalise, ' ', 2);

  IF annee_txt !~ '^\d{4}$' THEN
    RETURN NULL;
  END IF;

  indice := array_position(mois_fr, mois_nom);
  IF indice IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN make_date(annee_txt::INTEGER, indice, 1);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Renseigne la période des lignes existantes.
UPDATE cotisations_madrasa
   SET periode = periode_canonique(mois_concerne)
 WHERE periode IS NULL;

-- Préflight : aucune période ne doit rester indéterminée.
DO $$
DECLARE
  n_ambigues BIGINT;
  exemples   TEXT;
BEGIN
  SELECT COUNT(*), string_agg(DISTINCT mois_concerne, ', ')
    INTO n_ambigues, exemples
    FROM cotisations_madrasa WHERE periode IS NULL;

  IF n_ambigues > 0 THEN
    RAISE EXCEPTION
      E'Migration 016 interrompue : % écolage(s) ont un mois ininterprétable.\n  Valeurs : %\n\nCorrigez ces lignes explicitement avant de rejouer la migration.',
      n_ambigues, exemples;
  END IF;
END $$;

-- Préflight : deux écolages ne peuvent pas viser le même élève et le même mois.
DO $$
DECLARE
  n_doublons BIGINT;
  detail     TEXT;
BEGIN
  SELECT COUNT(*), string_agg(format('élève %s / %s', eleve_id, periode), ', ')
    INTO n_doublons, detail
    FROM (
      SELECT eleve_id, periode
        FROM cotisations_madrasa
       GROUP BY eleve_id, periode
      HAVING COUNT(*) > 1
    ) d;

  IF n_doublons > 0 THEN
    RAISE EXCEPTION
      E'Migration 016 interrompue : % doublon(s) élève/période.\n  %\n\nFusionnez ou annulez ces écolages avant de rejouer la migration.',
      n_doublons, detail;
  END IF;
END $$;

ALTER TABLE cotisations_madrasa ALTER COLUMN periode SET NOT NULL;

-- L'unicité porte désormais sur la période canonique, pas sur le texte libre.
ALTER TABLE cotisations_madrasa DROP CONSTRAINT IF EXISTS cotisations_madrasa_eleve_id_mois_concerne_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_cotisations_madrasa_eleve_periode
  ON cotisations_madrasa (eleve_id, periode);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cotisations_madrasa_periode_debut_mois') THEN
    ALTER TABLE cotisations_madrasa
      ADD CONSTRAINT cotisations_madrasa_periode_debut_mois
      CHECK (periode = date_trunc('month', periode)::DATE);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cotisations_madrasa_periode ON cotisations_madrasa (periode);

-- La période est dérivée du mois libre lorsqu'elle n'est pas fournie : quel que
-- soit le chemin d'écriture (API, script, correction manuelle), l'invariant
-- « une période canonique par écolage » tient.
CREATE OR REPLACE FUNCTION cotisations_madrasa_periode_auto() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.periode IS NULL THEN
    NEW.periode := periode_canonique(NEW.mois_concerne);
  END IF;

  IF NEW.periode IS NULL THEN
    RAISE EXCEPTION
      'Mois « % » ininterprétable : utilisez « Septembre 2026 » ou « 2026-09 ».',
      NEW.mois_concerne
      USING ERRCODE = 'invalid_datetime_format';
  END IF;

  NEW.periode := date_trunc('month', NEW.periode)::DATE;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cotisations_madrasa_periode ON cotisations_madrasa;
CREATE TRIGGER trg_cotisations_madrasa_periode
  BEFORE INSERT OR UPDATE ON cotisations_madrasa
  FOR EACH ROW EXECUTE FUNCTION cotisations_madrasa_periode_auto();

-- ─── 2. Unicité des cotisations annuelles ───────────────────────────────────
-- `UNIQUE(membre_id, annee, mois)` ne protège rien lorsque `mois` est NULL,
-- car NULL n'est jamais égal à NULL. Un index sur COALESCE traite l'absence
-- de mois comme une valeur à part entière.

DO $$
DECLARE
  n_doublons BIGINT;
BEGIN
  SELECT COUNT(*) INTO n_doublons FROM (
    SELECT membre_id, annee, COALESCE(mois, 0) AS mois_normalise
      FROM cotisations
     GROUP BY membre_id, annee, COALESCE(mois, 0)
    HAVING COUNT(*) > 1
  ) d;

  IF n_doublons > 0 THEN
    RAISE EXCEPTION
      E'Migration 016 interrompue : % doublon(s) membre/année/mois dans les cotisations.\n\nFusionnez ou annulez ces cotisations avant de rejouer la migration.',
      n_doublons;
  END IF;
END $$;

ALTER TABLE cotisations DROP CONSTRAINT IF EXISTS cotisations_membre_id_annee_mois_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_cotisations_membre_annee_mois
  ON cotisations (membre_id, annee, COALESCE(mois, 0));

-- ─── 3. Relations historiques protégées ─────────────────────────────────────
-- La suppression d'une personne ne doit jamais emporter ses opérations.

DO $$
DECLARE
  lien RECORD;
BEGIN
  FOR lien IN
    SELECT * FROM (VALUES
      ('cotisations',            'cotisations_membre_id_fkey',            'membre_id',         'membres'),
      ('paiements_salaires',     'paiements_salaires_personnel_id_fkey',  'personnel_id',      'personnel'),
      ('cotisations_madrasa',    'cotisations_madrasa_eleve_id_fkey',     'eleve_id',          'eleves'),
      ('distributions_sociales', 'distributions_sociales_famille_id_fkey','famille_id',        'familles_necessiteuses')
    ) AS t(table_nom, contrainte, colonne, table_cible)
  LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', lien.table_nom, lien.contrainte);
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE RESTRICT',
      lien.table_nom, lien.contrainte, lien.colonne, lien.table_cible
    );
  END LOOP;
END $$;

-- Un don rattaché à un membre ne doit pas perdre silencieusement son auteur.
ALTER TABLE dons DROP CONSTRAINT IF EXISTS dons_membre_id_fkey;
ALTER TABLE dons
  ADD CONSTRAINT dons_membre_id_fkey
  FOREIGN KEY (membre_id) REFERENCES membres(id) ON DELETE RESTRICT;

-- La caisse d'une distribution ne peut plus devenir NULL.
ALTER TABLE distributions_sociales DROP CONSTRAINT IF EXISTS distributions_sociales_caisse_origine_id_fkey;
ALTER TABLE distributions_sociales
  ADD CONSTRAINT distributions_sociales_caisse_origine_id_fkey
  FOREIGN KEY (caisse_origine_id) REFERENCES caisses(id) ON DELETE RESTRICT;

ALTER TABLE dons DROP CONSTRAINT IF EXISTS dons_caisse_id_fkey;
ALTER TABLE dons
  ADD CONSTRAINT dons_caisse_id_fkey
  FOREIGN KEY (caisse_id) REFERENCES caisses(id) ON DELETE RESTRICT;

-- ─── 4. Index de recherche ──────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_membres_nom       ON membres (LOWER(nom));
CREATE INDEX IF NOT EXISTS idx_membres_statut    ON membres (statut);
CREATE INDEX IF NOT EXISTS idx_personnel_nom     ON personnel (LOWER(nom));
CREATE INDEX IF NOT EXISTS idx_eleves_nom        ON eleves (LOWER(nom));
