# Contrat REST

Préfixe : `/api`. Liste publique exhaustive : `POST /auth/login`, `GET /health`,
préflight `OPTIONS` depuis l'origine autorisée, ressources statiques du build
frontend et shell SPA hors `/api`. `/api-docs` exige `admin` en local et est
désactivé en production sauf activation explicite. Toute autre route est protégée.

## Conventions globales

### Session

- La session est transportée par cookie HttpOnly same-site; elle n'est jamais
  retournée dans le corps ni accessible au code frontend.
- `401` signifie session absente, invalide, expirée, révoquée ou compte inactif.
- `403` signifie utilisateur authentifié sans permission; la session est conservée.
- `GET /auth/me` retourne `{ id, nom, email, role }` depuis l'état courant.

### Rôles

| Capacité | `admin` | `tresorier` | `lecteur` |
|----------|---------|-------------|-----------|
| Lectures métier | oui | oui | oui |
| Écritures métier | oui | oui | non |
| Administration, utilisateurs, audit | oui | non | non |

### Argent

Tous les montants sont des chaînes EUR :

```json
{ "montant": "125.00", "devise": "EUR" }
```

Expression : `^(0|[1-9][0-9]*)\.[0-9]{2}$`. Une précision différente est
refusée, jamais arrondie implicitement.

### Idempotence

Les créations financières, contre-écritures, distributions sociales et variations
stock exigent `Idempotency-Key` (1–128 caractères).

- même clé + même requête : résultat original;
- même clé + requête différente : `409 IDEMPOTENCY_KEY_REUSED`.

### Erreurs

```json
{
  "code": "VALIDATION_ERROR",
  "message": "La demande contient des valeurs invalides.",
  "request_id": "uuid",
  "field_errors": { "montant": "Deux décimales sont requises." }
}
```

Le corps ne contient jamais message base, contrainte, table, colonne ou stack.

| Statut | Codes principaux |
|--------|-------------------|
| 400 | `VALIDATION_ERROR` |
| 401 | `AUTHENTICATION_REQUIRED`, `SESSION_INACTIVE` |
| 403 | `FORBIDDEN` |
| 404 | `RESOURCE_NOT_FOUND` |
| 409 | `DUPLICATE_OPERATION`, `IDEMPOTENCY_KEY_REUSED`, `ALREADY_REVERSED`, `SOCIAL_BALANCE_INSUFFICIENT`, `STOCK_INSUFFICIENT`, `INACTIVE_REFERENCE`, `HISTORY_EXISTS` |
| 422 | `INVALID_MONEY_SCALE`, `INVALID_PERIOD` |
| 500 | `INTERNAL_ERROR` |

## Authentification et utilisateurs

| Méthode | Chemin | Accès | Contrat cible |
|---------|--------|-------|---------------|
| POST | `/auth/login` | public, limité | Crée le cookie; réponse sans secret; audite succès et refus sans mot de passe |
| POST | `/auth/logout` | authentifié | Invalide le cookie |
| GET | `/auth/me` | authentifié | Retourne compte et rôle courants |
| POST | `/auth/register` | aucun | Supprimé ou `410`; aucune inscription anonyme |
| GET | `/admin/users` | admin | Liste paginée |
| POST | `/admin/users` | admin | Crée `admin`, `tresorier` ou `lecteur` |
| PATCH | `/admin/users/{id}` | admin | Modifie nom, rôle, statut ou mot de passe selon validation |
| DELETE | `/admin/users/{id}` | admin | Seulement sans historique, jamais soi-même ni dernier admin |

`PUT /admin/users/{id}` peut rester temporairement comme alias déprécié de PATCH.

## Lectures métier existantes

| Domaine | Routes GET maintenues |
|---------|-----------------------|
| Synthèse | `/dashboard`, `/finances/resume`, `/bilans/generate` |
| Membres | `/membres`, `/membres/{id}` |
| Dons/cotisations/dépenses | `/dons`, `/cotisations`, `/depenses` |
| Personnel | `/personnel`, `/personnel/actifs`, `/personnel/paiements/tous`, `/personnel/{id}` |
| Madrasa | `/eleves`, `/eleves/actifs`, `/eleves/cotisations/toutes`, `/eleves/cotisations/resume`, `/eleves/{id}` |
| Social | `/social/bilan`, `/social/familles`, `/social/familles/{id}`, `/social/distributions` |
| Stock | `/stock`, `/stock/alertes` |
| Référentiels | `/options`, `/caisses` |

Les chemins fixes sont enregistrés avant `/{id}` ou les ids sont contraints aux
entiers afin d'éviter leur interception.

## Écritures financières

### Créations atomiques maintenues

| Méthode | Chemin | Type grand livre |
|---------|--------|-------------------|
| POST | `/dons` | CREDIT `DON`, GENERAL ou SOCIAL selon caisse |
| POST | `/cotisations` | CREDIT `COTISATION_MEMBRE` lors du statut payé |
| POST | `/depenses` | DEBIT `DEPENSE`, GENERAL |
| POST | `/personnel/paiements` | DEBIT `PAIEMENT_SALAIRE`, GENERAL |
| POST | `/eleves/cotisations` | CREDIT `ECOLAGE` lors du statut payé |
| POST | `/social/distributions` | DEBIT `DISTRIBUTION_SOCIALE`, SOCIAL |

Une réponse `201` contient la ressource, `ecriture_id`, acteur et dates. Source,
grand livre, audit et idempotence committent ensemble.

### Immutabilité

- Toute source comptabilisée est immutable. Les suppressions de dons, cotisations
  membres payées, dépenses, paiements salaires, écolages payés et distributions
  sociales retournent `405`; leur correction passe par contre-écriture.
- `PUT/PATCH /cotisations/{id}` et `/eleves/cotisations/{id}` ne peuvent modifier
  qu'une ligne non comptabilisée; passer à payé crée l'écriture une seule fois.
- Aucune modification directe de montant, période, caisse, bénéficiaire ou statut
  comptable n'est possible après comptabilisation.

### Contre-écriture

`POST /ecritures-financieres/{id}/contre-ecritures`

```json
{ "motif": "Erreur de caisse lors de la saisie" }
```

Requiert une clé d'idempotence. Retour `201` avec original et contre-écriture.
Retour `409 ALREADY_REVERSED` si l'original possède déjà sa contre-écriture.

`GET /ecritures-financieres` est paginé et filtre par type, périmètre, sens,
caisse, acteur, dates, source et état d'annulation.

`GET /ecritures-financieres/{id}` expose la relation original/contre-écriture.

## Social

`POST /social/distributions` exige : famille active, caisse active affectée
Social, montant positif exact, solde suffisant et clé d'idempotence. Un solde
insuffisant produit `409 SOCIAL_BALANCE_INSUFFICIENT` sans aucune écriture.

Toute création de don Social et toute contre-écriture affectant une caisse Social
applique le même verrou de caisse et la même vérification de solde que la
distribution. Une contre-écriture de don est refusée si elle rendrait le disponible
négatif. La contre-écriture utilise l'affectation historique de son original et
reste possible si la caisse est devenue inactive ou a changé d'affectation; seuls
les nouveaux dons et distributions exigent une caisse active actuellement Social.

`GET /social/bilan` retourne des chaînes EUR :

```json
{
  "total_collecte": "1000.00",
  "total_distribue": "250.00",
  "reste_disponible": "750.00",
  "caisses": []
}
```

## Stock

`POST /stock/{id}/mouvements` remplace les variations directes :

```json
{ "type": "SORTIE", "quantite": 3, "motif": "Utilisation chantier" }
```

Requiert une clé d'idempotence. Retour `201` avec quantité avant/après. Une sortie
excessive retourne `409 STOCK_INSUFFICIENT` sans changement. Les anciens chemins
`increment`/`decrement` peuvent rester comme alias dépréciés mais appliquent les
mêmes validations.

`PATCH /stock/{id}` modifie uniquement métadonnées et seuil; il refuse
`quantite_actuelle`. Une suppression avec historique retourne
`409 HISTORY_EXISTS` et la désactivation est proposée.

## Registres et référentiels

Les routes CRUD existantes de membres, personnel, élèves, familles, stock et
configuration sont conservées. Chaque mutation :

- exige `admin` ou `tresorier`, sauf `/admin/*` réservé à `admin`;
- vérifie que les références choisies sont actives;
- retourne `409 HISTORY_EXISTS` plutôt que de détruire un historique;
- audit avant/après dans la même transaction;
- utilise PATCH pour les mises à jour partielles, avec PUT temporairement aliasé.

Routes admin maintenues : `/admin/caisses`, `/admin/config/{type}` et
`/admin/projet`.

## Audit

`GET /admin/audit-events` accepte : `event_type`, `actor_user_id`, `resultat`,
`entity_type`, `entity_id`, `date_from`, `date_to`, `search`, `limit`, `offset`.

Réponse :

```json
{ "items": [], "total": 0, "limit": 50, "offset": 0 }
```

Aucun POST, PUT, PATCH ou DELETE n'est exposé. `/admin/logs` reste un alias GET
déprécié pendant la transition et ne transforme jamais une panne en liste vide.

## Rapports

`GET /dashboard`, `/finances/resume` et `/bilans/generate` :

- calculent depuis le grand livre avec contre-écritures;
- excluent SOCIAL des totaux généraux;
- retournent les montants en chaînes EUR et zéro pour une période vide;
- n'interpolent jamais une date utilisateur;
- permettent de rapprocher le bilan annuel avec le détail source.

`GET /bilans/generate?annee=2026` utilise une année civile aux bornes
`[2026-01-01, 2027-01-01)` et contient une section Social séparée.

## Exports

Les deux formats sont Excel `.xlsx` et PDF. Ils restent produits côté interface à
partir de la collection filtrée visible. Aucun endpoint d'export supplémentaire
n'est créé. Les colonnes argent utilisent le format EUR partagé, les dates le
format français et les caractères accentués sont préservés.
