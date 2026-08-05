# Recherche et décisions techniques

## 1. Architecture applicative

**Décision**: Conserver l'architecture actuelle route Express → PostgreSQL et les
pages React; ajouter uniquement des modules partagés pour autorisation,
transaction/audit, argent, idempotence, erreurs et agrégats financiers.

**Rationale**: Les écarts sont transverses, mais aucune exigence ne justifie une
réécriture en contrôleurs/services/repositories. Des helpers ciblés rendent les
règles uniques et testables conformément au Principe V.

**Alternatives considérées**: Couche service/repository complète rejetée comme
migration risquée et non nécessaire; maintien de la duplication rejeté car il ne
peut garantir des permissions et calculs uniformes.

## 2. Tests backend

**Décision**: Jest 30.2 et Supertest 7.1, tests d'intégration séquentiels contre
une base PostgreSQL 14+ jetable créée pour chaque exécution.

**Rationale**: Jest fonctionne avec le backend CommonJS et Node 18; Supertest
exerce toute la pile Express sans port. PostgreSQL réel est indispensable pour
`NUMERIC`, contraintes, verrous, concurrence, rollback et agrégats. Les migrations
de production créent le schéma de test.

**Alternatives considérées**: `node:test` de Node 18 encore expérimental; Vitest
ajouterait ESM au backend; `pg-mem` ne reproduit pas suffisamment PostgreSQL;
Testcontainers impose Docker absent du projet.

## 3. Tests frontend

**Décision**: Vitest 3.2, jsdom 26, Testing Library React 16, user-event 14 et
jest-dom 6.

**Rationale**: Ces versions restent compatibles avec Node 18, Vite 5 et React 18.
Les tests portent sur le comportement visible : gardes de rôle, formulaires,
401/403, filtres et données transmises aux exports.

**Alternatives considérées**: Jest dupliquerait la configuration Vite; une suite
Playwright complète est reportée jusqu'à stabilisation des contrats et ne remplace
pas les tests PostgreSQL/API.

## 4. Sessions et sécurité navigateur

**Décision**: Conserver une session signée de huit heures mais la transporter dans
un cookie `HttpOnly`, `Secure` en production et `SameSite=Strict`; vérifier
l'origine des mutations, le compte actif, `auth_version` et le rôle courant à
chaque requête. Ajouter Helmet, une limite de corps et un rate limit de connexion.

**Rationale**: Le stockage local actuel expose la session à tout script injecté et
le rôle incorporé devient obsolète. Le cookie répond au socle XSS de la
constitution; le rechargement du compte rend suppression, désactivation et
rétrogradation immédiates.

**Alternatives considérées**: Session persistée côté navigateur rejetée pour XSS;
session opaque serveur rejetée car elle ajoute un store sans nécessité locale;
refresh tokens rejetés hors périmètre.

## 5. Autorisation

**Décision**: Une matrice serveur unique distingue lecture, écriture métier et
administration. `admin` reçoit les trois, `tresorier` lecture + écriture métier,
`lecteur` lecture. Le frontend réutilise les mêmes concepts uniquement pour la
présentation.

**Rationale**: Cela matérialise FR-006 et évite le modèle actuel où chaque route
doit se souvenir d'une garde.

**Alternatives considérées**: Contrôles uniquement par préfixe de route rejetés
car des lectures et écritures partagent les mêmes routers; ACL configurables
rejetées car trois rôles fixes suffisent.

## 6. Argent exact

**Décision**: L'API accepte et retourne des chaînes `EUR` au format
`^(0|[1-9][0-9]*)\.[0-9]{2}$`. PostgreSQL utilise des domaines explicites
`NUMERIC(12,2)`: positif (`0.01` à `9999999999.99`) ou non négatif (`0.00` à
`9999999999.99`). La validation de chaîne intervient avant le cast afin de refuser
toute précision supplémentaire. Tous les agrégats sont calculés en SQL.

**Rationale**: `NUMERIC(p,2)` peut arrondir avant validation et les nombres JSON
sont binaires. Une chaîne validée permet de refuser la précision supplémentaire
comme FR-011 l'exige.

**Alternatives considérées**: Centimes entiers rejetés car la migration de toutes
les colonnes et requêtes n'apporte rien face à `NUMERIC`; bibliothèque décimale JS
rejetée car l'application ne doit pas calculer les totaux.

## 7. Grand livre et contre-écritures

**Décision**: Ajouter un grand livre append-only relié aux six tables source. Une
écriture validée reçoit une ligne CREDIT/DEBIT dans le périmètre GENERAL/SOCIAL.
Une correction ajoute une ligne opposée du même montant référant l'original;
l'original et sa source deviennent immuables.

**Rationale**: Une seule structure permet l'immutabilité, les contre-écritures et
des agrégats cohérents sans effacer le détail métier.

**Alternatives considérées**: Colonnes d'annulation différentes dans six tables
rejetées pour duplication; remplacer toutes les tables métier par le grand livre
rejeté car elles contiennent le détail fonctionnel nécessaire.

## 8. Audit atomique

**Décision**: Faire évoluer `logs_activite` au lieu de créer un second journal.
Ajouter type stable, résultat, cible, avant/après, snapshot acteur et request id;
installer une protection DB contre update/delete. Le helper reçoit le client de
transaction et ne masque jamais un échec.

**Rationale**: Cela conserve les événements historiques et établit une seule
source d'audit. Le business write et l'audit partagent connexion et transaction.

**Alternatives considérées**: Nouvelle table avec migration des logs rejetée comme
duplication temporaire; audit asynchrone rejeté par la constitution.

## 9. Idempotence

**Décision**: Une table d'idempotence indexée par acteur, opération et clé protège
les créations financières, contre-écritures, distributions et variations stock.
Même clé/même contenu retourne le résultat initial; même clé/contenu différent
retourne 409.

**Rationale**: Les contraintes naturelles ne suffisent pas aux dons, dépenses,
salaires ou doubles clics. La ligne d'idempotence commit avec la mutation.

**Alternatives considérées**: Désactiver seulement le bouton rejeté car un retry
réseau ou appel direct reste possible; déduplication heuristique par montant/date
rejetée car elle confond des opérations légitimes.

## 10. Solde Social

**Décision**: Toute mutation du grand livre Social — don, distribution ou
contre-écriture — verrouille d'abord la caisse concernée, recalcule son disponible
depuis le grand livre avec agrégats séparés et ne commit que si le résultat reste
non négatif.

**Rationale**: Le verrou sérialise les dons, distributions et contre-écritures de
la caisse sans créer un second solde mutable. Il supprime également le fan-out de
la requête actuelle.

**Alternatives considérées**: Table de projection de solde rejetée comme seconde
source de vérité; contrôle frontend rejeté pour concurrence et appels directs.

## 11. Stock

**Décision**: Conserver `quantite_actuelle`, ajouter des contraintes non négatives
et effectuer une sortie par `UPDATE ... WHERE quantite_actuelle >= quantité`.
Zéro ligne modifiée signifie 409. L'audit atomique conserve avant/après.

**Rationale**: FR-024 exige l'absence de stock négatif, pas un journal métier de
mouvements. Cette approche est atomique et minimale.

**Alternatives considérées**: `GREATEST(0, ...)` rejeté car il masque l'erreur;
table de mouvements rejetée car EVO-012 est explicitement hors périmètre.

## 12. Référentiels et historique

**Décision**: Remplacer les valeurs textuelles contraintes par des références
vers les tables administrables tout en conservant un libellé snapshot sur les
opérations historiques; remplacer les cascades financières par `RESTRICT` et la
suppression métier par désactivation lorsque l'historique existe.

**Rationale**: Les valeurs configurables doivent devenir sélectionnables sans
modifier le schéma, et une modification de libellé ne doit pas réécrire le passé.

**Alternatives considérées**: Validation applicative de noms sans FK rejetée pour
les courses et incohérences; FK sans snapshot rejetée car elle change le rendu
historique lors d'un renommage.

## 13. Migrations

**Décision**: Le runner crée/valide `schema_migrations`, prend un advisory lock,
compare les checksums et applique chaque fichier pending dans sa transaction.
Chaque nouvelle migration reste elle-même idempotente (`IF NOT EXISTS`, gardes et
upserts convergents). Les 11 migrations historiques sont baselinées après
vérification des objets attendus; elles ne sont jamais modifiées.

**Rationale**: Cela respecte l'autorité unique du schéma et évite les réexécutions
ou déploiements partiels non diagnostiqués.

**Alternatives considérées**: Tracking sans idempotence rejeté car il ne protège
pas une reprise manuelle ou un échec avant enregistrement; idempotence sans tracking
rejetée car elle ne détecte pas les checksums modifiés; outil ORM/migration externe
rejeté comme dépendance et modèle parallèle inutiles.

## 14. CI et commandes

**Décision**: Un job Linux utilise Node 18.20 et PostgreSQL 14, exécute `npm ci`
dans backend/frontend, puis tests backend séquentiels, tests frontend et build.

**Rationale**: Il vérifie le minimum supporté et transforme les principes argent
et accès en barrière de fusion.

**Alternatives considérées**: Matrice multi-versions reportée; pourcentages de
couverture arbitraires rejetés au profit de la couverture de tous les scénarios
financiers et de permissions.
