-- ============================================================
-- Migration initiale - Mosquée App
-- ============================================================

-- Extension pour UUID (optionnel)
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table des utilisateurs (admin, trésorier, lecteur)
CREATE TABLE IF NOT EXISTS utilisateurs (
  id            SERIAL PRIMARY KEY,
  nom           VARCHAR(100) NOT NULL,
  email         VARCHAR(150) UNIQUE NOT NULL,
  mot_de_passe_hash TEXT NOT NULL,
  role          VARCHAR(20) NOT NULL DEFAULT 'lecteur' CHECK (role IN ('admin', 'tresorier', 'lecteur')),
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

-- Table des membres de la mosquée
CREATE TABLE IF NOT EXISTS membres (
  id            SERIAL PRIMARY KEY,
  nom           VARCHAR(100) NOT NULL,
  prenom        VARCHAR(100),
  email         VARCHAR(150),
  telephone     VARCHAR(20),
  adresse       TEXT,
  date_adhesion DATE DEFAULT CURRENT_DATE,
  statut        VARCHAR(20) DEFAULT 'actif' CHECK (statut IN ('actif', 'inactif', 'suspendu')),
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

-- Table des dons
CREATE TABLE IF NOT EXISTS dons (
  id            SERIAL PRIMARY KEY,
  membre_id     INTEGER REFERENCES membres(id) ON DELETE SET NULL,
  montant       NUMERIC(10, 2) NOT NULL CHECK (montant > 0),
  type_don      VARCHAR(50) DEFAULT 'general' CHECK (type_don IN ('general', 'zakat', 'sadaqa', 'projet', 'autre')),
  date_don      DATE DEFAULT CURRENT_DATE,
  commentaire   TEXT,
  anonyme       BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMP DEFAULT NOW()
);

-- Table des cotisations annuelles
CREATE TABLE IF NOT EXISTS cotisations (
  id            SERIAL PRIMARY KEY,
  membre_id     INTEGER NOT NULL REFERENCES membres(id) ON DELETE CASCADE,
  montant       NUMERIC(10, 2) NOT NULL CHECK (montant > 0),
  annee         INTEGER NOT NULL,
  mois          INTEGER CHECK (mois BETWEEN 1 AND 12),
  date_paiement DATE DEFAULT CURRENT_DATE,
  statut        VARCHAR(20) DEFAULT 'payee' CHECK (statut IN ('payee', 'en_attente', 'annulee')),
  commentaire   TEXT,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW(),
  UNIQUE(membre_id, annee, mois)
);

-- Table des dépenses
CREATE TABLE IF NOT EXISTS depenses (
  id               SERIAL PRIMARY KEY,
  libelle          VARCHAR(200) NOT NULL,
  montant          NUMERIC(10, 2) NOT NULL CHECK (montant > 0),
  categorie        VARCHAR(100) CHECK (categorie IN ('electricite', 'eau', 'loyer', 'entretien', 'materiel', 'salaire', 'evenement', 'autre')),
  date_depense     DATE DEFAULT CURRENT_DATE,
  justificatif_url TEXT,
  commentaire      TEXT,
  cree_par         INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
  created_at       TIMESTAMP DEFAULT NOW()
);

-- Index pour les performances
CREATE INDEX IF NOT EXISTS idx_dons_membre ON dons(membre_id);
CREATE INDEX IF NOT EXISTS idx_dons_date ON dons(date_don);
CREATE INDEX IF NOT EXISTS idx_cotisations_membre ON cotisations(membre_id);
CREATE INDEX IF NOT EXISTS idx_cotisations_annee ON cotisations(annee);
CREATE INDEX IF NOT EXISTS idx_depenses_date ON depenses(date_depense);
CREATE INDEX IF NOT EXISTS idx_depenses_categorie ON depenses(categorie);
