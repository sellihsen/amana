-- ============================================================
-- Migration 004 - Module École Coranique (Madrasa)
-- ============================================================

-- 1. Table des élèves
CREATE TABLE IF NOT EXISTS eleves (
  id                 SERIAL PRIMARY KEY,
  nom                VARCHAR(100) NOT NULL,
  prenom             VARCHAR(100),
  classe             VARCHAR(60)  NOT NULL DEFAULT 'Débutants'
                       CHECK (classe IN (
                         'Débutants',
                         'Niveau 1',
                         'Niveau 2',
                         'Niveau 3',
                         'Mémorisation',
                         'Tajwid avancé'
                       )),
  nom_parent         VARCHAR(150),
  telephone_parent   VARCHAR(20),
  date_inscription   DATE    NOT NULL DEFAULT CURRENT_DATE,
  statut             VARCHAR(20) NOT NULL DEFAULT 'actif'
                       CHECK (statut IN ('actif', 'inactif')),
  notes              TEXT,
  created_at         TIMESTAMP DEFAULT NOW(),
  updated_at         TIMESTAMP DEFAULT NOW()
);

-- 2. Table des cotisations de l'école coranique
CREATE TABLE IF NOT EXISTS cotisations_madrasa (
  id                 SERIAL PRIMARY KEY,
  eleve_id           INTEGER NOT NULL REFERENCES eleves(id) ON DELETE CASCADE,
  montant            NUMERIC(10, 2) NOT NULL CHECK (montant > 0),
  mois_concerne      VARCHAR(30) NOT NULL,        -- ex: "Septembre 2026"
  date_paiement      DATE NOT NULL DEFAULT CURRENT_DATE,
  methode_paiement   VARCHAR(20) NOT NULL DEFAULT 'Espèces'
                       CHECK (methode_paiement IN ('Espèces', 'Virement', 'Chèque')),
  statut_paiement    VARCHAR(20) NOT NULL DEFAULT 'payé'
                       CHECK (statut_paiement IN ('payé', 'en attente')),
  commentaire        TEXT,
  created_at         TIMESTAMP DEFAULT NOW(),
  updated_at         TIMESTAMP DEFAULT NOW(),
  UNIQUE (eleve_id, mois_concerne)               -- un seul paiement par élève/mois
);

-- 3. Index pour les performances
CREATE INDEX IF NOT EXISTS idx_eleves_statut          ON eleves(statut);
CREATE INDEX IF NOT EXISTS idx_eleves_classe          ON eleves(classe);
CREATE INDEX IF NOT EXISTS idx_cotis_madrasa_eleve    ON cotisations_madrasa(eleve_id);
CREATE INDEX IF NOT EXISTS idx_cotis_madrasa_mois     ON cotisations_madrasa(mois_concerne);
CREATE INDEX IF NOT EXISTS idx_cotis_madrasa_statut   ON cotisations_madrasa(statut_paiement);
