-- ============================================================================
-- 018 — Contraintes de stock
--
-- Une quantité n'est jamais négative et n'est jamais un décimal. La règle vit
-- en base : elle protège aussi les écritures qui ne passeraient pas par l'API.
--
-- La migration s'ARRÊTE si des quantités négatives existent déjà : les
-- corriger silencieusement masquerait une perte de marchandise.
--
-- Migration idempotente.
-- ============================================================================

ALTER TABLE produits_stock ADD COLUMN IF NOT EXISTS actif BOOLEAN NOT NULL DEFAULT TRUE;

-- Préflight : aucune quantité négative ne doit préexister.
DO $$
DECLARE
  n_negatives BIGINT;
  detail      TEXT;
BEGIN
  SELECT COUNT(*), string_agg(format('%s (%s)', nom, quantite_actuelle), ', ')
    INTO n_negatives, detail
    FROM produits_stock
   WHERE quantite_actuelle < 0 OR quantite_minimale_alerte < 0;

  IF n_negatives > 0 THEN
    RAISE EXCEPTION
      E'Migration 018 interrompue : % produit(s) ont une quantité négative.\n  %\n\nCorrigez ces stocks explicitement avant de rejouer la migration.',
      n_negatives, detail;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'produits_stock_quantite_non_negative') THEN
    ALTER TABLE produits_stock
      ADD CONSTRAINT produits_stock_quantite_non_negative
      CHECK (quantite_actuelle >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'produits_stock_seuil_non_negatif') THEN
    ALTER TABLE produits_stock
      ADD CONSTRAINT produits_stock_seuil_non_negatif
      CHECK (quantite_minimale_alerte >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_produits_stock_alerte
  ON produits_stock (quantite_actuelle, quantite_minimale_alerte);

CREATE INDEX IF NOT EXISTS idx_produits_stock_actif ON produits_stock (actif);
