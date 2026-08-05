# Validation — Référentiel fonctionnel global

**Date** : 2026-08-04
**Environnement** : Node.js v18.20.8, PostgreSQL 14.23 (PGDG, Ubuntu 24.04),
npm 10.8.2 — versions identiques à celles du job CI (`.github/workflows/ci.yml`).

---

## 1. Barrière automatisée (T109)

Commande : `npm run test:ci` — enchaîne backend, frontend et build de production.

**Résultat global : SUCCÈS.** Durée totale ≈ 688 s.

### Backend — Jest 30 + Supertest 7 + PostgreSQL 14 réel

Base jetable `mosquee_test`, créée puis détruite à chaque exécution ; le
harnais refuse toute base dont le nom ne se termine pas par `_test`.

| Suite | Durée | Résultat |
|-------|-------|----------|
| `integration/authorization.test.js` | 153,8 s | ✅ |
| `integration/security-baseline.test.js` | 58,9 s | ✅ |
| `integration/financial-reports.test.js` | 48,5 s | ✅ |
| `integration/general-financial-posting.test.js` | 40,2 s | ✅ |
| `integration/migrations.test.js` | 37,8 s | ✅ |
| `integration/audit-coverage.test.js` | 24,3 s | ✅ |
| `integration/error-config.test.js` | 23,2 s | ✅ |
| `integration/openapi-contract.test.js` | 21,5 s | ✅ |
| `integration/auth.test.js` | 21,5 s | ✅ |
| `integration/admin-users.test.js` | 19,8 s | ✅ |
| `integration/stock.test.js` | 19,1 s | ✅ |
| `integration/config-references.test.js` | 17,2 s | ✅ |
| `integration/admin-audit.test.js` | 16,9 s | ✅ |
| `integration/social-distributions.test.js` | 16,0 s | ✅ |
| `integration/financial-ledger.test.js` | 15,8 s | ✅ |
| `integration/payroll-madrasa-posting.test.js` | 14,5 s | ✅ |
| `integration/students.test.js` | 12,3 s | ✅ |
| `integration/caisses.test.js` | 11,3 s | ✅ |
| `integration/members.test.js` | 11,1 s | ✅ |
| `integration/audit-transaction.test.js` | 8,1 s | ✅ |
| `integration/social-reversals.test.js` | 7,8 s | ✅ |
| `integration/personnel.test.js` | 7,8 s | ✅ |
| `unit/money.test.js` | < 1 s | ✅ |
| `unit/idempotency.test.js` | < 1 s | ✅ |
| `unit/harness.test.js` | < 1 s | ✅ |

**Total : 25 suites, 804 tests, 0 échec.**

### Frontend — Vitest 3.2 + jsdom 26 + Testing Library

| Suite | Résultat |
|-------|----------|
| `money.test.js` | ✅ |
| `exports.test.jsx` | ✅ |
| `api-auth.test.js` | ✅ |
| `role-access.test.jsx` | ✅ |
| `financial-reversal.test.jsx` | ✅ |
| `people-pages.test.jsx` | ✅ |
| `social-page.test.jsx` | ✅ |
| `audit-page.test.jsx` | ✅ |
| `stock-dashboard.test.jsx` | ✅ |
| `admin-config.test.jsx` | ✅ |
| `harness.test.jsx` | ✅ |

**Total : 11 fichiers, 131 tests, 0 échec.**

### Build de production

`vite build` : 2787 modules transformés, ✅ en 9,8 s.
Avertissement non bloquant : le bundle principal dépasse 500 kB
(1 469 kB / 444 kB gzip). Découpage à envisager, sans incidence fonctionnelle.

---

## 2. Scénarios du quickstart (T108)

### Installation et migrations — ✅

- `npm run migrate` applique les 20 migrations dans l'ordre.
- Seconde exécution : « Schéma déjà à jour », **aucune migration rejouée**.
- Checksum falsifié sur `013_idempotency.sql` → la commande **échoue avant
  toute nouvelle migration**, avec les empreintes attendue et obtenue.
- Restauration du fichier → reprise normale.

Couverture automatisée : `integration/migrations.test.js` (registre, checksum,
verrou advisory, reprise après échec, idempotence, baseline 001–011).

### Scénario 1 — Matrice des rôles — ✅

Couvert par `integration/authorization.test.js` (210 cas) et `auth.test.js`.

- `lecteur` : lectures autorisées, **toute** écriture métier et administrative
  refusée en 403.
- `tresorier` : écritures métier autorisées ; utilisateurs, configuration et
  audit refusés en 403, **sans déconnexion** (session conservée, vérifié).
- `admin` : les trois niveaux.
- Rétrogradation d'une session active → refus dès la requête suivante.
- Désactivation / suppression / incrément d'`auth_version` → 401 immédiat.
- `401` (session absente) et `403` (permission insuffisante) distincts.
- `POST /api/auth/register` → 410, aucun compte créé.
- Audit : `auth.login.succeeded` et `auth.login.failed` enregistrés ; ni mot de
  passe, ni hash, ni cookie présents (vérifié par assertion).

### Scénario 2 — Argent exact et idempotence — ✅

Couvert par `general-financial-posting.test.js`, `payroll-madrasa-posting.test.js`,
`unit/money.test.js`.

- Don `10.00` + même clé + même contenu → **une seule** écriture, résultat
  initial retourné.
- Même clé + `11.00` → `409 IDEMPOTENCY_KEY_REUSED`.
- `10`, `10.0`, `10.001`, `1e1`, `0.00`, négatif, nombre JSON → **tous refusés**,
  sans arrondi ni écriture.

### Scénario 3 — Audit atomique — ✅

Couvert par `audit-coverage.test.js` (matrice de 25 mutations) et
`audit-transaction.test.js`.

- Chaque mutation de chaque domaine produit exactement une trace, avec acteur,
  rôle, cible, avant/après, IP et request id.
- Aucun mot de passe, hash, jeton ni cookie consigné.
- Échec d'insertion d'audit (déclencheur `RAISE EXCEPTION`) → **la mutation
  métier est annulée** ; vérifié pour dons, cotisations, dépenses et
  distributions sociales.
- `UPDATE` et `DELETE` sur `logs_activite` refusés en base ; aucune route
  mutante exposée.
- Une lecture ne produit aucune entrée.

### Scénario 4 — Contre-écriture — ✅

Couvert par `financial-ledger.test.js`.

- Don, dépense et paiement présents au grand livre et dans les totaux.
- Modification et suppression directes après comptabilisation → refusées
  (405 / 409), en base comme par l'API.
- Contre-écriture motivée → écriture opposée, effet net **zéro** sur le total.
- Seconde contre-écriture → `409 ALREADY_REVERSED`.
- Contrepasser une contre-écriture → refusé.
- Original toujours visible et rapprochable.

### Scénario 5 — Séparation Social — ✅

Couvert par `social-distributions.test.js` et `social-reversals.test.js`.

- 1 000,00 crédités, 250,00 distribués → disponible **750,00**.
- Distribution excédant le disponible → `409 SOCIAL_BALANCE_INSUFFICIENT`,
  **aucune écriture**.
- Deux distributions concurrentes dont la somme dépasse le disponible :
  exactement une réussit (`[201, 409]`), quantité finale cohérente.
- Aucun montant Social n'apparaît dans `/finances/resume` ni dans le solde
  général du tableau de bord ou du bilan annuel.
- Contre-écriture Social possible après désactivation **ou** réaffectation de la
  caisse (périmètre historique conservé) ; refusée si elle rendrait le
  disponible négatif.

### Scénario 6 — Stock — ✅

Couvert par `stock.test.js`.

- Quantité 10, sortie 3 → 7 ; sortie égale au stock → 0.
- Sortie excessive → `409 STOCK_INSUFFICIENT`, quantité **inchangée**
  (aucun écrêtage : `GREATEST(0, …)` a été supprimé).
- Deux sorties concurrentes de 8 sur un stock de 10 → `[201, 409]`, reste 2.
- Alerte présente au seuil et après franchissement, page Stock et tableau de
  bord alimentés par la **même** source.
- Audit avant/après présent sur chaque mouvement.

### Scénario 7 — Bilans et exports — ✅

Couvert par `financial-reports.test.js` et `frontend/exports.test.jsx`.

- Bornes annuelles `[AAAA-01-01, AAAA+1-01-01)` vérifiées aux quatre limites.
- Année vide → zéros exacts (`0.00`), douze mois complets.
- Totaux en chaînes EUR, section Social séparée.
- Bilan rapproché ligne à ligne avec la somme signée du grand livre.
- Exports XLSX et PDF : mêmes colonnes, même ordre, même collection filtrée,
  format EUR et date français, accents et `€` préservés.

### Scénario 8 — Historique et référentiels — ✅

Couvert par `config-references.test.js`, `caisses.test.js`, `members.test.js`,
`personnel.test.js`, `students.test.js`.

- Renommage d'une catégorie ou d'une classe → l'opération historique **conserve
  son libellé d'origine** (snapshot).
- Désactivation → la référence disparaît de `/options` et une nouvelle saisie
  est refusée en `409 INACTIVE_REFERENCE`.
- Réaffectation d'une caisse → les écritures passées **ne sont pas requalifiées**.
- Suppression d'une personne ou d'une référence porteuse d'historique → refusée
  en `409 HISTORY_EXISTS`, désactivation proposée ; protection `RESTRICT`
  confirmée directement en base.

---

## 3. Couverture des exigences (T110)

### Exigences fonctionnelles

| Exigence | Preuve |
|----------|--------|
| FR-001 à FR-005 — session, rôles, 401/403 | `auth.test.js`, `authorization.test.js` |
| FR-006 — matrice serveur unique | `authorization.test.js` (210 cas), `middleware/authorize.js` |
| FR-007 — inscription anonyme fermée | `auth.test.js` |
| FR-008 — dernier admin protégé | `admin-users.test.js` |
| FR-009 — politique de mot de passe serveur | `admin-users.test.js`, `security-baseline.test.js` |
| FR-010 — comptes créés par admin uniquement | `admin-users.test.js` |
| FR-011 — montants EUR exacts, deux décimales | `unit/money.test.js`, suites de saisie financière |
| FR-012 — grand livre append-only | `financial-ledger.test.js`, migration 015 |
| FR-013 — contre-écriture unique et motivée | `financial-ledger.test.js` |
| FR-014 — sources comptabilisées immuables | `financial-ledger.test.js`, déclencheurs 015 |
| FR-015 — idempotence des créations financières | toutes les suites de saisie |
| FR-016 à FR-018 — agrégats SQL, zéros exacts, douze mois | `financial-reports.test.js` |
| FR-019 — Social séparé | `social-distributions.test.js`, `financial-reports.test.js` |
| FR-020 — solde Social non négatif, concurrence | `social-distributions.test.js` |
| FR-021 — personnes et historiques préservés | `members.test.js`, `personnel.test.js`, `students.test.js` |
| FR-022 — périodes canoniques, unicité mensuelle | `students.test.js`, migration 016 |
| FR-023 — référentiels configurables et snapshots | `config-references.test.js`, `caisses.test.js` |
| FR-024 — stock non négatif, tests obligatoires | `stock.test.js`, migration 018 |
| FR-025 à FR-028 — audit complet, atomique, filtrable | `audit-coverage.test.js`, `admin-audit.test.js` |
| FR-029 — erreurs opaques, configuration validée | `error-config.test.js`, `security-baseline.test.js` |
| FR-030 — socle de sécurité (en-têtes, rate limit, corps) | `security-baseline.test.js` |
| FR-031 — exports filtrés XLSX et PDF | `frontend/exports.test.jsx` |
| FR-032 — OpenAPI fidèle | `openapi-contract.test.js` |
| FR-033 — migrations suivies et idempotentes | `migrations.test.js` |

### Critères de succès

| Critère | Preuve |
|---------|--------|
| SC-001 — trois rôles appliqués côté serveur | `authorization.test.js` |
| SC-002 — aucun montant approximé | `unit/money.test.js`, domaines SQL 014 |
| SC-003 — aucune écriture partielle | tests de rollback dans chaque suite financière |
| SC-004 — 100 % des mutations auditées | `audit-coverage.test.js` |
| SC-005 — Social jamais négatif | `social-distributions.test.js` |
| SC-006 — stock jamais négatif | `stock.test.js` |
| SC-007 — totaux rapprochables | `financial-reports.test.js` |
| SC-008 — documentation conforme au code | `openapi-contract.test.js` |
| SC-009 — barrière de tests exécutable | `npm run test:ci`, `.github/workflows/ci.yml` |

---

## 4. Réserves

1. **Bundle frontend** — 1 469 kB (444 kB gzip), au-dessus du seuil
   d'avertissement Vite. Sans incidence fonctionnelle ; un découpage
   (`manualChunks`) est souhaitable mais hors périmètre de cette spécification.

2. **`swagger-jsdoc@6.3.0`** déclare `engines.node >= 20` alors que le projet
   cible Node 18.20. La bibliothèque **fonctionne correctement** sur Node 18
   (vérifié), mais `npm ci` émet un avertissement `EBADENGINE` en CI. À trancher :
   épingler une version antérieure, ou accepter l'avertissement.

3. **Scénarios manuels d'interface** — les parcours navigateur décrits au
   quickstart (« Démarrage manuel ») n'ont pas été exécutés dans un navigateur
   réel : cet environnement est sans affichage. Les comportements correspondants
   sont couverts par les tests de composants Vitest et par les tests d'API, ce
   qui constitue une preuve automatisée et non une observation visuelle.
   Une passe manuelle reste recommandée avant mise en service.
