# Amana — Gestion Administrative & Financière

[![CI](https://github.com/sellihsen/amana/actions/workflows/ci.yml/badge.svg)](https://github.com/sellihsen/amana/actions/workflows/ci.yml)
[![skills.sh](https://skills.sh/b/sellihsen/amana)](https://skills.sh/sellihsen/amana)

> **Amana** (أمانة) — « le dépôt confié ». Ce que l'on tient en garde pour
> autrui, et dont on doit pouvoir rendre compte.

Application locale complète pour la gestion administrative et financière d'une
mosquée : membres, dons, cotisations, dépenses, ressources humaines, école
coranique, bilans comptables, gestion des stocks, solidarité sociale et tableau
de bord unifié.

Elle est construite autour de trois garanties, vérifiées par 935 tests
automatisés :

- **Intégrité financière** — montants exacts en `NUMERIC`, totaux calculés en
  SQL, écritures immuables corrigeables uniquement par contre-écriture motivée.
- **Traçabilité totale** — chaque mutation écrit son audit dans la *même*
  transaction ; un audit qui échoue annule l'opération. Le journal est
  append-only, y compris en base.
- **Refus par défaut** — toute route exige une session ; la matrice
  `admin` / `tresorier` / `lecteur` est appliquée côté serveur, à un seul
  endroit.

Le code est publié pour que d'autres mosquées et associations puissent s'en
inspirer ou le réutiliser. Toutes les données présentes dans ce dépôt — seeds
compris — sont **fictives**.

---

## Garanties techniques

### Authentification et session

Session portée par un **cookie HttpOnly, SameSite=Strict**, valable huit heures.
Aucun jeton n'est accessible au code de la page : une injection de script ne
peut pas la dérober. L'algorithme de signature est épinglé (HS256) et un jeton
`alg: none` est rejeté.

Le compte est **relu en base à chaque requête** : rôle, statut et version
d'authentification. Une désactivation, une suppression, une rétrogradation ou
un changement de mot de passe prend effet dès la requête suivante, sans
attendre l'expiration.

### Contrôle d'accès

Refus par défaut sur toute l'API. La matrice est appliquée **côté serveur, en
un seul point** (`backend/src/middleware/authorize.js`) ; les gardes de
l'interface ne servent qu'à ne pas proposer une action vouée au refus.

| Capacité | `admin` | `tresorier` | `lecteur` |
|----------|---------|-------------|-----------|
| Lectures métier | oui | oui | oui |
| Écritures métier | oui | oui | non |
| Administration, utilisateurs, audit | oui | non | non |

`401` signifie session absente ou invalide ; `403` signifie connecté sans
permission — et ne déconnecte jamais. Les routes publiques forment une liste
fermée de deux entrées : `POST /api/auth/login` et `GET /api/health`.

### Gestion des comptes

CRUD complet réservé aux administrateurs. Mots de passe hachés (bcrypt),
politique appliquée côté serveur — au moins 12 caractères, minuscule,
majuscule, chiffre et caractère spécial. L'inscription anonyme n'existe pas.

Le **dernier administrateur actif** ne peut être ni rétrogradé, ni désactivé,
ni supprimé. Un compte porteur d'historique se désactive au lieu d'être effacé.

### Traçabilité

Chaque mutation écrit son entrée d'audit **dans la même transaction** que
l'opération décrite : acteur, rôle, cible, valeurs avant et après, adresse IP
et identifiant de corrélation. Un audit qui ne peut pas être écrit **annule la
mutation**.

Le journal est append-only, garanti par des déclencheurs PostgreSQL : ni
`UPDATE` ni `DELETE` ne l'atteignent, quel que soit le chemin. Mots de passe,
hachages, jetons et cookies en sont exclus par redaction systématique.

### Écritures financières

Les montants circulent en **chaînes EUR exactes** (`"125.00"`) et sont stockés
dans des domaines `NUMERIC(12,2)` bornés. Une précision différente est refusée,
jamais arrondie. Aucun total n'est calculé en JavaScript : toutes les sommes,
soustractions et comparaisons ont lieu en SQL.

Une opération comptabilisée est **immuable**. Sa correction passe par une
contre-écriture motivée, unique, de montant opposé — l'originale reste visible
et rapprochable. Les créations financières exigent un en-tête
`Idempotency-Key` : un double clic ou un rejeu réseau ne produit jamais deux
écritures.

### Périmètre « Social »

Les dons et distributions d'aide sociale sont **strictement séparés** du solde
général et n'entrent dans aucun total du tableau de bord ou du bilan annuel.

Toute mutation Social verrouille d'abord la caisse concernée, puis recalcule le
disponible depuis le grand livre. Deux versements simultanés sont sérialisés :
le disponible ne peut pas devenir négatif, y compris en concurrence.

### Référentiels configurables

Caisses, catégories de dépenses, classes et types de paiement s'administrent
depuis l'interface. Chaque opération conserve le **libellé au moment de sa
saisie** : renommer une référence ne réécrit jamais le passé. Une référence
désactivée disparaît des nouvelles saisies tout en restant lisible dans
l'historique ; une référence utilisée ne peut pas être supprimée.

### Documentation API

Le document OpenAPI est dérivé du code et vérifié par les tests : format des
montants, en-têtes d'idempotence, codes d'erreur et routes réellement exposées.
`/api-docs` exige une session administrateur et reste désactivé en production
sauf activation explicite.


## Stack technique

| Couche          | Technologie                                        |
|-----------------|----------------------------------------------------|
| Frontend        | React 18, Vite, Tailwind CSS, Lucide React         |
| Graphiques      | Recharts                                           |
| État global     | Zustand (en mémoire, aucune persistance navigateur)|
| Client HTTP     | Axios (cookie de session, `withCredentials`)       |
| Backend         | Node.js, Express                                   |
| Base de données | PostgreSQL >= 14 (local, port 5432)                |
| Authentification| Cookie de session HttpOnly signé (HS256), bcryptjs |
| Doc API         | swagger-jsdoc + swagger-ui-express                 |
| Tests           | Jest + Supertest (PostgreSQL réel), Vitest + Testing Library |

---

## Prérequis

- Node.js >= 18
- PostgreSQL >= 14 installé et démarré sur le port 5432
- (macOS) Postgres.app ou Homebrew PostgreSQL

---

## Installation

### 1. Ouvrir le projet

```bash
git clone https://github.com/sellihsen/amana.git
cd amana
```

### 2. Installer toutes les dépendances (frontend + backend)

```bash
npm run install:all
```

### 3. Créer la base de données

```bash
psql -U postgres -c "CREATE DATABASE mosquee_db;"
# ou avec Postgres.app sur macOS :
psql -h localhost -U $(whoami) -c "CREATE DATABASE mosquee_db;"
```

### 4. Configurer les variables d'environnement

```bash
cp backend/.env.example backend/.env
```

Éditer `backend/.env`. **Toutes** les variables marquées « REQUIS » dans
`.env.example` sont validées au démarrage : une valeur absente, vide ou
invalide **interrompt le lancement** de l'API plutôt que de recourir à une
valeur par défaut.

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mosquee_db
DB_USER=votre_utilisateur_postgres
DB_PASSWORD=votre_mot_de_passe
FRONTEND_URL=http://localhost:5173

# Au moins 32 caractères. Générez-la, ne la réutilisez pas entre environnements :
#   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
JWT_SECRET=une_cle_aleatoire_longue
JWT_EXPIRES_IN=8h
```

Variables optionnelles : `PORT`, `NODE_ENV`, `SESSION_COOKIE_NAME`,
`REQUEST_BODY_LIMIT`, `API_DOCS_ENABLED`, `TEST_DB_NAME`,
`MAINTENANCE_DB_NAME`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_EMAIL`.

### 5. Exécuter les migrations (crée toutes les tables)

```bash
npm run migrate
```

Le runner de migrations est **verrouillé, transactionnel et suivi** : il prend
un verrou advisory, refuse une migration dont le contenu a changé après
application (checksum), applique chaque fichier dans sa propre transaction et
enregistre le résultat dans `schema_migrations`. Une migration déjà appliquée
n'est jamais rejouée ; une base existante est adoptée sans être réécrite.

| Fichier | Contenu |
|---------|---------|
| `001_init.sql` | utilisateurs, membres, dons, cotisations, dépenses |
| `002_caisses.sql` | caisses dynamiques + liaison avec les dons |
| `003_rh.sql` | personnel et paiements de salaires |
| `004_madrasa.sql` | élèves et cotisations de l'école coranique |
| `005_config.sql` | catégories dépenses, classes madrasa, types paiement RH |
| `006_stock.sql` | produits et matériaux (gestion des stocks) |
| `007_projet.sql` | configuration du projet + affectation des caisses |
| `008_social.sql` | familles nécessiteuses, distributions, affectation Social |
| `009_logs.sql` | table `logs_activite` |
| `010_paiements_cree_par.sql` | colonne `cree_par` sur `paiements_salaires` |
| `011_add_numero_facture_to_depenses.sql` | numéro de facture sur les dépenses |
| `012_auth_audit_foundation.sql` | statut et version d'authentification des comptes, catalogue d'événements, journal d'audit append-only |
| `013_idempotency.sql` | déduplication `(acteur, opération, clé)` |
| `014_exact_eur.sql` | domaines monétaires exacts `montant_eur_positif` / `montant_eur_non_negatif` |
| `015_financial_ledger.sql` | grand livre append-only, reprise de l'historique, immutabilité des sources comptabilisées |
| `016_people_history_periods.sql` | `RESTRICT` à la place des cascades, période canonique Madrasa, unicités corrigées |
| `017_social_history.sql` | statut des familles et protections historiques des distributions |
| `018_stock_constraints.sql` | quantités entières non négatives |
| `019_config_references.sql` | référentiels configurables par clé étrangère + libellé snapshot |
| `020_performance_indexes.sql` | index des filtres d'audit, du grand livre et des périodes |

> Une migration s'**arrête avec un diagnostic** si des données existantes ne
> peuvent pas être classées sans décision humaine : montant hors bornes, période
> ambiguë, doublon, stock négatif ou référence inconnue. Rien n'est corrigé
> silencieusement.

### 6. Insérer les données de test (optionnel)

Le seed **ne crée aucun identifiant par défaut** : le mot de passe
administrateur doit être fourni explicitement, et le seed refuse de s'exécuter
avec `NODE_ENV=production` ou sur une base non migrée.

```bash
SEED_ADMIN_PASSWORD='UnMotDePasseFort!2026' npm run seed

# Jeu de démonstration complet (VIDE les données métier au préalable) :
SEED_ADMIN_PASSWORD='UnMotDePasseFort!2026' node backend/seeds/runSeed.js
```

Le seed crée un compte admin + 6 caisses (dont 1 Sociale) + 5 membres + 3 employés + 5 élèves + 5 produits stock + 2 familles nécessiteuses + 1 distribution sociale + historique financier + logs d'activité initiaux.

---

## Démarrage

Ouvrir **deux terminaux** :

**Terminal 1 - Backend :**
```bash
npm run dev:backend
# API disponible sur http://localhost:3001
```

**Terminal 2 - Frontend :**
```bash
npm run dev:frontend
# Interface sur http://localhost:5173
```

---

## Comptes et données de test

### Compte administrateur

| Champ        | Valeur                                          |
|--------------|-------------------------------------------------|
| Email        | `SEED_ADMIN_EMAIL` (défaut `admin@mosquee.local`) |
| Mot de passe | `SEED_ADMIN_PASSWORD` — **que vous fournissez**  |
| Rôle         | `admin`                                         |

> Aucun mot de passe n'est écrit en dur dans le dépôt. La politique serveur
> exige au moins 12 caractères, avec minuscule, majuscule, chiffre et caractère
> spécial.

### Membres de test (5)

`Ahmed Ben Ali`, `Youssef Mansouri`, `Karim Daoud`, `Nadia Chérif`, `Saïd El Amrani` (inactif)

### Personnel (3 fiches - module RH)

| Employé            | Rôle         | Salaire base |
|--------------------|--------------|--------------|
| Hassan Omar        | Imam         | 2 200 EUR/mois |
| Mourad Bilal       | Mouadhine    | 1 300 EUR/mois |
| Fatou Aminata      | Enseignante  | 1 500 EUR/mois |

> 2 paiements seedés : 1 salaire Imam + 1 salaire Mouadhine

### Élèves Madrasa (5 fiches - module École Coranique)

| Classe    | Élèves                                         |
|-----------|------------------------------------------------|
| Éveil     | Ibrahim Benali, Mehdi Saidani (inactif)        |
| Débutants | Amina Chérif                                   |
| Niveau 1  | Omar Mansouri                                  |
| Niveau 2  | Sara Daoud                                     |

> 10 cotisations seedées : mélange payé / en attente

### Caisses de dons (6 - configurables via l'interface Admin)

`Dons du Vendredi (Joumouah)`, `Caisses fixes`, `Zakat al-Maal`, `Zakat al-Fitr`, `Caisse Orphelins`, `Fonds Solidarité Sociale`

Chaque caisse porte une **affectation** déterminant le périmètre comptable :

| Affectation | Périmètre | Caisses concernées |
|-------------|-----------|-------------------|
| `Chantier` | Projet de construction (mosquée) | Dons du Vendredi, Zakat al-Maal, Caisse Orphelins |
| `Fonctionnement` | Budget courant de la mosquée | Caisses fixes, Zakat al-Fitr |
| `Social` | Fonds solidarité & familles nécessiteuses | Fonds Solidarité Sociale |

Les dons sur les caisses `Social` sont exclus des agrégats du tableau de bord principal et isolés dans le module Solidarité & Social.

### Produits Stock (5 - module Gestion des Stocks)

| Produit           | Catégorie      | Qté | Seuil | Statut            |
|-------------------|----------------|:---:|:-----:|-------------------|
| Sacs de Ciment    | Construction   |  5  |  10   | Stock critique |
| Briques           | Construction   | 200 | 100   | Stock OK       |
| Peinture          | Construction   |  3  |  10   | Stock critique |
| Cahiers           | Fournitures    | 30  |  20   | Stock OK       |
| Tableaux blancs   | Fournitures    |  2  |   1   | Stock OK       |

---

## Fonctionnalités complètes

### Tableau de bord financier global

- KPIs en temps réel : Solde, Total entrées, Total dépenses, Dons, Cotisations membres, Écolages Madrasa
- **Solde = (Dons + Cotisations membres + Écolages Madrasa payés) - (Dépenses directes + Paiements salaires)**
- Section RH : employés actifs, masse salariale, salaires du mois courant
- Section Madrasa : élèves actifs, écolages encaissés, paiements en attente
- **Bandeau d'alerte stock** : notification rouge tout en haut si des matériaux sont en stock critique
- Graphique dons mensuels (12 mois glissants, Recharts)
- Derniers dons, dernières sorties (dépenses + salaires), derniers paiements madrasa

### Gestion des Membres (Fidèles)

- CRUD complet : nom, prénom, email, téléphone, adresse, date d'adhésion
- Statuts : actif / inactif / suspendu
- Recherche en temps réel
- Export Excel et PDF de la liste

### Gestion des Dons avec Caisses dynamiques

- Enregistrement d'un don avec sélection de la **caisse de destination** (chargée dynamiquement depuis l'API)
- **SearchableSelect** : sélecteur de membre avec recherche textuelle
- Don anonyme ou lié à un membre
- **Caisses 100% configurables depuis l'interface Admin**
- Export Excel et PDF

### Gestion des Cotisations (Membres)

- Suivi des cotisations annuelles ou mensuelles par membre
- Statuts : payée / en attente / annulée
- **SearchableSelect** pour la sélection du membre
- Export Excel et PDF

### Gestion des Dépenses

- Enregistrement par catégorie (configurable dynamiquement dans l'Admin)
- **SearchableSelect** pour le choix de la catégorie
- **Colonne "Enregistré par"** : nom de l'utilisateur ayant saisi la dépense
- Export Excel et PDF

### Ressources Humaines - Personnel & Salaires

- **Fiches Personnel** : nom, prénom, rôle/poste, salaire de base, statut actif/inactif
  - Suppression bloquée si des paiements sont liés (désactivation recommandée)
- **Historique des Paiements** : tableau chronologique avec résumé par type
  - **Colonne "Saisi par"** : nom de l'utilisateur ayant enregistré le paiement
  - Types de paiement configurables dynamiquement dans l'Admin
  - **SearchableSelect** pour le choix de l'employé et du type de paiement
- Export Excel et PDF des deux onglets

### École Coranique (Madrasa) - Élèves & Écolages

- **Gestion des Élèves** : inscription, fiche complète avec contact parent, classe, statut
  - Classes configurables dynamiquement dans l'Admin
  - Filtres par classe et par statut
- **Suivi des Écolages** : tableau des paiements mensuels par élève
  - Contrainte d'unicité élève + mois (pas de doublon)
  - Toggle statut payé <-> en attente en un clic
- Export Excel et PDF des deux onglets

### Solidarité & Social - Familles & Distributions

- **Registre des Familles nécessiteuses** : CRUD complet avec fiche détaillée (ressources, composition, historique des aides)
- **Distributions sociales** : enregistrement des aides versées depuis les caisses Social
- **Bilan Social** : collecté / distribué / restant par caisse d'affectation Social

### Gestion des Stocks - Produits & Matériaux

- Inventaire complet avec badge dynamique vert/rouge selon le seuil d'alerte
- Actions rapides : entrées / sorties en un clic
- Bandeau d'alerte global sur le tableau de bord
- Export Excel et PDF

### Administration (réservé rôle `admin`)

- **Caisses** : CRUD avec toggle actif/inactif, affectation (`Chantier`, `Fonctionnement`, `Social`)
- **Catégories de Dépenses**, **Classes Madrasa**, **Types de Paiement RH** : configurables dynamiquement
- **Budget du Projet** : modification du budget prévisionnel et des capacités
- **Gestion des Utilisateurs** : CRUD complet avec mapping de rôle
- **Historique des Actions** : audit complet avec filtres (recherche, type, dates, pagination)

### Export Excel & PDF global

- **ExportButtons** composant réutilisable sur toutes les pages de liste
- Bibliothèques `xlsx`, `jspdf` et `jspdf-autotable` côté client

---

## Structure du projet

```
amana/
+-- package.json                    # Scripts racine (install:all, dev:*, migrate, seed)
+-- README.md
|
+-- backend/
|   +-- src/
|   |   +-- index.js                # Écoute réseau uniquement
|   |   +-- app.js                  # Construction de l'app Express (importable par les tests)
|   |   +-- config/
|   |   |   +-- database.js         # Pool PostgreSQL
|   |   |   +-- env.js              # Validation fail-fast de la configuration
|   |   |   \-- swagger.js          # Document OpenAPI partagé
|   |   +-- middleware/
|   |   |   +-- auth.js             # Session cookie, compte relu en base
|   |   |   +-- authorize.js        # Matrice des capacités (autorité unique)
|   |   |   +-- errorHandler.js     # Erreurs opaques + forme unique
|   |   |   \-- requestId.js        # Identifiant de corrélation
|   |   +-- utils/
|   |   |   +-- transaction.js      # BEGIN/COMMIT/ROLLBACK, connexion unique
|   |   |   +-- audit.js            # Catalogue d'événements, écriture transactionnelle
|   |   |   +-- money.js            # Validation et formatage EUR exact
|   |   |   +-- idempotency.js      # Clés et empreintes de requête
|   |   |   +-- posting.js          # Comptabilisation : source + grand livre + audit
|   |   |   +-- references.js       # Références actives et snapshots
|   |   |   +-- password.js         # Politique de mot de passe serveur
|   |   |   \-- errors.js           # Codes d'erreur du contrat
|   |   +-- queries/
|   |   |   \-- finances.js         # Agrégats SQL canoniques (source unique)
|   |   \-- routes/
|   |       +-- auth.js             # login, logout, me
|   |       +-- membres.js          # CRUD /api/membres
|   |       +-- dons.js             # POST /api/dons (comptabilisé)
|   |       +-- cotisations.js      # CRUD /api/cotisations
|   |       +-- depenses.js         # POST /api/depenses (comptabilisé)
|   |       +-- ecrituresFinancieres.js # Grand livre + contre-écritures
|   |       +-- caisses.js          # GET /api/caisses + CRUD /api/admin/caisses
|   |       +-- finances.js         # GET /api/finances/resume
|   |       +-- dashboard.js        # GET /api/dashboard
|   |       +-- personnel.js        # CRUD personnel + paiements de salaires
|   |       +-- eleves.js           # CRUD élèves + écolages
|   |       +-- bilans.js           # GET /api/bilans/generate
|   |       +-- options.js          # GET /api/options (références actives)
|   |       +-- stock.js            # CRUD stock + /mouvements
|   |       +-- social.js           # Familles, distributions, bilan Social
|   |       \-- admin/
|   |           +-- config.js       # CRUD /api/admin/config/:type
|   |           +-- projet.js       # GET/PUT /api/admin/projet
|   |           +-- logs.js         # GET /api/admin/audit-events
|   |           \-- users.js        # CRUD /api/admin/users
|   +-- migrations/                 # 20 fichiers SQL (001 -> 020), forward-only
|   +-- seeds/                      # run.js, runSeed.js, guard.js
|   +-- tests/
|   |   +-- unit/                   # Règles pures, sans base
|   |   +-- integration/            # API + PostgreSQL réel
|   |   \-- helpers/                # Base jetable, sessions, fixtures
|   \-- .env
|
\-- frontend/
    +-- index.html
    +-- vite.config.js              # Proxy /api -> localhost:3001
    +-- tailwind.config.js
    \-- src/
        +-- main.jsx
        +-- App.jsx                 # Routeur React Router v6
        +-- components/
        |   +-- RoleGuard.jsx           # Garde de présentation + hook useCapacite
        |   +-- BoutonContreEcriture.jsx# Contre-écriture motivée
        |   +-- BilanSocial.jsx         # Collecté / distribué / disponible
        |   +-- JournalAudit.jsx        # Journal d'audit, lecture seule
        |   +-- MouvementStock.jsx      # Entrée / sortie de stock
        |   +-- BandeauAlertesStock.jsx # Alertes issues du tableau de bord
        |   +-- MessageHistorique.jsx   # Erreurs HISTORY_EXISTS / INACTIVE_REFERENCE
        |   +-- ExportButtons.jsx
        |   +-- SearchableSelect.jsx
        |   \-- layout/
        |       +-- Layout.jsx
        |       +-- Sidebar.jsx     # Navigation : TdB, Membres, Dons, Cotisations, Dépenses, RH, Stocks, Madrasa, Social, Bilans, Admin
        |       \-- Header.jsx
        +-- pages/
        |   +-- LoginPage.jsx
        |   +-- DashboardPage.jsx
        |   +-- MembresPage.jsx
        |   +-- DonsPage.jsx
        |   +-- CotisationsPage.jsx
        |   +-- DepensesPage.jsx
        |   +-- RHPage.jsx
        |   +-- MadrasaPage.jsx
        |   +-- BilansPage.jsx
        |   +-- StockPage.jsx
        |   +-- SocialPage.jsx
        |   \-- AdminPage.jsx
        +-- services/
        |   +-- api.js                  # Axios, cookie de session
        |   \-- operations.js           # Envois financiers + clé d'idempotence
        +-- utils/
        |   +-- money.js                # Format EUR unique (formatage, pas calcul)
        |   +-- permissions.js          # Capacités de présentation
        |   +-- options.js              # Références actives + libellé historique
        |   +-- export.js               # Projection XLSX / PDF partagée
        |   \-- periode.js              # Périodes mensuelles canoniques
        +-- store/
        |   \-- authStore.js            # Session en mémoire, sans persistance
        \-- test/                       # Suites Vitest + setup jsdom
```

---

## API - Endpoints disponibles

### Documentation Swagger Interactive

L'API est documentée avec **Swagger UI** (OpenAPI 3.0). Accès local :

[http://localhost:3001/api-docs](http://localhost:3001/api-docs)

`/api-docs` **exige une session administrateur** et reste désactivé en
production, sauf `API_DOCS_ENABLED=true`.

Pour tester les routes protégées :
1. Connectez-vous à l'interface (`http://localhost:5173`) avec un compte `admin`
2. Ouvrez `/api-docs` dans le même navigateur — le cookie de session suit
   automatiquement, il n'y a aucun jeton à copier

Les créations financières exigent en plus un en-tête `Idempotency-Key` :
saisissez-y une valeur unique par opération.

### Liste des endpoints

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `POST` | `/api/auth/login` | Connexion, dépose le cookie de session |
| `POST` | `/api/auth/logout` | Fermeture de session |
| `GET` | `/api/auth/me` | Compte et rôle courants |
| `GET` | `/api/dashboard` | Toutes les données agrégées du tableau de bord |
| `GET` | `/api/finances/resume` | Résumé financier global |
| `GET/POST/PUT/DELETE` | `/api/membres` | CRUD membres |
| `GET/POST/DELETE` | `/api/dons` | CRUD dons |
| `GET/POST/PUT` | `/api/cotisations` | CRUD cotisations membres |
| `GET/POST/DELETE` | `/api/depenses` | CRUD dépenses |
| `GET` | `/api/caisses` | Caisses actives (formulaires) |
| `GET/POST/PUT/DELETE` | `/api/admin/caisses` | CRUD caisses (admin) |
| `GET/POST/PUT/DELETE` | `/api/personnel` | CRUD fiches personnel |
| `GET/POST/DELETE` | `/api/personnel/paiements` | Paiements de salaires |
| `GET/POST/PUT/DELETE` | `/api/eleves` | CRUD élèves Madrasa |
| `GET/POST/PUT/DELETE` | `/api/eleves/cotisations` | Cotisations Madrasa |
| `GET` | `/api/bilans/generate?annee=XXXX` | Bilan comptable annuel |
| `GET` | `/api/options` | Listes configurables |
| `GET/POST/PUT/DELETE` | `/api/stock` | CRUD produits stock |
| `POST` | `/api/stock/:id/mouvements` | Entrée ou sortie de stock |
| `GET/POST` | `/api/ecritures-financieres` | Grand livre : recherche |
| `POST` | `/api/ecritures-financieres/:id/contre-ecritures` | Contre-écriture motivée |
| `GET` | `/api/admin/audit-events` | Journal d'audit (admin) |
| `GET` | `/api/stock/alertes` | Produits en stock critique |
| `GET` | `/api/social/bilan` | Bilan des caisses sociales |
| `GET/POST/PUT/DELETE` | `/api/social/familles` | CRUD familles nécessiteuses |
| `GET/POST` | `/api/social/distributions` | Enregistrement et liste des aides |
| `GET/PUT` | `/api/admin/projet` | Budget et capacités du projet (admin) |
| `GET/POST/PUT/DELETE` | `/api/admin/config/:type` | CRUD configurations (admin) |
| `GET` | `/api/admin/logs` | Historique des actions avec filtres (admin) |
| `GET/POST/PUT/DELETE` | `/api/admin/users` | Gestion des utilisateurs (admin) |
| `GET` | `/api/health` | Health check |

---

## Logique financière

```
TOTAL ENTRÉES  = Dons (hors caisses Social)
               + Cotisations membres (statut = 'payee')
               + Cotisations Madrasa (statut_paiement = 'payé')

TOTAL DÉPENSES = Dépenses directes
               + Paiements de salaires (tous)

SOLDE          = Total Entrées - Total Dépenses
```

Les dons sur les caisses d'affectation `Social` sont exclus des agrégats du tableau de bord et gérés dans le module Solidarité & Social.

Toutes les données financières sont recalculées en temps réel à chaque appel API. Pas de cache serveur.

---

## Variables d'environnement (`backend/.env`)

```env
# Serveur
PORT=3001
FRONTEND_URL=http://localhost:5173

# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mosquee_db
DB_USER=votre_utilisateur
DB_PASSWORD=votre_mot_de_passe

# JWT
JWT_SECRET=<au moins 32 caractères, généré aléatoirement>
JWT_EXPIRES_IN=8h
```

> **Important :** Le fichier `.env` est exclu du dépôt Git. Ne commitez jamais de secrets.

---

## Tests

Les chemins « argent » et « accès » sont couverts par des tests automatisés
exécutés contre un **vrai PostgreSQL** (base jetable créée puis détruite à
chaque exécution ; son nom doit se terminer par `_test`).

```bash
# Suite complète : backend + frontend + build
npm run test:ci

# Backend seul (Jest + Supertest + PostgreSQL réel)
npm test --prefix backend
npm run test:unit --prefix backend          # règles pures, sans base
npm run test:integration --prefix backend   # API + base, séquentiel

# Frontend seul (Vitest + Testing Library)
npm run test:run --prefix frontend
```

La base de test est configurée par `backend/.env.test` (ou les variables
d'environnement en CI) :

```env
TEST_DB_NAME=mosquee_test        # DOIT se terminer par _test
MAINTENANCE_DB_NAME=postgres
```

`KEEP_TEST_DB=1` conserve la base après l'exécution pour inspection.

---

## Rôles et permissions

L'autorisation est décidée **côté serveur**, à un seul endroit
(`backend/src/middleware/authorize.js`). Les gardes de l'interface ne servent
qu'à ne pas proposer une action vouée à un refus.

| Capacité | `admin` | `tresorier` | `lecteur` |
|----------|---------|-------------|-----------|
| Lectures métier | oui | oui | oui |
| Écritures métier (dons, dépenses, membres, stock…) | oui | oui | **non** |
| Administration, utilisateurs, audit, référentiels | oui | **non** | **non** |

- La session est portée par un cookie **HttpOnly, SameSite=Strict**, valable
  huit heures. Aucun jeton n'est accessible au code de la page.
- Le rôle est **relu en base à chaque requête** : une désactivation, une
  suppression ou une rétrogradation prend effet immédiatement.
- `401` = session absente ou invalide ; `403` = connecté mais sans permission.
  Un `403` ne déconnecte jamais.
- L'inscription anonyme est fermée (`POST /api/auth/register` → `410`). Les
  comptes sont créés par un administrateur.
- Le **dernier administrateur actif** ne peut être ni rétrogradé, ni désactivé,
  ni supprimé.

---

## Écritures financières et contre-écritures

Toute opération d'argent écrit, **dans une seule transaction** : la ligne
métier, son écriture au grand livre, son entrée d'audit et sa clé
d'idempotence. Si l'un échoue, rien n'est enregistré.

- Les montants circulent en **chaînes EUR exactes** (`"125.00"`). Une précision
  différente est refusée, jamais arrondie.
- Les créations financières exigent un en-tête **`Idempotency-Key`** : un double
  clic ou un rejeu réseau ne produit jamais deux écritures.
- Une opération comptabilisée est **immuable** : elle ne peut être ni modifiée
  ni supprimée.

**Corriger une erreur** se fait par contre-écriture motivée :

```http
POST /api/ecritures-financieres/{id}/contre-ecritures
Idempotency-Key: <clé unique>

{ "motif": "Erreur de caisse lors de la saisie" }
```

L'écriture d'origine est conservée ; une écriture inverse du même montant est
ajoutée. Une écriture ne peut être contrepassée qu'**une seule fois**.

Le périmètre **SOCIAL** est strictement séparé du solde général : les dons et
distributions d'aide sociale n'entrent jamais dans les totaux généraux, et le
disponible d'une caisse Social ne peut pas devenir négatif, y compris lors de
deux versements simultanés.

---

## Exports

Chaque liste exporte **exactement la collection filtrée affichée**, aux formats
**XLSX** et **PDF**, avec le même format de montant (EUR) et de date
(français). Les accents et le symbole € sont préservés dans les deux formats.
Les exports sont produits côté interface ; aucun point d'API supplémentaire
n'est exposé.

---

## Journal d'audit

Toute mutation laisse une trace : acteur, rôle, action, cible, valeurs avant et
après, adresse IP et identifiant de corrélation. Le journal est **append-only**
— aucune route, et aucune commande SQL, ne peut le modifier ou l'effacer.

Consultation : **Administration → Journal d'audit**, ou
`GET /api/admin/audit-events` (filtres : type d'événement, acteur, résultat,
entité, dates, recherche libre, pagination).

Les mots de passe, hashes, jetons et cookies ne sont jamais consignés.
