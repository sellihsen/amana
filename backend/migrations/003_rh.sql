-- ============================================================
-- Migration 003 - Module Ressources Humaines
-- ============================================================

-- 1. Table du personnel (fiches employés)
CREATE TABLE IF NOT EXISTS personnel (
  id            SERIAL PRIMARY KEY,
  nom           VARCHAR(100) NOT NULL,
  prenom        VARCHAR(100),
  role_poste    VARCHAR(100) NOT NULL
                  CHECK (role_poste IN ('Imam', 'Mouadhine', 'Enseignant',
                                        'Agent d''entretien', 'Secrétaire',
                                        'Comptable', 'Autre')),
  telephone     VARCHAR(20),
  email         VARCHAR(150),
  salaire_base  NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (salaire_base >= 0),
  date_embauche DATE DEFAULT CURRENT_DATE,
  statut        VARCHAR(20) NOT NULL DEFAULT 'actif'
                  CHECK (statut IN ('actif', 'inactif')),
  notes         TEXT,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

-- 2. Table historique des paiements de salaires
CREATE TABLE IF NOT EXISTS paiements_salaires (
  id              SERIAL PRIMARY KEY,
  personnel_id    INTEGER NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
  montant_verse   NUMERIC(10, 2) NOT NULL CHECK (montant_verse > 0),
  type_paiement   VARCHAR(60) NOT NULL DEFAULT 'Salaire mensuel'
                    CHECK (type_paiement IN ('Salaire mensuel',
                                             'Prime de l''Aïd',
                                             'Indemnité exceptionnelle')),
  date_versement  DATE NOT NULL DEFAULT CURRENT_DATE,
  mois_concerne   VARCHAR(30),   -- ex: "Octobre 2026"
  commentaire     TEXT,
  created_at      TIMESTAMP DEFAULT NOW()
);

-- 3. Index pour les performances
CREATE INDEX IF NOT EXISTS idx_personnel_statut      ON personnel(statut);
CREATE INDEX IF NOT EXISTS idx_paiements_personnel   ON paiements_salaires(personnel_id);
CREATE INDEX IF NOT EXISTS idx_paiements_date        ON paiements_salaires(date_versement);
CREATE INDEX IF NOT EXISTS idx_paiements_type        ON paiements_salaires(type_paiement);
