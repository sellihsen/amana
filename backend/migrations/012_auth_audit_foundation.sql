-- ============================================================================
-- 012 — Socle authentification et audit
--
-- 1. Cycle de vie des comptes : statut, version d'authentification, désactivation.
-- 2. Catalogue stable des types d'événement d'audit.
-- 3. Journal `logs_activite` structuré et append-only.
--
-- Migration idempotente : chaque objet est créé sous garde et chaque exécution
-- converge vers le même état.
-- ============================================================================

-- ─── 1. Utilisateurs ────────────────────────────────────────────────────────

ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS statut        VARCHAR(20) NOT NULL DEFAULT 'actif';
ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS auth_version  INTEGER     NOT NULL DEFAULT 1;
ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS desactive_at  TIMESTAMPTZ;
ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS desactive_par INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'utilisateurs_statut_check') THEN
    ALTER TABLE utilisateurs
      ADD CONSTRAINT utilisateurs_statut_check CHECK (statut IN ('actif', 'inactif'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'utilisateurs_auth_version_check') THEN
    ALTER TABLE utilisateurs
      ADD CONSTRAINT utilisateurs_auth_version_check CHECK (auth_version >= 1);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'utilisateurs_desactive_par_fkey') THEN
    ALTER TABLE utilisateurs
      ADD CONSTRAINT utilisateurs_desactive_par_fkey
      FOREIGN KEY (desactive_par) REFERENCES utilisateurs(id) ON DELETE SET NULL;
  END IF;
END $$;

-- L'email est unique sans distinction de casse.
CREATE UNIQUE INDEX IF NOT EXISTS idx_utilisateurs_email_lower ON utilisateurs (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_utilisateurs_statut ON utilisateurs (statut);

-- ─── 2. Catalogue des types d'événement ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS types_evenement_audit (
  code        TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT types_evenement_audit_code_format
    CHECK (code ~ '^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+$')
);

INSERT INTO types_evenement_audit (code, description) VALUES
  -- Authentification et session
  ('auth.login.succeeded',        'Connexion réussie'),
  ('auth.login.failed',           'Tentative de connexion refusée'),
  ('auth.logout',                 'Déconnexion'),
  ('auth.session.rejected',       'Session refusée (expirée, révoquée ou compte inactif)'),
  -- Comptes utilisateurs
  ('user.created',                'Création d''un compte utilisateur'),
  ('user.updated',                'Modification d''un compte utilisateur'),
  ('user.deleted',                'Suppression d''un compte utilisateur'),
  ('user.role.changed',           'Changement de rôle d''un utilisateur'),
  ('user.status.changed',         'Activation ou désactivation d''un utilisateur'),
  ('user.password.changed',       'Changement de mot de passe'),
  -- Membres
  ('member.created',              'Création d''un membre'),
  ('member.updated',              'Modification d''un membre'),
  ('member.deleted',              'Suppression d''un membre'),
  -- Personnel
  ('personnel.created',           'Création d''une fiche personnel'),
  ('personnel.updated',           'Modification d''une fiche personnel'),
  ('personnel.deleted',           'Suppression d''une fiche personnel'),
  ('salary-payment.posted',       'Enregistrement d''un paiement de salaire'),
  -- Madrasa
  ('student.created',             'Inscription d''un élève'),
  ('student.updated',             'Modification d''un élève'),
  ('student.deleted',             'Suppression d''un élève'),
  ('tuition.recorded',            'Enregistrement d''un écolage'),
  ('tuition.updated',             'Modification d''un écolage non comptabilisé'),
  ('tuition.deleted',             'Suppression d''un écolage non comptabilisé'),
  -- Flux financiers généraux
  ('don.posted',                  'Enregistrement d''un don'),
  ('membership-fee.recorded',     'Enregistrement d''une cotisation de membre'),
  ('membership-fee.updated',      'Modification d''une cotisation non comptabilisée'),
  ('membership-fee.deleted',      'Suppression d''une cotisation non comptabilisée'),
  ('expense.posted',              'Enregistrement d''une dépense'),
  ('financial-entry.reversed',    'Création d''une contre-écriture'),
  -- Social
  ('social-family.created',       'Création d''une famille bénéficiaire'),
  ('social-family.updated',       'Modification d''une famille bénéficiaire'),
  ('social-family.deleted',       'Suppression d''une famille bénéficiaire'),
  ('social-distribution.posted',  'Enregistrement d''une distribution sociale'),
  -- Stock
  ('stock.product.created',       'Création d''un produit en stock'),
  ('stock.product.updated',       'Modification d''un produit en stock'),
  ('stock.product.deleted',       'Suppression d''un produit en stock'),
  ('stock.changed',               'Variation de quantité en stock'),
  -- Référentiels et administration
  ('caisse.created',              'Création d''une caisse'),
  ('caisse.updated',              'Modification d''une caisse'),
  ('caisse.deleted',              'Suppression d''une caisse'),
  ('config.reference.created',    'Création d''une référence configurable'),
  ('config.reference.updated',    'Modification d''une référence configurable'),
  ('config.reference.deleted',    'Suppression d''une référence configurable'),
  ('project.updated',             'Modification de la configuration du projet'),
  -- Historique
  ('legacy.activity',             'Entrée de journal antérieure au catalogue')
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;

-- ─── 3. Journal d'audit structuré ───────────────────────────────────────────

ALTER TABLE logs_activite ADD COLUMN IF NOT EXISTS type_evenement TEXT;
ALTER TABLE logs_activite ADD COLUMN IF NOT EXISTS resultat       TEXT;
ALTER TABLE logs_activite ADD COLUMN IF NOT EXISTS acteur_type    TEXT;
ALTER TABLE logs_activite ADD COLUMN IF NOT EXISTS acteur_role    TEXT;
ALTER TABLE logs_activite ADD COLUMN IF NOT EXISTS entite_type    TEXT;
ALTER TABLE logs_activite ADD COLUMN IF NOT EXISTS entite_id      TEXT;
ALTER TABLE logs_activite ADD COLUMN IF NOT EXISTS avant          JSONB;
ALTER TABLE logs_activite ADD COLUMN IF NOT EXISTS apres          JSONB;
ALTER TABLE logs_activite ADD COLUMN IF NOT EXISTS request_id     UUID;
ALTER TABLE logs_activite ADD COLUMN IF NOT EXISTS user_agent     TEXT;

-- Reprise des lignes historiques : elles conservent leur `action` libre et
-- reçoivent le type réservé `legacy.activity`.
UPDATE logs_activite
   SET type_evenement = 'legacy.activity'
 WHERE type_evenement IS NULL;

UPDATE logs_activite
   SET resultat = 'SUCCES'
 WHERE resultat IS NULL;

UPDATE logs_activite
   SET acteur_type = CASE WHEN utilisateur_id IS NOT NULL THEN 'UTILISATEUR' ELSE 'SYSTEME' END
 WHERE acteur_type IS NULL;

-- `action` n'est plus obligatoire : les nouvelles lignes portent un type stable.
ALTER TABLE logs_activite ALTER COLUMN action DROP NOT NULL;

ALTER TABLE logs_activite ALTER COLUMN type_evenement SET NOT NULL;
ALTER TABLE logs_activite ALTER COLUMN resultat       SET NOT NULL;
ALTER TABLE logs_activite ALTER COLUMN acteur_type    SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'logs_activite_type_evenement_fkey') THEN
    ALTER TABLE logs_activite
      ADD CONSTRAINT logs_activite_type_evenement_fkey
      FOREIGN KEY (type_evenement) REFERENCES types_evenement_audit(code) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'logs_activite_resultat_check') THEN
    ALTER TABLE logs_activite
      ADD CONSTRAINT logs_activite_resultat_check
      CHECK (resultat IN ('SUCCES', 'REFUS', 'ECHEC'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'logs_activite_acteur_type_check') THEN
    ALTER TABLE logs_activite
      ADD CONSTRAINT logs_activite_acteur_type_check
      CHECK (acteur_type IN ('UTILISATEUR', 'SYSTEME', 'MIGRATION'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'logs_activite_acteur_role_check') THEN
    ALTER TABLE logs_activite
      ADD CONSTRAINT logs_activite_acteur_role_check
      CHECK (acteur_role IS NULL OR acteur_role IN ('admin', 'tresorier', 'lecteur'));
  END IF;
END $$;

-- L'utilisateur référencé n'est jamais effacé du journal : la FK devient
-- RESTRICT afin qu'un compte porteur d'historique soit désactivé, pas supprimé.
ALTER TABLE logs_activite DROP CONSTRAINT IF EXISTS logs_activite_utilisateur_id_fkey;
ALTER TABLE logs_activite
  ADD CONSTRAINT logs_activite_utilisateur_id_fkey
  FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_logs_type_evenement ON logs_activite (type_evenement);
CREATE INDEX IF NOT EXISTS idx_logs_entite         ON logs_activite (entite_type, entite_id);
CREATE INDEX IF NOT EXISTS idx_logs_resultat       ON logs_activite (resultat);
CREATE INDEX IF NOT EXISTS idx_logs_request        ON logs_activite (request_id);

-- ─── 4. Journal append-only ─────────────────────────────────────────────────
-- Constitution II : « Audit records are append-only. No code path may UPDATE or
-- DELETE them. » La garantie est posée en base, hors de portée du code applicatif.

CREATE OR REPLACE FUNCTION logs_activite_append_only() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'Le journal d''audit est append-only : % interdit sur logs_activite.', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_logs_activite_no_update ON logs_activite;
CREATE TRIGGER trg_logs_activite_no_update
  BEFORE UPDATE ON logs_activite
  FOR EACH ROW EXECUTE FUNCTION logs_activite_append_only();

DROP TRIGGER IF EXISTS trg_logs_activite_no_delete ON logs_activite;
CREATE TRIGGER trg_logs_activite_no_delete
  BEFORE DELETE ON logs_activite
  FOR EACH ROW EXECUTE FUNCTION logs_activite_append_only();

-- Le catalogue lui-même ne perd jamais un code déjà référencé.
CREATE OR REPLACE FUNCTION types_evenement_audit_no_delete() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'Un type d''événement d''audit ne peut pas être supprimé : %', OLD.code
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_types_evenement_no_delete ON types_evenement_audit;
CREATE TRIGGER trg_types_evenement_no_delete
  BEFORE DELETE ON types_evenement_audit
  FOR EACH ROW EXECUTE FUNCTION types_evenement_audit_no_delete();
