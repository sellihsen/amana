# Spécification de fonctionnalité : Référentiel fonctionnel global

**Feature Branch**: `002-global-functional-baseline`

**Créé le**: 2026-08-04

**Statut**: Brouillon - référentiel initial de l'existant

**Source**: Description utilisateur issue principalement de `README.md`

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Accéder selon son rôle (Priorité : P1)

En tant qu'utilisateur autorisé, je veux ouvrir une session et accéder uniquement
aux fonctions permises par mon rôle afin que les données personnelles et
financières restent protégées.

**Pourquoi cette priorité**: Toutes les autres fonctions dépendent d'une identité
fiable et d'un contrôle d'accès cohérent.

**Test indépendant**: Se connecter successivement avec chaque rôle, consulter une
page métier et tenter une action administrative directe; seuls les accès permis
sont accordés.

**Scénarios d'acceptation**:

1. **Étant donné** des identifiants valides, **lorsque** l'utilisateur se connecte,
   **alors** il accède au tableau de bord avec son rôle pendant une session d'une
   durée maximale de huit heures.
2. **Étant donné** une session absente, expirée ou invalide, **lorsqu'une** fonction
   protégée est demandée, **alors** l'accès est refusé sans enregistrer d'action.
3. **Étant donné** un non-administrateur, **lorsque** la section Administration est
   demandée directement, **alors** l'accès est refusé indépendamment de l'interface.
4. **Étant donné** un administrateur connecté, **lorsqu'il** tente de supprimer son
   propre compte, **alors** l'opération est refusée.

---

### User Story 2 - Piloter les finances courantes (Priorité : P1)

En tant que responsable financier, je veux enregistrer les dons, cotisations,
dépenses et salaires et consulter des totaux exacts afin de connaître la situation
financière réelle de la mosquée.

**Pourquoi cette priorité**: La tenue fiable des fonds confiés est la valeur
principale du produit.

**Test indépendant**: Enregistrer une opération de chaque nature, puis vérifier le
tableau de bord et le bilan annuel à partir du détail des opérations.

**Scénarios d'acceptation**:

1. **Étant donné** des dons hors Social, des cotisations membres payées et des
   écolages payés, **lorsque** le tableau de bord est consulté, **alors** leur somme
   constitue le total des entrées.
2. **Étant donné** des dépenses directes et des paiements de salaire, **lorsque** le
   tableau de bord est consulté, **alors** leur somme constitue le total des
   dépenses et le solde vaut entrées moins dépenses.
3. **Étant donné** un don destiné à une caisse Social, **lorsque** les finances
   générales sont calculées, **alors** ce don en est exclu et reste visible dans le
   bilan social.
4. **Étant donné** une année choisie, **lorsque** le bilan est généré, **alors** il
   ne contient que les opérations de cette année et ses totaux correspondent au
   détail présenté.
5. **Étant donné** une erreur lors de l'enregistrement ou de son audit, **lorsque**
   une écriture financière est soumise, **alors** aucune partie de l'opération
   n'est conservée.
6. **Étant donné** une écriture financière validée comportant une erreur,
   **lorsqu'un** utilisateur autorisé la corrige, **alors** l'écriture d'origine
   reste inchangée et une contre-écriture attribuable annule son effet avant la
   saisie éventuelle de la valeur correcte.

---

### User Story 3 - Gérer les personnes et leurs contributions (Priorité : P1)

En tant qu'utilisateur métier autorisé, je veux gérer les membres, le personnel,
les élèves et leurs opérations associées afin de conserver un registre exploitable
sans perdre l'historique.

**Pourquoi cette priorité**: Les opérations financières et sociales sont liées à
des personnes dont l'historique doit rester cohérent.

**Test indépendant**: Créer, retrouver, modifier et désactiver un membre, un
employé et un élève, puis vérifier leurs contributions et paiements associés.

**Scénarios d'acceptation**:

1. **Étant donné** une fiche membre valide, **lorsqu'elle** est créée ou modifiée,
   **alors** elle apparaît immédiatement dans la liste et la recherche avec son
   statut actuel.
2. **Étant donné** un employé lié à des paiements, **lorsque** sa suppression est
   demandée, **alors** elle est refusée et sa désactivation reste possible.
3. **Étant donné** un élève ayant déjà un écolage pour un mois, **lorsqu'un** second
   écolage est saisi pour le même mois, **alors** il est refusé.
4. **Étant donné** une référence désactivée liée à un historique, **lorsqu'une**
   nouvelle opération est saisie, **alors** la référence n'est plus proposée mais
   les anciennes opérations restent consultables.

---

### User Story 4 - Isoler l'aide sociale (Priorité : P1)

En tant que responsable de la solidarité, je veux gérer les familles, les fonds
sociaux et les distributions afin de connaître les sommes collectées, distribuées
et disponibles sans les mélanger aux finances générales.

**Pourquoi cette priorité**: Les fonds affectés à la solidarité ont une destination
spécifique qui doit rester démontrable.

**Test indépendant**: Enregistrer un don dans une caisse Social puis une
distribution à une famille et vérifier les bilans social et général.

**Scénarios d'acceptation**:

1. **Étant donné** un don vers une caisse Social, **lorsqu'il** est enregistré,
   **alors** il augmente le collecté social sans augmenter les entrées générales.
2. **Étant donné** une famille et une caisse Social suffisamment approvisionnée,
   **lorsqu'une** distribution est enregistrée, **alors** le distribué augmente et
   le restant diminue du même montant.
3. **Étant donné** une distribution supérieure au restant disponible,
   **lorsqu'elle** est soumise, **alors** elle est refusée sans modifier le bilan.

---

### User Story 5 - Suivre les stocks (Priorité : P2)

En tant que gestionnaire, je veux connaître les quantités disponibles et les
produits critiques afin d'anticiper les ruptures.

**Pourquoi cette priorité**: Les alertes stock soutiennent les opérations mais ne
conditionnent pas l'intégrité du registre financier.

**Test indépendant**: Créer un produit, enregistrer une entrée puis des sorties et
vérifier sa quantité et son état d'alerte sur la liste et le tableau de bord.

**Scénarios d'acceptation**:

1. **Étant donné** un produit, **lorsqu'une** entrée ou une sortie valide est
   enregistrée, **alors** sa quantité varie exactement de la valeur demandée.
2. **Étant donné** une quantité inférieure ou égale au seuil, **lorsque** le stock
   est consulté, **alors** le produit est signalé comme critique sur la liste et le
   tableau de bord.
3. **Étant donné** une sortie supérieure à la quantité disponible, **lorsqu'elle**
   est soumise, **alors** elle est refusée et la quantité reste inchangée.

---

### User Story 6 - Administrer les référentiels (Priorité : P2)

En tant qu'administrateur, je veux gérer les utilisateurs, caisses, catégories,
classes, types de paiement et paramètres du projet afin d'adapter l'application
sans altérer son historique.

**Pourquoi cette priorité**: Les référentiels conditionnent les nouvelles saisies
de tous les modules métier.

**Test indépendant**: Créer puis désactiver une valeur de chaque référentiel et
vérifier son effet sur une nouvelle saisie et sur une opération historique.

**Scénarios d'acceptation**:

1. **Étant donné** une nouvelle catégorie, classe ou type de paiement actif,
   **lorsque** le formulaire correspondant est ouvert, **alors** cette valeur est
   proposée.
2. **Étant donné** une valeur désactivée, **lorsqu'une** nouvelle opération est
   saisie, **alors** elle n'est plus proposée et son historique reste lisible.
3. **Étant donné** un non-administrateur, **lorsqu'il** tente une modification de
   configuration, **alors** elle est refusée sans changement.

---

### User Story 7 - Auditer toutes les opérations (Priorité : P1)

En tant qu'administrateur, je veux retrouver qui a fait quoi, quand et sur quelle
donnée afin d'expliquer toute modification sensible.

**Pourquoi cette priorité**: Une opération financière sans preuve attribuable ne
peut pas être considérée comme fiable.

**Test indépendant**: Réaliser une modification dans chaque module, filtrer
l'historique par acteur, type et date, puis simuler une indisponibilité de l'audit.

**Scénarios d'acceptation**:

1. **Étant donné** une modification métier autorisée, **lorsqu'elle** réussit,
   **alors** une trace immuable contient l'acteur, l'action, la date, la donnée
   concernée, les valeurs modifiées et la source cliente.
2. **Étant donné** une ancienne opération sans auteur identifiable, **lorsqu'elle**
   est affichée, **alors** son auteur apparaît comme `Système` sans attribution
   artificielle.
3. **Étant donné** une défaillance d'audit, **lorsqu'une** modification est tentée,
   **alors** la modification est annulée.
4. **Étant donné** un administrateur, **lorsqu'il** filtre l'audit, **alors** les
   événements correspondants sont paginés sans permettre leur altération.

---

### User Story 8 - Exploiter et vérifier les données (Priorité : P3)

En tant qu'utilisateur métier, je veux exporter les listes visibles et consulter
une documentation à jour des échanges disponibles afin de contrôler ou partager
les données dans un format lisible.

**Pourquoi cette priorité**: Les exports et la documentation facilitent le
contrôle, mais les opérations métier restent possibles sans eux.

**Test indépendant**: Appliquer des filtres à chaque liste exportable, produire les
deux formats proposés et vérifier un échange documenté protégé.

**Scénarios d'acceptation**:

1. **Étant donné** une liste filtrée, **lorsqu'un** export est demandé, **alors** il
   reprend les lignes visibles avec des colonnes lisibles, les dates, montants et
   caractères accentués correctement restitués.
2. **Étant donné** une évolution d'un échange, **lorsque** sa documentation est
   consultée, **alors** elle décrit le comportement et les accès réels.

### Edge Cases

- Une période sans opération retourne des totaux à zéro plutôt qu'une erreur.
- Une soumission répétée ou un double clic ne crée pas deux écritures financières.
- Un montant nul, négatif, invalide ou hors limite est refusé.
- Une session expirant pendant une saisie refuse l'opération sans l'enregistrer
  partiellement.
- La désactivation d'une personne ou d'un référentiel conserve toutes les
  relations historiques et les rend encore lisibles dans les bilans et exports.
- Une caisse inactive refuse toute nouvelle opération tout en conservant son
  historique.
- Une référence liée à un historique ne peut être supprimée si cette suppression
  rendrait l'historique incohérent.
- Les caractères français et les noms issus du vocabulaire islamique restent
  identiques à l'écran et dans les exports.

## Requirements *(mandatory)*

### Functional Requirements

#### Accès et utilisateurs

- **FR-001**: Toute fonction métier MUST exiger une session authentifiée, sauf les
  fonctions publiques explicitement autorisées.
- **FR-002**: Une session MUST expirer au plus tard huit heures après sa création
  et une session absente, expirée ou refusée MUST déclencher une nouvelle
  authentification.
- **FR-003**: L'Administration et l'audit MUST être accessibles uniquement aux
  administrateurs, y compris lorsqu'ils sont demandés directement.
- **FR-004**: Un administrateur MUST pouvoir gérer les comptes sans pouvoir
  supprimer son propre compte actif.
- **FR-005**: Le système MUST appliquer côté serveur les permissions de chaque
  rôle pour toute lecture et toute modification.
- **FR-006**: `admin` MUST disposer de tous les droits; `tresorier` MUST pouvoir
  consulter et gérer les opérations métier hors Administration; `lecteur` MUST
  pouvoir uniquement consulter. La spécification `001-secure-access-audit`
  définit la matrice détaillée qui fait autorité.

#### Finances et tableau de bord

- **FR-007**: Le tableau de bord MUST afficher le solde, les entrées, les dépenses,
  les dons, les cotisations membres, les écolages, les indicateurs RH et Madrasa,
  les alertes stock, douze mois de dons et les opérations récentes.
- **FR-008**: Les entrées générales MUST être la somme des dons hors Social, des
  cotisations membres payées et des écolages payés.
- **FR-009**: Les dépenses générales MUST être la somme des dépenses directes et
  des paiements de salaire; le solde général MUST être les entrées moins les
  dépenses.
- **FR-010**: Les agrégats MUST être recalculables depuis les opérations persistées
  et toute opération financière liée MUST être enregistrée sans état partiel.
- **FR-011**: Tous les montants MUST être exprimés en euros avec exactement deux
  décimales de précision; une saisie comportant une précision supérieure au
  centime MUST être refusée sans arrondi implicite.
- **FR-012**: Une écriture financière validée MUST être immuable. Sa correction ou
  son annulation MUST être réalisée par une contre-écriture attribuable qui
  référence l'écriture d'origine et en neutralise exactement l'effet; l'original
  MUST rester consultable.

#### Registres et opérations métier

- **FR-013**: Le système MUST permettre de créer, consulter, modifier, rechercher,
  désactiver et, lorsque l'historique le permet, supprimer les membres avec leurs
  coordonnées, date d'adhésion et statut.
- **FR-014**: Chaque don MUST avoir un montant positif et une caisse active; il
  MAY être anonyme ou lié à un membre.
- **FR-015**: Les cotisations membres MUST conserver membre, période, montant et
  statut; seules les cotisations payées MUST contribuer aux entrées.
- **FR-016**: Chaque dépense MUST avoir un montant positif et une catégorie active,
  diminuer le solde général et afficher son auteur ou `Système` pour l'historique
  sans auteur.
- **FR-017**: Le système MUST gérer les fiches du personnel, leur poste, salaire de
  base et statut, et MUST refuser la suppression d'un employé lié à des paiements.
- **FR-018**: Chaque paiement RH MUST conserver bénéficiaire, type actif, montant,
  période et auteur et MUST contribuer aux dépenses générales.
- **FR-019**: Le système MUST gérer les élèves, parent, classe et statut et MUST
  filtrer les élèves par classe et statut.
- **FR-020**: Un seul écolage par élève et par mois MUST être accepté; seuls les
  écolages payés MUST contribuer aux entrées générales.

#### Social, stocks et bilans

- **FR-021**: Le système MUST gérer les familles, leurs ressources, composition et
  historique des aides.
- **FR-022**: Une distribution sociale MUST être liée à une famille et à une caisse
  Social active et MUST être refusée si elle dépasse le restant disponible.
- **FR-023**: Pour chaque caisse Social, le bilan social MUST afficher collecté,
  distribué et restant sans inclure ces montants dans les finances générales.
- **FR-024**: Le système MUST gérer les produits, catégories, quantités et seuils,
  et MUST enregistrer exactement chaque entrée et sortie sans quantité négative.
- **FR-025**: Un produit dont la quantité est inférieure ou égale au seuil MUST
  apparaître comme critique dans le stock et sur le tableau de bord.
- **FR-026**: Le bilan annuel MUST inclure uniquement les opérations de l'année
  choisie, permettre le rapprochement des totaux avec leur détail et séparer les
  fonds sociaux.

#### Administration, audit et exploitation

- **FR-027**: L'administrateur MUST pouvoir gérer l'état et l'affectation des
  caisses, les catégories de dépenses, les classes Madrasa, les types de paiement
  RH, les utilisateurs et les paramètres du projet.
- **FR-028**: Une option ou caisse désactivée MUST disparaître des nouvelles
  saisies sans altérer les opérations historiques qui l'utilisent.
- **FR-029**: Chaque changement d'état MUST produire une trace d'audit immuable et
  attribuable dans la même opération indivisible que le changement métier.
- **FR-030**: Une trace d'audit MUST contenir acteur, action, date, entité affectée,
  valeurs modifiées et source cliente, sans donnée personnelle non nécessaire ni
  secret.
- **FR-031**: L'administrateur MUST pouvoir filtrer l'audit par recherche, type,
  dates et pagination sans pouvoir modifier ou supprimer les événements.
- **FR-032**: Les listes des membres, dons, cotisations, dépenses, personnel,
  paiements RH, élèves, écolages et stock MUST être exportables dans les deux
  formats bureautiques annoncés en respectant les filtres actifs.
- **FR-033**: La documentation des échanges MUST décrire les fonctions, données,
  erreurs et permissions réellement disponibles et évoluer avec elles.

### Key Entities

- **Utilisateur**: Compte authentifié, rôle et auteur des opérations et audits.
- **Membre**: Fidèle inscrit, lié à ses dons et cotisations.
- **Don**: Somme reçue, affectée à une caisse et éventuellement à un membre.
- **Caisse**: Destination active ou historique d'un don, affectée à `Chantier`,
  `Fonctionnement` ou `Social`.
- **Cotisation membre**: Contribution périodique d'un membre avec statut.
- **Dépense**: Sortie financière catégorisée et attribuée à un auteur.
- **Personnel et paiement RH**: Employé et versements qui lui sont attribués.
- **Élève et écolage**: Inscription Madrasa et paiement mensuel associé.
- **Famille et distribution sociale**: Bénéficiaire et aide issue d'une caisse
  Social.
- **Produit**: Article ou matériau avec quantité courante et seuil d'alerte.
- **Configuration**: Valeurs administrables utilisées par les nouvelles saisies.
- **Projet**: Budget et capacités du projet de construction.
- **Événement d'audit**: Trace immuable reliant une action à son acteur et à la
  donnée affectée.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100 % des opérations financières enregistrées sont attribuables à
  un acteur et une date, ou explicitement identifiées comme historiques par
  `Système`.
- **SC-002**: 100 % des agrégats affichés peuvent être recalculés exactement depuis
  le détail des opérations qui les composent.
- **SC-003**: Lors de chaque erreur simulée sur une opération liée, aucune écriture
  partielle ne subsiste.
- **SC-004**: Dans la matrice complète des rôles et actions, 100 % des appels
  directs non autorisés sont refusés sans changement de données.
- **SC-005**: Pour chaque période vérifiée, les bilans général et social restent
  séparés et leurs totaux correspondent à leurs opérations sources.
- **SC-006**: Une alerte stock apparaît pour 100 % des produits au seuil ou sous le
  seuil et aucune sortie acceptée ne produit une quantité négative.
- **SC-007**: Un utilisateur trouve un membre ou une opération connue en moins de
  30 secondes au moyen des recherches et filtres disponibles.
- **SC-008**: 100 % des exports testés correspondent à la liste filtrée visible et
  restituent correctement montants, dates et caractères accentués.
- **SC-009**: Toute évolution des flux financiers ou des permissions possède une
  vérification automatisée couvrant ses scénarios d'acceptation avant validation.

## Assumptions

- Ce document constitue un référentiel de comportement global; il ne demande pas
  de réimplémenter en une seule livraison les fonctions déjà présentes.
- Les écarts de sécurité et d'audit sont traités par la spécification dédiée
  `001-secure-access-audit`, qui fait autorité sur ces aspects lorsqu'elle est plus
  précise.
- Les améliorations EVO-001 à EVO-003 sont couvertes par la spécification
  `001-secure-access-audit`; EVO-005 est promue en règle globale par FR-012. Les
  autres améliorations candidates de la description source restent hors périmètre
  et nécessitent chacune une spécification dédiée.
- Les champs obligatoires et limites de saisie existants restent applicables;
  toute modification de ces règles nécessite une spécification dédiée.
- Les exports représentent la liste filtrée affichée au moment de la demande.
- Toute suppression qui briserait un historique est refusée au profit d'une
  désactivation; une famille ou un élève avec historique suit cette règle.
- Les données sont conservées localement sans suppression automatique. La
  sauvegarde, restauration et politique d'archivage relèvent d'une évolution
  dédiée.
- Les paramètres détaillés du bilan annuel sont ceux décrits par FR-008, FR-009,
  FR-023 et FR-026; de nouveaux indicateurs nécessitent une spécification dédiée.
- Le socle technique et les contraintes de déploiement relèvent de la constitution
  et de la documentation opérationnelle, pas de cette spécification fonctionnelle.
