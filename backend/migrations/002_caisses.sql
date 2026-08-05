-- ============================================================
-- Migration 002 - Caisses dynamiques
-- ============================================================

-- 1. Création de la table des caisses
CREATE TABLE IF NOT EXISTS caisses (
  id          SERIAL PRIMARY KEY,
  nom         VARCHAR(150) NOT NULL,
  description TEXT,
  actif       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);

-- 2. Insertion des 5 caisses par défaut
INSERT INTO caisses (nom, description) VALUES
  ('Dons du Vendredi (Joumouah)', 'Collecte réalisée lors de la prière du vendredi'),
  ('Caisses fixes',               'Contributions régulières à la caisse générale de la mosquée'),
  ('Zakat al-Maal',               'Zakat annuelle sur la fortune (2,5 % des avoirs)'),
  ('Zakat al-Fitr',               'Zakat de fin de Ramadan (aumône purificatrice)'),
  ('Caisse Orphelins',            'Fonds dédié au soutien des orphelins')
ON CONFLICT DO NOTHING;

-- 3. Ajout de la colonne caisse_id dans la table dons
ALTER TABLE dons ADD COLUMN IF NOT EXISTS caisse_id INTEGER REFERENCES caisses(id) ON DELETE SET NULL;

-- 4. Migration des données existantes :
--    on associe les anciens type_don aux nouvelles caisses par correspondance
UPDATE dons SET caisse_id = (SELECT id FROM caisses WHERE nom = 'Zakat al-Maal'   LIMIT 1) WHERE type_don = 'zakat'  AND caisse_id IS NULL;
UPDATE dons SET caisse_id = (SELECT id FROM caisses WHERE nom = 'Caisses fixes'   LIMIT 1) WHERE type_don = 'sadaqa' AND caisse_id IS NULL;
UPDATE dons SET caisse_id = (SELECT id FROM caisses WHERE nom = 'Caisses fixes'   LIMIT 1) WHERE type_don = 'projet' AND caisse_id IS NULL;
-- Pour general et autre → Dons du Vendredi par défaut
UPDATE dons SET caisse_id = (SELECT id FROM caisses WHERE nom LIKE 'Dons du Vendredi%' LIMIT 1)
  WHERE caisse_id IS NULL;

-- 5. Index pour les performances
CREATE INDEX IF NOT EXISTS idx_dons_caisse ON dons(caisse_id);
CREATE INDEX IF NOT EXISTS idx_caisses_actif ON caisses(actif);
