-- ============================================================================
-- 020 — Index de performance
--
-- Chaque index correspond à un accès réellement effectué par l'application :
--   • filtres du journal d'audit (/admin/audit-events);
--   • recherche et agrégats du grand livre (/ecritures-financieres, rapports);
--   • périodes Madrasa et cotisations annuelles;
--   • références configurables actives (/options).
--
-- Aucun index « au cas où » : un index non utilisé coûte à chaque écriture.
--
-- Migration idempotente.
-- ============================================================================

-- ─── Journal d'audit ────────────────────────────────────────────────────────
-- Tri par défaut du journal : date décroissante.
CREATE INDEX IF NOT EXISTS idx_logs_date_id
  ON logs_activite (date_action DESC, id DESC);

-- Filtre combiné acteur + date, le plus fréquent dans une enquête.
CREATE INDEX IF NOT EXISTS idx_logs_acteur_date
  ON logs_activite (utilisateur_id, date_action DESC);

-- Filtre type d'événement + date.
CREATE INDEX IF NOT EXISTS idx_logs_type_date
  ON logs_activite (type_evenement, date_action DESC);

-- ─── Grand livre ────────────────────────────────────────────────────────────
-- Agrégats par périmètre sur une plage de dates (résumé, bilan, dashboard).
CREATE INDEX IF NOT EXISTS idx_ecritures_perimetre_date_type
  ON ecritures_financieres (perimetre, date_effet, type_ecriture);

-- Solde d'une caisse Social, recalculé sous verrou à chaque mutation.
CREATE INDEX IF NOT EXISTS idx_ecritures_social_caisse
  ON ecritures_financieres (caisse_id, perimetre)
  WHERE perimetre = 'SOCIAL';

-- Résolution « cette écriture est-elle annulée ? ».
CREATE INDEX IF NOT EXISTS idx_ecritures_contre_ecriture_de
  ON ecritures_financieres (contre_ecriture_de)
  WHERE contre_ecriture_de IS NOT NULL;

-- Remontée d'une écriture depuis sa source métier.
CREATE INDEX IF NOT EXISTS idx_ecritures_source
  ON ecritures_financieres (source_type, source_id);

-- ─── Liens source → écriture ────────────────────────────────────────────────
-- Utilisés par les totaux de liste (exclusion des opérations contrepassées).
CREATE INDEX IF NOT EXISTS idx_dons_ecriture                ON dons (ecriture_id);
CREATE INDEX IF NOT EXISTS idx_cotisations_ecriture         ON cotisations (ecriture_id);
CREATE INDEX IF NOT EXISTS idx_depenses_ecriture            ON depenses (ecriture_id);
CREATE INDEX IF NOT EXISTS idx_paiements_salaires_ecriture  ON paiements_salaires (ecriture_id);
CREATE INDEX IF NOT EXISTS idx_cotisations_madrasa_ecriture ON cotisations_madrasa (ecriture_id);
CREATE INDEX IF NOT EXISTS idx_distributions_ecriture       ON distributions_sociales (ecriture_id);

-- ─── Périodes ───────────────────────────────────────────────────────────────
-- Écolages d'un élève par période, et vue mensuelle globale.
CREATE INDEX IF NOT EXISTS idx_cotisations_madrasa_eleve_periode_desc
  ON cotisations_madrasa (eleve_id, periode DESC);

-- Cotisations annuelles d'un membre.
CREATE INDEX IF NOT EXISTS idx_cotisations_membre_annee
  ON cotisations (membre_id, annee DESC);

-- Paiements de salaire d'un employé, du plus récent au plus ancien.
CREATE INDEX IF NOT EXISTS idx_paiements_personnel_date
  ON paiements_salaires (personnel_id, date_versement DESC);

-- ─── Références configurables ───────────────────────────────────────────────
-- `/options` ne lit que l'actif : index partiels, donc très petits.
CREATE INDEX IF NOT EXISTS idx_categories_depenses_actives
  ON categories_depenses (nom) WHERE actif = TRUE;
CREATE INDEX IF NOT EXISTS idx_classes_madrasa_actives
  ON classes_madrasa (nom) WHERE actif = TRUE;
CREATE INDEX IF NOT EXISTS idx_types_paiement_rh_actifs
  ON types_paiement_rh (nom) WHERE actif = TRUE;
CREATE INDEX IF NOT EXISTS idx_caisses_actives
  ON caisses (nom) WHERE actif = TRUE;

-- ─── Idempotence ────────────────────────────────────────────────────────────
-- Purge éventuelle des demandes anciennes.
CREATE INDEX IF NOT EXISTS idx_demandes_idempotentes_statut
  ON demandes_idempotentes (statut, created_at);
