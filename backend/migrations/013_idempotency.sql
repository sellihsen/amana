-- ============================================================================
-- 013 — Déduplication des mutations sensibles
--
-- Une demande est identifiée par (acteur, opération, clé). Rejouer la même clé
-- avec la même empreinte retourne le résultat initial ; la rejouer avec une
-- empreinte différente est un conflit.
--
-- Migration idempotente.
-- ============================================================================

CREATE TABLE IF NOT EXISTS demandes_idempotentes (
  id                BIGSERIAL PRIMARY KEY,
  utilisateur_id    INTEGER     NOT NULL REFERENCES utilisateurs(id) ON DELETE RESTRICT,
  operation         TEXT        NOT NULL,
  cle               TEXT        NOT NULL,
  empreinte_requete TEXT        NOT NULL,
  statut            TEXT        NOT NULL DEFAULT 'EN_COURS',
  http_status       INTEGER,
  response_body     JSONB,
  ressource_type    TEXT,
  ressource_id      TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ,

  CONSTRAINT demandes_idempotentes_cle_longueur
    CHECK (char_length(cle) BETWEEN 1 AND 128),
  CONSTRAINT demandes_idempotentes_statut_check
    CHECK (statut IN ('EN_COURS', 'TERMINEE')),
  CONSTRAINT demandes_idempotentes_terminee_complete
    CHECK (
      statut = 'EN_COURS'
      OR (http_status IS NOT NULL AND completed_at IS NOT NULL)
    )
);

-- Unicité de la demande : c'est cette contrainte qui sérialise deux envois
-- concurrents porteurs de la même clé.
CREATE UNIQUE INDEX IF NOT EXISTS idx_demandes_idempotentes_cle
  ON demandes_idempotentes (utilisateur_id, operation, cle);

CREATE INDEX IF NOT EXISTS idx_demandes_idempotentes_ressource
  ON demandes_idempotentes (ressource_type, ressource_id);

CREATE INDEX IF NOT EXISTS idx_demandes_idempotentes_created
  ON demandes_idempotentes (created_at DESC);
