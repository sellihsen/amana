-- 007_projet.sql
-- Configuration du projet de construction + affectation des caisses

CREATE TABLE IF NOT EXISTS projet_config (
  id                   INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  budget_previsionnel  NUMERIC(12,2) NOT NULL DEFAULT 300000.00,
  capacite_salle_priere INTEGER NOT NULL DEFAULT 3000,
  capacite_etages       INTEGER NOT NULL DEFAULT 4000,
  capacite_totale       INTEGER NOT NULL DEFAULT 7000,
  updated_at           TIMESTAMP DEFAULT NOW()
);

INSERT INTO projet_config (budget_previsionnel, capacite_salle_priere, capacite_etages, capacite_totale)
VALUES (300000.00, 3000, 4000, 7000)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE caisses ADD COLUMN IF NOT EXISTS affectation VARCHAR(20)
  DEFAULT 'Fonctionnement'
  CHECK (affectation IN ('Chantier', 'Fonctionnement'));

UPDATE caisses SET affectation = 'Chantier'
WHERE nom IN ('Dons du Vendredi (Joumouah)', 'Caisse Orphelins', 'Zakat al-Maal')
  AND affectation IS DISTINCT FROM 'Chantier';

UPDATE caisses SET affectation = 'Fonctionnement'
WHERE affectation IS NULL;
