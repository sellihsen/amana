# Tasks: Référentiel fonctionnel global

**Input**: Design documents from `specs/002-global-functional-baseline/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`,
`contracts/rest-api.md`, `quickstart.md`

**Tests**: Obligatoires pour les flux financiers, les permissions et chaque
correctif conformément à FR-024, SC-009 et à la constitution. Écrire les tests de
chaque phase avant son implémentation et constater leur échec initial.

**Organization**: Les tâches sont regroupées par user story. Les infrastructures
partagées qui bloquent plusieurs stories sont limitées aux phases Setup et
Foundational.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Peut être exécutée en parallèle avec les autres tâches [P] du même bloc
- **[Story]**: User story couverte (`US1` à `US8`)
- Chaque tâche indique les chemins exacts à modifier ou créer

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Installer les outils de vérification et rendre l'application testable
sans changer encore les comportements métier.

- [X] T001 Ajouter Jest 30, Supertest 7 et les scripts `test`, `test:unit`, `test:integration`, `test:ci` dans `backend/package.json`
- [X] T002 [P] Ajouter Vitest 3.2, jsdom 26, Testing Library et les scripts `test`, `test:run`, `test:ci` dans `frontend/package.json`
- [X] T003 [P] Ajouter les scripts racine `test` et `test:ci` qui enchaînent backend, frontend et build dans `package.json`
- [X] T004 [P] Configurer Vitest/jsdom et jest-dom dans `frontend/vite.config.js` et `frontend/src/test/setup.js`
- [X] T005 Séparer création de l'app/écoute réseau et extraire la configuration OpenAPI partagée dans `backend/src/app.js`, `backend/src/index.js` et `backend/src/config/swagger.js` afin que Supertest importe l'app sans port
- [X] T006 Créer le cycle de base PostgreSQL jetable avec garde `_test`, migrations et nettoyage dans `backend/tests/helpers/database.js`, `backend/tests/setup.js` et `backend/jest.config.js`
- [X] T007 [P] Créer le job Node 18.20/PostgreSQL 14 exécutant `npm run test:ci` dans `.github/workflows/ci.yml`

**Checkpoint**: Les runners démarrent, l'application est importable et la base de
test peut être créée puis supprimée sans toucher une base non-test.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Fournir les primitives communes obligatoires avant toute user story.

**CRITICAL**: Aucune phase user story ne commence avant ce checkpoint.

### Tests fondamentaux

- [X] T008 Écrire les tests d'intégration du registre, checksum, advisory lock, reprise et idempotence des migrations dans `backend/tests/integration/migrations.test.js`
- [X] T009 [P] Écrire les tests des transactions commit/rollback, redaction d'audit et immutabilité du journal dans `backend/tests/integration/audit-transaction.test.js`
- [X] T010 [P] Écrire les tests unitaires des chaînes EUR et des clés d'idempotence dans `backend/tests/unit/money.test.js` et `backend/tests/unit/idempotency.test.js`
- [X] T011 [P] Écrire les tests de configuration obligatoire, request id et erreurs API opaques dans `backend/tests/integration/error-config.test.js`

### Implémentation fondamentale

- [X] T012 Rendre le runner verrouillé, transactionnel, idempotent et suivi par checksum avec baseline 001–011 dans `backend/migrations/run.js`
- [X] T013 Supprimer la création de tables des seeds et les faire dépendre exclusivement des migrations dans `backend/seeds/run.js` et `backend/seeds/runSeed.js`
- [X] T014 Créer la migration idempotente utilisateurs, catalogue d'audit et journal structuré append-only dans `backend/migrations/012_auth_audit_foundation.sql`
- [X] T015 Créer la migration idempotente de déduplication `(acteur, opération, clé)` dans `backend/migrations/013_idempotency.sql`
- [X] T016 Implémenter l'exécution sur une connexion avec commit/rollback dans `backend/src/utils/transaction.js`
- [X] T017 [P] Implémenter la validation centralisée des chaînes EUR et des bornes dans `backend/src/utils/money.js`
- [X] T018 Implémenter la réservation, comparaison d'empreinte et mémorisation des réponses idempotentes dans `backend/src/utils/idempotency.js`
- [X] T019 Implémenter le catalogue, la redaction avant/après et l'insertion d'audit via client transactionnel dans `backend/src/utils/audit.js` et retirer le fire-and-forget de `backend/src/utils/logger.js`
- [X] T020 Implémenter la validation fail-fast de l'environnement, documenter chaque variable requise, ajouter request id et erreurs centralisées dans `backend/src/config/env.js`, `backend/.env.example`, `backend/src/middleware/requestId.js`, `backend/src/middleware/errorHandler.js` et `backend/src/app.js`

**Checkpoint**: Les migrations sont fiables; transaction, audit, argent,
idempotence et erreurs sont testés et réutilisables.

---

## Phase 3: User Story 1 - Accéder selon son rôle (Priority: P1) 🎯 MVP

**Goal**: Établir une session sûre et appliquer la matrice `admin`, `tresorier`,
`lecteur` côté serveur et côté présentation.

**Independent Test**: Se connecter avec chaque rôle, tester lecture, écriture métier
et administration, puis désactiver/rétrograder une session active; toutes les
décisions correspondent à la matrice et 401 reste distinct de 403.

### Tests for User Story 1

- [X] T021 [P] [US1] Écrire les tests API de login, logout, `/auth/me`, expiration, cookie HttpOnly, compte courant et inscription anonyme fermée dans `backend/tests/integration/auth.test.js`
- [X] T022 [P] [US1] Écrire la matrice complète des permissions lecture/écriture/admin pour les trois rôles dans `backend/tests/integration/authorization.test.js`
- [X] T023 [P] [US1] Écrire les tests de rate limit, en-têtes, limite de corps, whitelist publique, entrées SQL hostiles et identifiants dynamiques refusés dans `backend/tests/integration/security-baseline.test.js`
- [X] T024 [P] [US1] Écrire les tests du dernier admin, auto-suppression, rôle trésorier, politique mot de passe serveur et audit des événements de compte dans `backend/tests/integration/admin-users.test.js`
- [X] T025 [P] [US1] Écrire les tests frontend des gardes de rôle et des réponses 401/403 dans `frontend/src/test/role-access.test.jsx` et `frontend/src/test/api-auth.test.js`

### Implementation for User Story 1

- [X] T026 [US1] Créer les capacités `READ`, `BUSINESS_WRITE`, `ADMIN` et les middlewares d'autorisation dans `backend/src/middleware/authorize.js`
- [X] T027 [US1] Vérifier signature, algorithme, `auth_version`, statut et rôle courant à chaque requête dans `backend/src/middleware/auth.js`
- [X] T028 [US1] Fermer `/register`, ajouter login cookie, logout et `/me`, rate limit, audits succès/refus et annotations OpenAPI synchrones dans `backend/src/routes/auth.js`
- [X] T029 [US1] Autoriser les trois rôles, imposer la politique mot de passe serveur et appliquer soi-même/dernier admin avec audit atomique et OpenAPI synchrone dans `backend/src/routes/admin/users.js`
- [X] T030 [US1] Appliquer deny-by-default, Helmet, CORS/origin, limites de corps, whitelist et `/api-docs` admin-only, compléter OpenAPI et supprimer tout SQL interpolé même mort dans `backend/src/app.js`, `backend/src/config/swagger.js`, `backend/src/routes/bilans.js`, `backend/src/routes/social.js` et `backend/src/routes/admin/config.js`
- [X] T031 [US1] Passer Axios en session cookie et ne déconnecter que sur 401 dans `frontend/src/services/api.js` et `frontend/src/store/authStore.js`
- [X] T032 [US1] Centraliser les capacités de présentation et créer le garde réutilisable dans `frontend/src/utils/permissions.js` et `frontend/src/components/RoleGuard.jsx`
- [X] T033 [US1] Appliquer les gardes aux routes/navigation et retirer les lectures directes de localStorage dans `frontend/src/App.jsx`, `frontend/src/components/layout/Sidebar.jsx`, `frontend/src/pages/AdminPage.jsx` et `frontend/src/pages/SocialPage.jsx`
- [X] T034 [US1] Adapter la connexion, l'état de session et les messages 401/403 dans `frontend/src/pages/LoginPage.jsx` et `frontend/src/components/layout/Header.jsx`

**Checkpoint**: US1 est livrable seule comme MVP de sécurité; aucun `lecteur` ne
modifie et aucun `tresorier` n'administre.

---

## Phase 4: User Story 2 - Piloter les finances courantes (Priority: P1)

**Goal**: Garantir des écritures EUR exactes, atomiques, idempotentes et immuables,
des contre-écritures, et des totaux généraux rapprochables.

**Independent Test**: Enregistrer chaque flux financier, rejouer les demandes,
simuler un audit en panne, créer une contre-écriture et rapprocher dashboard et
bilan avec le grand livre.

### Tests for User Story 2

- [X] T035 [P] [US2] Écrire les tests EUR, idempotence et rollback audit des dons, cotisations et dépenses dans `backend/tests/integration/general-financial-posting.test.js`
- [X] T036 [P] [US2] Écrire les tests EUR, idempotence et rollback des salaires et écolages dans `backend/tests/integration/payroll-madrasa-posting.test.js`
- [X] T037 [P] [US2] Écrire les tests d'immutabilité, contre-écriture unique et backfill historique dans `backend/tests/integration/financial-ledger.test.js`
- [X] T038 [P] [US2] Écrire les tests d'agrégats SQL, douze mois, période vide, indicateurs RH/Madrasa, opérations récentes et bilan annuel rapprochable dans `backend/tests/integration/financial-reports.test.js`
- [X] T039 [P] [US2] Écrire les tests frontend du format EUR et du parcours de contre-écriture dans `frontend/src/test/money.test.js` et `frontend/src/test/financial-reversal.test.jsx`

### Implementation for User Story 2

- [X] T040 [US2] Créer les domaines idempotents `montant_eur_positif`/`montant_eur_non_negatif` et convertir les colonnes après préflight dans `backend/migrations/014_exact_eur.sql`
- [X] T041 [US2] Créer et backfiller le grand livre, ses liens sources et ses protections append-only dans `backend/migrations/015_financial_ledger.sql`
- [X] T042 [US2] Implémenter les agrégats SQL GENERAL/SOCIAL, contre-écritures et zéros exacts dans `backend/src/queries/finances.js`
- [X] T043 [P] [US2] Convertir les dons en transaction source+ledger+audit+idempotence avec caisse active et mettre à jour leur OpenAPI dans `backend/src/routes/dons.js`
- [X] T044 [P] [US2] Convertir les cotisations payées en écritures immuables, garder les brouillons modifiables et mettre à jour leur OpenAPI dans `backend/src/routes/cotisations.js`
- [X] T045 [P] [US2] Convertir les dépenses en transaction source+ledger+audit+idempotence, supprimer le delete comptabilisé et mettre à jour leur OpenAPI dans `backend/src/routes/depenses.js`
- [X] T046 [P] [US2] Convertir les paiements salaires en transaction atomique, supprimer le delete comptabilisé et mettre à jour leur OpenAPI dans `backend/src/routes/personnel.js`
- [X] T047 [P] [US2] Convertir les écolages payés en écritures immuables, supprimer update/delete comptabilisés et mettre à jour leur OpenAPI dans `backend/src/routes/eleves.js`
- [X] T048 [US2] Ajouter recherche du grand livre et contre-écriture atomique avec OpenAPI dans `backend/src/routes/ecrituresFinancieres.js` et monter la route dans `backend/src/app.js`
- [X] T049 [US2] Remplacer l'arithmétique JS par les agrégats SQL canoniques et garantir douze mois, RH/Madrasa, opérations récentes et OpenAPI dans `backend/src/routes/dashboard.js`, `backend/src/routes/finances.js` et `backend/src/routes/bilans.js`
- [X] T050 [US2] Créer le parseur/formatteur EUR unique sans calcul flottant dans `frontend/src/utils/money.js`
- [X] T051 [P] [US2] Adapter saisie, affichage et contre-écriture dans `frontend/src/pages/DonsPage.jsx`, `frontend/src/pages/CotisationsPage.jsx` et `frontend/src/pages/DepensesPage.jsx`
- [X] T052 [P] [US2] Adapter paiements, écolages, dashboard et bilan aux chaînes EUR et contre-écritures dans `frontend/src/pages/RHPage.jsx`, `frontend/src/pages/MadrasaPage.jsx`, `frontend/src/pages/DashboardPage.jsx` et `frontend/src/pages/BilansPage.jsx`

**Checkpoint**: Tous les flux généraux sont exacts et rapprochables; aucune source
comptabilisée ne peut être modifiée ou supprimée.

---

## Phase 5: User Story 3 - Gérer les personnes et leurs contributions (Priority: P1)

**Goal**: Préserver membres, personnel, élèves et leurs historiques tout en
permettant recherche, modification non financière et désactivation.

**Independent Test**: Créer et désactiver chaque type de personne, rechercher ses
données, refuser une suppression destructive et un écolage mensuel en doublon.

### Tests for User Story 3

- [X] T053 [P] [US3] Écrire les tests membres de recherche, statut et suppression avec historique dans `backend/tests/integration/members.test.js`
- [X] T054 [P] [US3] Écrire les tests personnel de désactivation et protection des paiements dans `backend/tests/integration/personnel.test.js`
- [X] T055 [P] [US3] Écrire les tests élèves de filtres, période canonique et unicité mensuelle dans `backend/tests/integration/students.test.js`
- [X] T056 [P] [US3] Écrire les tests frontend des recherches, statuts et refus de suppression dans `frontend/src/test/people-pages.test.jsx`

### Implementation for User Story 3

- [X] T057 [US3] Remplacer les cascades historiques, normaliser les périodes et corriger les unicités annuelle/mensuelle dans `backend/migrations/016_people_history_periods.sql`
- [X] T058 [P] [US3] Rendre les mutations membres transactionnelles, auditables, history-safe et synchroniser leur OpenAPI dans `backend/src/routes/membres.js`
- [X] T059 [P] [US3] Rendre les fiches personnel transactionnelles, imposer la désactivation si paiements et synchroniser leur OpenAPI dans `backend/src/routes/personnel.js`
- [X] T060 [P] [US3] Rendre les fiches élèves transactionnelles, normaliser la période, préserver les écolages et synchroniser leur OpenAPI dans `backend/src/routes/eleves.js`
- [X] T061 [P] [US3] Adapter recherche, statuts et désactivation membres dans `frontend/src/pages/MembresPage.jsx`
- [X] T062 [P] [US3] Adapter les fiches personnel et messages d'historique dans `frontend/src/pages/RHPage.jsx`
- [X] T063 [P] [US3] Adapter filtres, périodes et protection historique Madrasa dans `frontend/src/pages/MadrasaPage.jsx`

**Checkpoint**: Chaque registre reste exploitable et aucune opération liée n'est
perdue lors d'une désactivation.

---

## Phase 6: User Story 4 - Isoler l'aide sociale (Priority: P1)

**Goal**: Garantir que les dons et distributions Social restent séparés, exacts
et impossibles à dépenser au-delà du disponible, y compris en concurrence.

**Independent Test**: Créditer une caisse Social, distribuer partiellement, tenter
un dépassement et deux distributions concurrentes, puis vérifier les deux bilans.

### Tests for User Story 4

- [X] T064 [P] [US4] Écrire les tests de caisse active/Social, solde, concurrence et rollback distribution dans `backend/tests/integration/social-distributions.test.js`
- [X] T065 [P] [US4] Écrire les tests de contre-écriture Social après désactivation/réaffectation de caisse dans `backend/tests/integration/social-reversals.test.js`
- [X] T066 [P] [US4] Écrire les tests frontend familles, distributions, bilan et permissions trésorier dans `frontend/src/test/social-page.test.jsx`

### Implementation for User Story 4

- [X] T067 [US4] Ajouter statut famille et protections FK historiques des distributions dans `backend/migrations/017_social_history.sql`
- [X] T068 [US4] Implémenter dons, distributions et contre-écritures Social sous le même verrou de caisse et synchroniser leur OpenAPI dans `backend/src/routes/dons.js`, `backend/src/routes/social.js` et `backend/src/routes/ecrituresFinancieres.js`
- [X] T069 [US4] Recalculer collecté/distribué/restant sans fan-out et synchroniser OpenAPI Social dans `backend/src/queries/finances.js` et `backend/src/routes/social.js`
- [X] T070 [US4] Séparer Social dans dashboard, finances et bilan annuel avec OpenAPI synchrone dans `backend/src/routes/dashboard.js`, `backend/src/routes/finances.js` et `backend/src/routes/bilans.js`
- [X] T071 [US4] Adapter familles, distributions, erreurs de solde et montants exacts dans `frontend/src/pages/SocialPage.jsx`

**Checkpoint**: Le restant Social ne devient jamais négatif et n'affecte jamais le
solde général.

---

## Phase 7: User Story 7 - Auditer toutes les opérations (Priority: P1)

**Goal**: Couvrir chaque mutation et événement de sécurité par un audit complet,
immuable, filtrable et atomique.

**Independent Test**: Modifier chaque domaine, filtrer par acteur/type/date/cible,
inspecter avant/après, tenter update/delete et provoquer une panne d'audit.

### Tests for User Story 7

- [X] T072 [P] [US7] Écrire la matrice de couverture d'audit de toutes les routes mutantes et de redaction des secrets dans `backend/tests/integration/audit-coverage.test.js`
- [X] T073 [P] [US7] Écrire les tests de filtres, pagination, erreurs et absence de méthodes mutantes du journal dans `backend/tests/integration/admin-audit.test.js`
- [X] T074 [P] [US7] Écrire les tests frontend de recherche et filtres audit admin dans `frontend/src/test/audit-page.test.jsx`

### Implementation for User Story 7

- [X] T075 [US7] Convertir les mutations métier restantes au helper transaction+audit et synchroniser leur OpenAPI dans `backend/src/routes/membres.js`, `backend/src/routes/personnel.js`, `backend/src/routes/eleves.js`, `backend/src/routes/social.js` et `backend/src/routes/stock.js`
- [X] T076 [US7] Convertir les mutations admin au helper transaction+audit et synchroniser leur OpenAPI dans `backend/src/routes/caisses.js`, `backend/src/routes/admin/config.js`, `backend/src/routes/admin/projet.js` et `backend/src/routes/admin/users.js`
- [X] T077 [US7] Implémenter `/admin/audit-events`, filtres, alias non silencieux `/admin/logs` et OpenAPI synchrone dans `backend/src/routes/admin/logs.js`
- [X] T078 [US7] Afficher le journal structuré, avant/après et les filtres sans action mutante dans `frontend/src/pages/AdminPage.jsx`
- [X] T079 [US7] Vérifier et compléter le catalogue stable de tous les événements utilisés dans `backend/src/utils/audit.js` et `backend/migrations/012_auth_audit_foundation.sql`

**Checkpoint**: La matrice d'audit est à 100 % et une panne d'audit annule chaque
mutation correspondante.

---

## Phase 8: User Story 5 - Suivre les stocks (Priority: P2)

**Goal**: Garantir des variations exactes, aucun stock négatif et des alertes
cohérentes sur la page stock et le tableau de bord.

**Independent Test**: Ajouter puis sortir du stock, tenter un dépassement et des
sorties concurrentes, et franchir le seuil d'alerte.

### Tests for User Story 5

- [X] T080 [P] [US5] Écrire les tests API d'entrée/sortie, idempotence, concurrence, overdraw et audit dans `backend/tests/integration/stock.test.js`
- [X] T081 [P] [US5] Écrire les tests frontend de variation, erreur de quantité et alerte globale dans `frontend/src/test/stock-dashboard.test.jsx`

### Implementation for User Story 5

- [X] T082 [US5] Ajouter contraintes non négatives, quantités entières et statut produit dans `backend/migrations/018_stock_constraints.sql`
- [X] T083 [US5] Implémenter `/stock/{id}/mouvements`, update conditionnel, idempotence, aliases stricts et OpenAPI synchrone dans `backend/src/routes/stock.js`
- [X] T084 [US5] Ajouter les alertes stock au contrat dashboard et à son OpenAPI dans `backend/src/routes/dashboard.js`
- [X] T085 [US5] Adapter les actions entrée/sortie, motif, erreurs et désactivation dans `frontend/src/pages/StockPage.jsx`
- [X] T086 [US5] Afficher le bandeau critique depuis le dashboard sans requête divergente dans `frontend/src/pages/DashboardPage.jsx`

**Checkpoint**: Aucune quantité ne devient négative et toutes les alertes au seuil
sont visibles.

---

## Phase 9: User Story 6 - Administrer les référentiels (Priority: P2)

**Goal**: Rendre caisses, catégories, classes, types RH et projet réellement
configurables sans réécrire ni casser l'historique.

**Independent Test**: Créer, utiliser, renommer et désactiver chaque référence;
elle disparaît des nouvelles saisies tandis que le libellé historique reste stable.

### Tests for User Story 6

- [X] T087 [P] [US6] Écrire les tests de FK, snapshots, état actif et suppression history-safe des référentiels dans `backend/tests/integration/config-references.test.js`
- [X] T088 [P] [US6] Écrire les tests caisses d'affectation, désactivation et conservation historique dans `backend/tests/integration/caisses.test.js`
- [X] T089 [P] [US6] Écrire les tests frontend d'administration et listes d'options actives dans `frontend/src/test/admin-config.test.jsx`

### Implementation for User Story 6

- [X] T090 [US6] Remplacer contraintes textuelles par FK configurables avec snapshots et `RESTRICT` dans `backend/migrations/019_config_references.sql`
- [X] T091 [P] [US6] Rendre CRUD config/projet transactionnels, validés, history-safe et synchroniser leur OpenAPI dans `backend/src/routes/admin/config.js` et `backend/src/routes/admin/projet.js`
- [X] T092 [P] [US6] Rendre CRUD caisses transactionnel, empêcher les changements incohérents et synchroniser son OpenAPI dans `backend/src/routes/caisses.js`
- [X] T093 [US6] Retourner uniquement les références actives, valider les FK actives et synchroniser les contrats modifiés dans `backend/src/routes/options.js`, `backend/src/routes/dons.js`, `backend/src/routes/depenses.js`, `backend/src/routes/personnel.js`, `backend/src/routes/eleves.js` et `backend/src/routes/social.js`
- [X] T094 [US6] Adapter les formulaires admin aux trois rôles, statuts et erreurs d'historique dans `frontend/src/pages/AdminPage.jsx`
- [X] T095 [US6] Rafraîchir les options actives et conserver les snapshots historiques dans `frontend/src/pages/DonsPage.jsx`, `frontend/src/pages/DepensesPage.jsx`, `frontend/src/pages/RHPage.jsx`, `frontend/src/pages/MadrasaPage.jsx` et `frontend/src/pages/SocialPage.jsx`

**Checkpoint**: Les référentiels sont dynamiques, actifs à la saisie et stables dans
l'historique.

---

## Phase 10: User Story 8 - Exploiter et vérifier les données (Priority: P3)

**Goal**: Exporter exactement les listes filtrées en XLSX/PDF et publier une
documentation API fidèle aux comportements et permissions.

**Independent Test**: Filtrer chaque liste, vérifier les deux exports avec accents
et montants, puis comparer chaque route documentée à son comportement testé.

### Tests for User Story 8

- [X] T096 [P] [US8] Écrire les tests de projection filtrée, colonnes, EUR, dates et caractères accentués des exports dans `frontend/src/test/exports.test.jsx`
- [X] T097 [P] [US8] Écrire les tests du document OpenAPI pour sécurité, erreurs, argent, idempotence et routes réelles dans `backend/tests/integration/openapi-contract.test.js`

### Implementation for User Story 8

- [X] T098 [US8] Centraliser la projection XLSX/PDF, format EUR/date et police PDF Unicode dans `frontend/src/components/ExportButtons.jsx` et `frontend/src/utils/export.js`
- [X] T099 [P] [US8] Faire exporter les collections filtrées visibles dans `frontend/src/pages/MembresPage.jsx`, `frontend/src/pages/DonsPage.jsx`, `frontend/src/pages/CotisationsPage.jsx` et `frontend/src/pages/DepensesPage.jsx`
- [X] T100 [P] [US8] Faire exporter les collections filtrées visibles dans `frontend/src/pages/RHPage.jsx`, `frontend/src/pages/MadrasaPage.jsx` et `frontend/src/pages/StockPage.jsx`
- [X] T101 [US8] Vérifier et compléter les composants OpenAPI partagés MoneyEUR, Error, AuditEvent et FinancialEntry dans `backend/src/config/swagger.js` et leur chargement dans `backend/src/app.js`
- [X] T102 [P] [US8] Vérifier la cohérence finale des annotations auth, finances, grand livre et rapports dans `backend/src/routes/auth.js`, `backend/src/routes/dons.js`, `backend/src/routes/cotisations.js`, `backend/src/routes/depenses.js`, `backend/src/routes/ecrituresFinancieres.js`, `backend/src/routes/dashboard.js`, `backend/src/routes/finances.js` et `backend/src/routes/bilans.js`
- [X] T103 [P] [US8] Vérifier la cohérence finale des annotations personnes, Social, stock et administration dans `backend/src/routes/membres.js`, `backend/src/routes/personnel.js`, `backend/src/routes/eleves.js`, `backend/src/routes/social.js`, `backend/src/routes/stock.js`, `backend/src/routes/caisses.js`, `backend/src/routes/admin/config.js`, `backend/src/routes/admin/projet.js`, `backend/src/routes/admin/logs.js` et `backend/src/routes/admin/users.js`
- [X] T104 [US8] Vérifier que `/api-docs` suit la politique admin/local et que chaque route du contrat est documentée dans `backend/src/app.js` et `backend/src/config/swagger.js`

**Checkpoint**: Les exports correspondent aux écrans et la documentation est une
description vérifiée de l'API réelle.

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Fermer les écarts transverses, exécuter la validation complète et
mettre la documentation opérationnelle en accord.

- [X] T105 [P] Ajouter des index mesurés pour filtres audit, grand livre, périodes et références dans `backend/migrations/020_performance_indexes.sql`
- [X] T106 Vérifier l'absence de SQL dynamique non whitelisté et retirer les dépendances/helpers remplacés dans `backend/src/routes/bilans.js`, `backend/src/routes/social.js`, `backend/src/routes/admin/config.js`, `backend/src/utils/logger.js`, `backend/package.json` et `frontend/package.json`
- [X] T107 [P] Mettre à jour installation, variables, migrations, tests, rôles, contre-écritures et exports dans `README.md` et `backend/.env.example`
- [X] T108 Exécuter tous les scénarios de `specs/002-global-functional-baseline/quickstart.md` et consigner les résultats dans `specs/002-global-functional-baseline/validation.md`
- [X] T109 Exécuter `npm run test:ci` et consigner chaque suite, durée et résultat; toute erreur bloque la clôture dans `specs/002-global-functional-baseline/validation.md`
- [X] T110 Vérifier FR-001 à FR-033 et SC-001 à SC-009 contre les preuves de tests dans `specs/002-global-functional-baseline/validation.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup**: aucune dépendance.
- **Phase 2 Foundational**: dépend de Setup et bloque toutes les user stories.
- **Phase 3 US1**: première story; fournit sessions et permissions aux suivantes.
- **Phase 4 US2**: dépend de US1 et fournit le grand livre/agrégats à US3 et US4.
- **Phase 5 US3**: dépend de US1 et US2 pour préserver les contributions liées.
- **Phase 6 US4**: dépend de US1 et US2; peut avancer en parallèle de US3.
- **Phase 7 US7**: dépend de US1; sa validation finale dépend des routes US2–US4.
- **Phase 8 US5**: dépend de US1 et des primitives audit de US7.
- **Phase 9 US6**: dépend de US1, US3 et US7; peut avancer en parallèle de US5.
- **Phase 10 US8**: dépend des comportements stabilisés de US1–US7.
- **Phase 11 Polish**: dépend de toutes les stories retenues pour la livraison.

### User Story Dependency Graph

```text
Setup → Foundational → US1
                         ├──→ US2 ──→ US3 ──┐
                         │       └──→ US4 ──┼──→ US7 ──→ US5 ──┐
                         │                  └──────────→ US6 ──┼──→ US8 → Polish
                         └──────────────────────────────────────┘
```

### Independent Test Criteria

| Story | Critère indépendant |
|-------|----------------------|
| US1 | Matrice complète des trois rôles, session ≤ 8 h, 401/403 et changement de compte immédiat |
| US2 | Six flux exacts, retry sans doublon, rollback audit, contre-écriture et rapprochement des totaux |
| US3 | CRUD/désactivation des personnes sans perte d'historique ni doublon mensuel |
| US4 | Social séparé, solde non négatif et concurrence sérialisée |
| US5 | Entrées/sorties exactes, overdraw refusé et alertes au seuil |
| US6 | Références dynamiques actives à la saisie et snapshots historiques stables |
| US7 | Une trace complète par mutation, filtres admin et rollback si audit indisponible |
| US8 | XLSX/PDF identiques aux listes filtrées et OpenAPI conforme aux routes testées |

### Parallel Opportunities

- Setup : T002–T004 et T007 sont parallélisables après lecture des manifests.
- Foundational : T009–T011 sont parallélisables; T017 peut avancer après T010.
- US1 : T021–T025 sont parallélisables avant l'implémentation.
- US2 : T035–T039 sont parallélisables; T043–T047 touchent des routes distinctes;
  T051 et T052 touchent des pages distinctes.
- US3 : T053–T056, puis T058–T063 sont parallélisables par domaine.
- US4 : T064–T066 sont parallélisables avant T067–T071.
- US7 : T072–T074 sont parallélisables; T075 et T076 séparent métier/admin.
- US5 : T080 et T081 sont parallélisables.
- US6 : T087–T089 puis T091/T092 sont parallélisables.
- US8 : T096/T097, T099/T100 et T102/T103 sont parallélisables.

## Parallel Execution Examples

### US1

```text
T021 auth/session API | T022 role matrix API | T023 security baseline | T024 admin users | T025 frontend access
```

### US2

```text
T035 general postings | T036 payroll/Madrasa | T037 ledger | T038 reports | T039 frontend money
Après T042 : T043 dons | T044 cotisations | T045 dépenses | T046 salaires | T047 écolages
```

### US3

```text
T053 membres | T054 personnel | T055 élèves | T056 frontend
Après T057 : T058/T061 membres | T059/T062 RH | T060/T063 Madrasa
```

### US4

```text
T064 distributions/concurrence | T065 contre-écritures Social | T066 interface Social
```

### US7

```text
T072 couverture audit | T073 API audit admin | T074 interface audit
```

### US5

```text
T080 API stock | T081 interface stock/dashboard
```

### US6

```text
T087 référentiels | T088 caisses | T089 interface admin
```

### US8

```text
T096 exports | T097 OpenAPI
Après T098 : T099 listes financières | T100 RH/Madrasa/stock
Après T101 : T102 routes financières | T103 autres routes
```

## Implementation Strategy

### MVP First

1. Terminer Setup et Foundational.
2. Terminer US1.
3. Exécuter le checkpoint US1 et démontrer matrice, session et administration.
4. Ne pas exposer l'application au-delà de localhost avant ce checkpoint.

### Incremental Delivery

1. US1 sécurise l'accès.
2. US2 sécurise les fonds généraux et introduit le grand livre.
3. US3 et US4 complètent personnes et Social en parallèle.
4. US7 ferme la couverture d'audit P1.
5. US5 et US6 complètent stock et référentiels P2.
6. US8 ferme exports et documentation P3.
7. Polish valide le référentiel entier.

### Rules During Implementation

- Les tests d'une story sont écrits et observés en échec avant son code.
- Une migration historique 001–011 n'est jamais modifiée.
- Toute nouvelle migration est à la fois idempotente et suivie.
- Aucune mutation n'est considérée terminée sans permission serveur et audit
  transactionnel.
- Aucun calcul de total monétaire n'est ajouté en JavaScript.
- Chaque checkpoint peut être démontré indépendamment avant de poursuivre.
