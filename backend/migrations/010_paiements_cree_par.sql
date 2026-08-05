-- 010_paiements_cree_par.sql
-- Ajoute la colonne cree_par sur paiements_salaires pour la traçabilité

ALTER TABLE paiements_salaires ADD COLUMN IF NOT EXISTS cree_par INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_paiements_cree_par ON paiements_salaires(cree_par);
