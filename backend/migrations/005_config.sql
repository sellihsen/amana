-- 005_config.sql
-- Tables de configuration dynamique pour l'interface Admin

CREATE TABLE IF NOT EXISTS categories_depenses (
  id    SERIAL PRIMARY KEY,
  nom   VARCHAR(100) NOT NULL UNIQUE,
  actif BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS classes_madrasa (
  id    SERIAL PRIMARY KEY,
  nom   VARCHAR(100) NOT NULL UNIQUE,
  actif BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS types_paiement_rh (
  id    SERIAL PRIMARY KEY,
  nom   VARCHAR(100) NOT NULL UNIQUE,
  actif BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Insérer les valeurs par défaut (correspondent aux données existantes)
INSERT INTO categories_depenses (nom) VALUES
  ('electricite'), ('eau'), ('loyer'), ('entretien'),
  ('materiel'), ('salaire'), ('evenement'), ('autre')
ON CONFLICT (nom) DO NOTHING;

INSERT INTO classes_madrasa (nom) VALUES
  ('Débutants'), ('Niveau 1'), ('Niveau 2'), ('Niveau 3'),
  ('Mémorisation'), ('Tajwid avancé')
ON CONFLICT (nom) DO NOTHING;

INSERT INTO types_paiement_rh (nom) VALUES
  ('Salaire mensuel'), ('Prime de l''Aïd'), ('Indemnité exceptionnelle')
ON CONFLICT (nom) DO NOTHING;
