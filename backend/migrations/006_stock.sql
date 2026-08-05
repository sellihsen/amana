-- 006_stock.sql
-- Table de gestion des stocks et matériaux

CREATE TABLE IF NOT EXISTS produits_stock (
  id                      SERIAL PRIMARY KEY,
  nom                     VARCHAR(200) NOT NULL,
  categorie               VARCHAR(100) NOT NULL DEFAULT 'Construction',
  quantite_actuelle       INTEGER NOT NULL DEFAULT 0,
  quantite_minimale_alerte INTEGER NOT NULL DEFAULT 10,
  unite                   VARCHAR(50) NOT NULL DEFAULT 'Pièces',
  emplacement             VARCHAR(200),
  created_at              TIMESTAMP DEFAULT NOW(),
  updated_at              TIMESTAMP DEFAULT NOW()
);
