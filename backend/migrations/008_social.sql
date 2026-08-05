-- 008_social.sql
-- Module Solidarité & Social : familles, distributions, affectation Social

-- 1. Étendre la contrainte affectation des caisses pour accepter 'Social'
ALTER TABLE caisses DROP CONSTRAINT IF EXISTS caisses_affectation_check;
ALTER TABLE caisses ADD CONSTRAINT caisses_affectation_check
  CHECK (affectation IN ('Chantier', 'Fonctionnement', 'Social'));

-- 2. Basculer les caisses sociales
UPDATE caisses SET affectation = 'Social'
WHERE nom IN ('Zakat al-Maal', 'Zakat al-Fitr', 'Caisse Orphelins')
  AND affectation IS DISTINCT FROM 'Social';

-- 3. Table des familles nécessiteuses
CREATE TABLE IF NOT EXISTS familles_necessiteuses (
  id                      SERIAL PRIMARY KEY,
  nom_responsable         VARCHAR(200) NOT NULL,
  adresse                 TEXT,
  telephone               VARCHAR(50),
  ressources_mensuelles   NUMERIC(10,2) DEFAULT 0,
  nb_membres_famille      INTEGER DEFAULT 1,
  details_membres         JSONB DEFAULT '[]',
  montant_recommande_aide NUMERIC(10,2) DEFAULT 0,
  frequence_aide          VARCHAR(30) DEFAULT 'Mensuelle'
                          CHECK (frequence_aide IN ('Mensuelle', 'Ponctuelle', 'Fêtes')),
  commentaires            TEXT,
  created_at              TIMESTAMP DEFAULT NOW(),
  updated_at              TIMESTAMP DEFAULT NOW()
);

-- 4. Table des distributions sociales
CREATE TABLE IF NOT EXISTS distributions_sociales (
  id                SERIAL PRIMARY KEY,
  famille_id        INTEGER NOT NULL REFERENCES familles_necessiteuses(id) ON DELETE CASCADE,
  caisse_origine_id INTEGER NOT NULL REFERENCES caisses(id) ON DELETE SET NULL,
  montant_verse     NUMERIC(10,2) NOT NULL CHECK (montant_verse > 0),
  date_versement    DATE DEFAULT CURRENT_DATE,
  commentaire       TEXT,
  created_at        TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_distrib_famille ON distributions_sociales(famille_id);
CREATE INDEX IF NOT EXISTS idx_distrib_caisse  ON distributions_sociales(caisse_origine_id);
