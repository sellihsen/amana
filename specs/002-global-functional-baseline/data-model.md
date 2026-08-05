# Modèle de données

Ce document décrit l'état cible. Les migrations historiques `001` à `011` ne
sont jamais modifiées; les évolutions commencent à `012`.

## Principes de stockage

- PostgreSQL est l'unique autorité pour le schéma et l'arithmétique financière.
- Les montants sont des `NUMERIC(12,2)` exacts appartenant à un domaine EUR;
  l'API impose exactement deux décimales avant tout cast.
- Les tables métier conservent le détail fonctionnel; le grand livre constitue
  l'autorité pour les totaux financiers.
- Une écriture comptabilisée, une contre-écriture et un audit sont append-only.
- Les références historiques sont protégées par `RESTRICT` ou désactivation,
  jamais supprimées en cascade.

## Domaine `montant_eur`

Deux domaines décimaux exacts :

- `montant_eur_positif NUMERIC(12,2)`, de `0.01` à `9999999999.99`;
- `montant_eur_non_negatif NUMERIC(12,2)`, de `0.00` à `9999999999.99`;
- devise implicite `EUR` pour toutes les tables de cette application.

L'API valide la chaîne à exactement deux décimales avant insertion; PostgreSQL
fournit ensuite l'échelle explicite et les bornes exigées par la constitution.

## Utilisateur (`utilisateurs`)

### Champs

| Champ | Règle |
|-------|-------|
| `id` | Identifiant existant |
| `nom` | Requis, 1–100 caractères |
| `email` | Requis, unique sans distinction de casse |
| `mot_de_passe_hash` | Requis, jamais retourné ni audité |
| `role` | `admin`, `tresorier` ou `lecteur` |
| `statut` | `actif` ou `inactif`, défaut `actif` |
| `auth_version` | Entier positif, défaut 1 |
| `desactive_at` | Date nullable |
| `desactive_par` | Utilisateur admin nullable |
| `created_at`, `updated_at` | Dates gérées en base |

### Transitions

- création → `actif`;
- `actif` → `inactif` par administrateur;
- changement de rôle, mot de passe ou statut → incrément `auth_version`;
- le dernier administrateur actif ne peut devenir inactif, lecteur ou trésorier;
- un administrateur ne peut supprimer son compte courant;
- un utilisateur auteur d'un historique est désactivé plutôt que supprimé.

## Registre de migrations (`schema_migrations`)

| Champ | Règle |
|-------|-------|
| `version` | Nom/version du fichier, clé primaire |
| `checksum` | SHA-256 du contenu appliqué |
| `applied_at` | Horodatage base |
| `execution_ms` | Durée non négative |

Le runner prend un verrou advisory, refuse un checksum modifié, applique chaque
migration pending dans une transaction et enregistre la version après succès.
Les versions historiques sont baselinées seulement si leurs objets attendus sont
présents.

## Grand livre (`ecritures_financieres`)

### Champs

| Champ | Règle |
|-------|-------|
| `id` | `BIGSERIAL`, clé primaire |
| `type_ecriture` | `DON`, `COTISATION_MEMBRE`, `ECOLAGE`, `DEPENSE`, `PAIEMENT_SALAIRE`, `DISTRIBUTION_SOCIALE`, `CONTRE_ECRITURE` |
| `perimetre` | `GENERAL` ou `SOCIAL` |
| `sens` | `CREDIT` ou `DEBIT` |
| `montant` | `montant_eur_positif` |
| `devise` | Toujours `EUR` |
| `date_effet` | Date métier requise |
| `source_type`, `source_id` | Type stable et identifiant de la table métier |
| `caisse_id` | Requis pour don et distribution sociale |
| `cree_par` | Utilisateur nullable pour historique |
| `acteur_nom`, `acteur_role` | Snapshot immuable; `Système` si inconnu |
| `contre_ecriture_de` | Auto-référence nullable, unique |
| `motif` | Requis pour une contre-écriture |
| `idempotency_id` | Référence unique à la demande |
| `created_at` | Horodatage base immuable |

### Invariants

- Une source ordinaire possède au plus une écriture comptable.
- Une écriture ordinaire possède au plus une contre-écriture.
- La contre-écriture reprend montant, devise, périmètre et caisse de l'original,
  inverse le sens, exige un motif et ne peut viser une autre contre-écriture.
- Aucune ligne ne peut être modifiée ou supprimée.
- Les totaux GENERAL ignorent SOCIAL; les totaux SOCIAL ignorent GENERAL.
- Une affectation de caisse modifiée ultérieurement ne requalifie jamais le passé.

### Liens aux sources

Ajouter `ecriture_id` unique aux tables :

- `dons`;
- `cotisations` lorsqu'elles deviennent payées;
- `depenses`;
- `paiements_salaires`;
- `cotisations_madrasa` lorsqu'elles deviennent payées;
- `distributions_sociales`.

Ajouter `cree_par` aux sources qui ne le possèdent pas. Une source avec
`ecriture_id` ne peut plus changer de montant, période, statut comptable, caisse
ou bénéficiaire et ne peut être supprimée.

## Audit (`logs_activite` enrichi)

La table existante est conservée afin de ne pas créer deux journaux.

| Champ | Règle |
|-------|-------|
| `id` | Identifiant existant |
| `type_evenement` | Code stable référencé par `types_evenement_audit` |
| `resultat` | `SUCCES` ou `REFUS`; `ECHEC` réservé aux événements sans mutation métier |
| `acteur_type` | `UTILISATEUR`, `SYSTEME` ou `MIGRATION` |
| `utilisateur_id` | FK nullable |
| `utilisateur_nom`, `acteur_role` | Snapshot immuable |
| `entite_type`, `entite_id` | Cible stable |
| `avant`, `apres` | JSONB nullable, secrets supprimés |
| `request_id` | UUID de corrélation |
| `ip` | Adresse client validée |
| `user_agent` | Texte borné nullable |
| `date_action` | Horodatage base |

### Catalogue (`types_evenement_audit`)

Codes non localisés et non réutilisables, par exemple : `auth.login.succeeded`,
`auth.login.failed`, `user.created`, `member.updated`, `don.posted`,
`financial-entry.reversed`, `social-distribution.posted`, `stock.changed`.

### Invariants

- `UPDATE` et `DELETE` sont refusés en base.
- Une mutation métier et son événement `SUCCES` utilisent la même transaction.
- L'échec de l'insertion d'audit annule la mutation.
- Mots de passe, hashes, cookies, tokens et données personnelles non nécessaires
  sont interdits dans `avant` et `apres`.
- Les lignes historiques gardent leur action libre et reçoivent un type
  `legacy.activity` lors du backfill.

## Idempotence (`demandes_idempotentes`)

| Champ | Règle |
|-------|-------|
| `id` | `BIGSERIAL` |
| `utilisateur_id` | Acteur requis |
| `operation` | Code stable de mutation |
| `cle` | 1–128 caractères |
| `empreinte_requete` | Hash du corps canonique |
| `statut` | `EN_COURS` ou `TERMINEE` |
| `http_status`, `response_body` | Résultat réussi mémorisé |
| `ressource_type`, `ressource_id` | Cible créée |
| `created_at`, `completed_at` | Horodatages |

Contrainte unique `(utilisateur_id, operation, cle)`. Même clé et même empreinte
retournent le résultat initial; même clé et empreinte différente donnent un
conflit. La ligne termine dans la transaction métier.

## Caisses et Social

`caisses` conserve `affectation` parmi `Chantier`, `Fonctionnement`, `Social` et
un état actif. `dons.caisse_id` et `distributions_sociales.caisse_origine_id`
deviennent non nuls et `ON DELETE RESTRICT`.

### Distribution sociale

Toute mutation Social (don, distribution ou contre-écriture) suit dans une seule
transaction :

1. verrouiller la caisse cible;
2. pour un nouveau don ou une nouvelle distribution, vérifier qu'elle est active
   et actuellement Social; pour une contre-écriture, utiliser le périmètre Social
   capturé par l'original même si la caisse a depuis été désactivée ou réaffectée;
3. calculer le disponible depuis les écritures SOCIAL de cette caisse;
4. refuser toute mutation qui rend le disponible négatif;
5. écrire source, grand livre, idempotence et audit;
6. commit.

Aucune table de solde Social n'est ajoutée; le grand livre est l'autorité.

## Stock (`produits_stock`)

Ajouter les contraintes :

- `quantite_actuelle >= 0`;
- `quantite_minimale_alerte >= 0`;
- quantités entières;
- `actif` non nul, défaut vrai.

Une entrée utilise une addition SQL. Une sortie utilise une soustraction
conditionnelle sur `quantite_actuelle >= quantité`; zéro ligne modifiée indique
un stock insuffisant. La quantité courante ne peut plus être changée par la mise
à jour des métadonnées. Avant/après sont conservés dans l'audit atomique.

## Référentiels configurables

Les catégories de dépenses, classes Madrasa et types de paiement RH deviennent
des FK réelles depuis les tables métier, avec :

- identifiant de référence;
- libellé snapshot conservé dans la source historique;
- état actif vérifié au moment de la nouvelle opération;
- `ON DELETE RESTRICT` si une opération existe.

Les anciennes contraintes textuelles fermées sont retirées après backfill et
vérification.

## Périodes et unicité

- `cotisations_madrasa` remplace le mois libre par une date canonique au premier
  jour du mois et garde l'unicité `(eleve_id, periode)`.
- Les cotisations annuelles obtiennent une contrainte qui traite l'absence de mois
  comme une valeur unique, contrairement au comportement nullable actuel.
- Les doublons historiques doivent être résolus explicitement avant contrainte.

## Relations historiques protégées

Remplacer les cascades par `RESTRICT` pour :

- cotisation → membre;
- paiement salaire → personnel;
- écolage → élève;
- distribution → famille;
- écriture → caisse et source.

La désactivation remplace la suppression lorsqu'une relation historique existe.

## Ordre des migrations

1. Runner et baseline du registre de migrations; toutes les nouvelles migrations
   restent idempotentes indépendamment du tracking.
2. Statut/version utilisateur, audit structuré append-only et contraintes de rôles.
3. Idempotence.
4. Domaines EUR et préflight des données existantes.
5. Grand livre, backfill et rapprochement des totaux.
6. FKs historiques `RESTRICT`, périodes et unicités corrigées.
7. Contraintes et historique Social.
8. Contraintes stock.
9. Référentiels normalisés et snapshots, après résolution des données historiques.

Chaque migration s'arrête avec un diagnostic si des données existantes ne peuvent
être classées sans décision humaine : caisse nulle, solde Social négatif, stock
négatif, période ambiguë ou doublon.
