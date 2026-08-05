# Guide de validation

Ce guide décrit la validation attendue après `/speckit.implement`. Il n'est pas
une procédure de production.

## Prérequis

- Node.js ≥ 18 et npm;
- PostgreSQL ≥ 14 accessible localement;
- variables de `backend/.env.example` renseignées avec un secret non vide;
- URL administrative vers une instance PostgreSQL de test dans
  `TEST_DATABASE_ADMIN_URL`; le helper refuse toute base sans suffixe `_test`.

## Installation et migrations

```bash
npm run install:all
npm run migrate
```

Résultat attendu : seules les migrations pending sont appliquées; une seconde
exécution n'en rejoue aucune. Un checksum historique modifié fait échouer la
commande avant toute nouvelle migration.

## Barrière automatisée

```bash
npm test
npm run test:ci
```

Résultat attendu : tests backend unitaires et PostgreSQL/API, tests frontend et
build de production réussissent. La base jetable est supprimée après le run.

## Démarrage manuel

Terminal 1 :

```bash
npm run dev:backend
```

Terminal 2 :

```bash
npm run dev:frontend
```

Ouvrir `http://localhost:5173`.

## Scénario 1 — Matrice des rôles

1. Créer un compte pour chaque rôle depuis l'Administration.
2. Vérifier que `lecteur` consulte mais ne voit ni ne réussit aucune mutation.
3. Vérifier que `tresorier` modifie les modules métier mais reçoit 403 sur
   utilisateurs, configuration et audit sans être déconnecté.
4. Vérifier que `admin` accède aux trois niveaux.
5. Désactiver ou rétrograder une session active et lancer une nouvelle requête.
6. Vérifier dans l'audit une connexion réussie puis une connexion refusée et
   confirmer que ni email saisi inutilement, ni mot de passe, ni cookie n'apparaît.

Résultat attendu : l'état courant s'applique dès la requête suivante; 401 et 403
sont distincts. L'inscription anonyme est indisponible.

## Scénario 2 — Argent exact et idempotence

1. Saisir un don `10.00` avec une clé d'idempotence.
2. Répéter exactement la demande avec la même clé.
3. Réutiliser la clé avec `11.00`.
4. Essayer `10`, `10.0`, `10.001`, `1e1`, zéro et un montant négatif.

Résultat attendu : une seule écriture `10.00`; le retry retourne le résultat
initial; le contenu différent retourne 409; toutes les valeurs hors contrat sont
refusées sans arrondi.

## Scénario 3 — Audit atomique

1. Modifier une fiche dans chaque domaine.
2. Vérifier acteur, rôle, cible, avant/après, IP, date et request id.
3. Vérifier qu'aucun mot de passe, cookie ou token n'apparaît.
4. Provoquer un échec d'insertion d'audit dans la base de test.

Résultat attendu : chaque succès a exactement un audit; l'échec audit annule la
mutation. Aucun rôle ne peut modifier ou supprimer un événement.

## Scénario 4 — Contre-écriture

1. Enregistrer un don, une dépense et un paiement.
2. Vérifier leur présence au grand livre et dans les totaux.
3. Tenter modification et suppression directes après comptabilisation.
4. Créer une contre-écriture avec motif et répéter la même requête.

Résultat attendu : sources immuables; une seule contre-écriture opposée; effet net
zéro; original toujours visible et rapprochable.

## Scénario 5 — Séparation Social

1. Enregistrer `100.00` dans une caisse Social.
2. Distribuer `40.00`, puis tenter `70.00`.
3. Consulter dashboard, finances, bilan général et bilan Social.
4. Lancer deux distributions concurrentes dont la somme dépasse le disponible.

Résultat attendu : disponible `60.00`; la seconde dépense excessive est refusée;
au plus une requête concurrente incompatible réussit; aucun montant Social ne
contamine les totaux généraux.

## Scénario 6 — Stock

1. Partir d'une quantité 5 et sortir 3.
2. Tenter ensuite de sortir 3, puis deux sorties concurrentes de 2.
3. Vérifier l'alerte quand la quantité atteint le seuil.

Résultat attendu : quantité 2 après la première sortie; sortie excessive refusée
sans clamp; aucune concurrence ne produit une quantité négative; audit avant/après
présent.

## Scénario 7 — Bilans et exports

1. Créer des données générales et sociales sur deux années.
2. Générer chaque bilan et rapprocher chaque total avec son détail.
3. Appliquer un filtre à chaque liste exportable puis produire Excel `.xlsx` et
   PDF.

Résultat attendu : bornes annuelles exactes, zéros pour périodes vides, totaux en
chaînes EUR, Social séparé et exports identiques aux lignes visibles avec accents.

## Scénario 8 — Historique et référentiels

1. Utiliser une catégorie, classe, type RH ou caisse dans une opération.
2. Renommer puis désactiver la référence.
3. Vérifier l'ancienne opération et tenter une nouvelle saisie avec cette valeur.
4. Tenter de supprimer une personne ou référence liée à l'historique.

Résultat attendu : libellé historique stable; référence absente des nouvelles
saisies; suppression destructive refusée et désactivation proposée.
