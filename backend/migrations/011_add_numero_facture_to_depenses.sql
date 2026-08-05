-- 011_add_numero_facture_to_depenses.sql
ALTER TABLE depenses ADD COLUMN IF NOT EXISTS numero_facture VARCHAR(100);
