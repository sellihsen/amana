-- ============================================================================
-- 017 — Historique et statut de l'aide sociale
--
-- 1. Une famille bénéficiaire possède un statut : elle est DÉSACTIVÉE lorsque
--    l'aide cesse, jamais supprimée si elle a reçu des distributions.
-- 2. Les distributions sont protégées contre la disparition de leur famille et
--    de leur caisse d'origine (déjà posé en 016, revérifié ici).
--
-- Migration idempotente.
-- ============================================================================

ALTER TABLE familles_necessiteuses
  ADD COLUMN IF NOT EXISTS statut VARCHAR(20) NOT NULL DEFAULT 'actif';

ALTER TABLE familles_necessiteuses
  ADD COLUMN IF NOT EXISTS desactive_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'familles_necessiteuses_statut_check') THEN
    ALTER TABLE familles_necessiteuses
      ADD CONSTRAINT familles_necessiteuses_statut_check
      CHECK (statut IN ('actif', 'inactif'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_familles_statut ON familles_necessiteuses (statut);

-- Les protections historiques : une distribution ne perd jamais sa famille ni
-- sa caisse. (Posées en 016 ; réaffirmées pour que 017 soit autonome.)
ALTER TABLE distributions_sociales
  DROP CONSTRAINT IF EXISTS distributions_sociales_famille_id_fkey;
ALTER TABLE distributions_sociales
  ADD CONSTRAINT distributions_sociales_famille_id_fkey
  FOREIGN KEY (famille_id) REFERENCES familles_necessiteuses(id) ON DELETE RESTRICT;

ALTER TABLE distributions_sociales
  ALTER COLUMN caisse_origine_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_distributions_date
  ON distributions_sociales (date_versement DESC);
