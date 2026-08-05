# Implementation Plan: Référentiel fonctionnel global

**Branch**: `002-global-functional-baseline` | **Date**: 2026-08-04 | **Spec**: [spec.md](./spec.md)

**Input**: Spécification de `specs/002-global-functional-baseline/spec.md`

## Summary

Aligner l'application existante sur son référentiel fonctionnel sans la
réécrire : conserver l'architecture Express → PostgreSQL et les pages React,
puis combler les écarts qui empêchent de garantir les rôles, l'exactitude des
montants, l'immutabilité des écritures, l'audit atomique, la séparation Social,
la cohérence des référentiels, les exports filtrés et les bilans rapprochables.

L'ordre de livraison est imposé par les dépendances d'intégrité : socle de tests
et migrations suivies; authentification/permissions; transaction et audit;
validation EUR; grand livre et contre-écritures; agrégats; règles Social/stock;
référentiels historiques; puis adaptation de l'interface, des exports et de la
documentation.

## Technical Context

**Language/Version**: JavaScript, Node.js ≥ 18 (CommonJS backend, ES modules frontend)

**Primary Dependencies**: Express 4.19, `pg` 8.12, React 18.3, Vite 5.3,
Zustand 4.5, Axios 1.7; ajout de Helmet 8, express-rate-limit 8 et cookie-parser
1.4 pour le socle de sécurité

**Storage**: PostgreSQL ≥ 14; migrations SQL forward-only, idempotentes et suivies;
aucune seconde source de schéma dans les seeds

**Testing**: Jest 30 + Supertest 7 et PostgreSQL réel pour le backend; Vitest
3.2 + jsdom 26 + Testing Library pour le frontend

**Target Platform**: Serveur local Linux/macOS avec navigateur desktop ou mobile;
processus unique PM2 en production

**Project Type**: Application web monolithique, SPA React et API Express dans le
même dépôt

**Performance Goals**: connexion et affichage de l'espace autorisé en moins de
10 secondes; recherche d'une donnée ou d'un audit en moins de 30 secondes;
pagination obligatoire pour les journaux et grands volumes

**Constraints**: calculs monétaires en SQL exact; aucune écriture financière
partielle; audit atomique; refus par défaut; fonctionnement local sans service
tiers; compatibilité avec les données historiques et PostgreSQL 14

**Scale/Scope**: une organisation locale, trois rôles, environ 70 routes, 12 pages
métier, 11 migrations historiques, 6 flux financiers et 14 domaines fonctionnels

## Constitution Check

*GATE initial et post-design : PASS — aucune exception demandée.*

| Principe | Vérification du plan | Résultat |
|----------|----------------------|----------|
| I. Intégrité Financière | Colonnes `NUMERIC(12,2)` bornées, montants transmis en chaînes décimales, grand livre append-only, contre-écritures et transactions sur une connexion; agrégats et soustractions en SQL | PASS |
| II. Traçabilité Totale | Toute mutation écrit l'audit dans la même transaction; événements stables, avant/après, acteur et source; échec audit = rollback; journal protégé contre update/delete | PASS |
| III. Refus par Défaut | Liste publique explicite, rôle courant chargé à chaque requête, matrice serveur, cookie HttpOnly, validation centralisée, erreurs opaques et configuration obligatoire au démarrage | PASS |
| IV. Vérifié Avant Fusion | Tests API/PostgreSQL obligatoires pour rôles, argent, audit, concurrence et agrégats; tests de composants pour comportements de rôle et formulaires | PASS |
| V. Une Seule Façon de Faire | Architecture route → DB conservée; cinq modules partagés seulement; un format EUR, une matrice de rôles, un catalogue d'événements, un grand livre et un format d'erreur | PASS |

### Re-évaluation après design

- `data-model.md` établit une seule autorité pour les écritures financières et
  conserve les tables métier comme détail, sans second solde mutable.
- Le bilan Social est calculé depuis le grand livre sous verrou de caisse; aucune
  projection de solde dupliquée n'est ajoutée.
- Le stock reste une quantité courante modifiée par une opération SQL conditionnelle;
  l'historique de mouvements EVO-012 reste hors périmètre et l'audit fournit la trace.
- `contracts/rest-api.md` impose le même format argent, erreur, autorisation et
  idempotence sur tous les domaines.
- Aucun contrôleur, service ou repository générique n'est ajouté.

**Résultat post-design**: PASS.

## Project Structure

### Documentation (this feature)

```text
specs/002-global-functional-baseline/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── rest-api.md
├── checklists/
│   └── requirements.md
└── tasks.md                 # créé par /speckit.tasks
```

### Source Code (repository root)

```text
backend/
├── migrations/
│   ├── run.js                         # registre, verrou et transactions
│   └── 012_*.sql ...                  # migrations forward-only nouvelles
├── src/
│   ├── index.js                       # sécurité, routes publiques, erreurs
│   ├── config/database.js             # pool et validation de configuration
│   ├── middleware/
│   │   ├── auth.js                    # compte et rôle courants
│   │   ├── authorize.js               # matrice partagée
│   │   └── errorHandler.js            # erreurs sûres et request id
│   ├── utils/
│   │   ├── transaction.js             # une connexion, commit/rollback
│   │   ├── audit.js                   # catalogue et insertion transactionnelle
│   │   ├── money.js                   # validation de chaînes EUR
│   │   └── idempotency.js             # déduplication des mutations sensibles
│   ├── queries/
│   │   └── finances.js                # agrégats SQL canoniques
│   └── routes/                         # routes métier existantes + ledger
└── tests/
    ├── unit/                           # règles pures
    ├── integration/                    # API + PostgreSQL réel
    └── helpers/                        # base jetable, fixtures, auth

frontend/
├── src/
│   ├── App.jsx
│   ├── components/
│   │   ├── RoleGuard.jsx
│   │   └── ExportButtons.jsx
│   ├── pages/                          # pages existantes adaptées
│   ├── services/api.js
│   ├── store/authStore.js
│   └── utils/
│       ├── money.js                    # format EUR unique
│       └── permissions.js              # présentation, jamais autorité
└── tests/
    ├── components/
    └── pages/
```

**Structure Decision**: Conserver les deux applications existantes et le modèle
route → SQL. Les modules partagés ne contiennent que des règles transverses qui
sont aujourd'hui dupliquées ou impossibles à garantir localement. Le nouveau
répertoire `queries/` contient uniquement les agrégats financiers partagés par
dashboard, finances et bilans.

## Delivery Phases

### Phase A — Socle vérifiable

1. Ajouter les runners de test, la base PostgreSQL jetable et les commandes CI.
2. Séparer la création de l'application Express de l'écoute réseau.
3. Rendre le runner de migrations verrouillé, transactionnel et suivi par checksum.
4. Supprimer toute création de schéma des seeds.

### Phase B — Accès et sécurité

1. Fermer l'inscription anonyme et unifier la gestion des comptes admin.
2. Ajouter le statut utilisateur, la version d'authentification et la vérification
   du compte courant sur chaque requête.
3. Appliquer la matrice `admin` / `tresorier` / `lecteur` à toutes les routes.
4. Transporter la session dans un cookie HttpOnly same-site, distinguer 401/403,
   limiter les connexions et ajouter les en-têtes/limites de sécurité.
5. Auditer les connexions réussies et refusées ainsi que tous les changements de
   compte ou de rôle, sans enregistrer d'identifiants secrets.
6. Centraliser les erreurs et valider la configuration au démarrage.

Liste publique exhaustive : `POST /api/auth/login`, `GET /api/health`, requêtes
`OPTIONS` de préflight depuis l'origine autorisée, ressources statiques du build
frontend et shell SPA hors `/api`. Le login doit être public pour établir une
session; le health check minimal sert la supervision; les ressources frontend
sont nécessaires au chargement du client. `/api-docs` est admin-only en local et
désactivé en production sauf activation explicite.

### Phase C — Audit et argent

1. Étendre le journal existant avec types stables, cible, avant/après, acteur,
   request id et métadonnées client; rendre les lignes append-only en base.
2. Introduire le helper transactionnel et convertir chaque mutation pour que
   métier + audit committent ensemble.
3. Introduire le domaine EUR exact et la validation de chaînes à deux décimales.
4. Créer le grand livre financier, backfiller l'historique et interdire les
   modifications/suppressions d'une source comptabilisée.
5. Ajouter l'idempotence aux écritures, contre-écritures, distributions et
   mouvements de stock.

### Phase D — Cohérence métier

1. Remplacer les cascades destructrices par des protections historiques.
2. Normaliser les référentiels configurables et valider leur état actif à l'écriture.
3. Rendre les distributions sociales atomiques sous verrou de caisse et refuser
   le dépassement du disponible calculé depuis le grand livre.
4. Refuser les sorties stock excessives par mise à jour SQL conditionnelle.
5. Normaliser les périodes Madrasa et l'unicité des cotisations annuelles.

### Phase E — Lecture et interface

1. Faire consommer les agrégats SQL canoniques au tableau de bord, au résumé
   financier, au bilan annuel et au bilan Social.
2. Ajouter le détail rapprochable et des zéros exacts pour les périodes vides.
3. Adapter les pages à la matrice de présentation, aux chaînes EUR, aux
   contre-écritures, aux erreurs 401/403 et aux références désactivées.
4. Faire exporter exactement les collections filtrées avec le formatage commun.
5. Synchroniser toutes les annotations OpenAPI avec le contrat final.

## Complexity Tracking

Aucune violation constitutionnelle n'est acceptée. Le grand livre financier et
la table d'idempotence sont des structures métier exigées respectivement par
FR-012 et le cas limite de soumission répétée; ce ne sont pas des couches
architecturales alternatives. Une projection de solde Social et un journal de
mouvements stock séparé ont été rejetés pour éviter deux sources de vérité et
respecter le périmètre.
