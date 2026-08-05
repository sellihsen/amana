# Spécification fonctionnelle globale - Mosquée App

**Version** : 1.0.0  
**Date** : 2026-08-04  
**Statut** : Référentiel initial de l'existant  
**Source principale** : `README.md`  
**Périmètre** : gestion administrative, financière et sociale d'une mosquée

## 1. Objectif du document

Ce document décrit les fonctionnalités actuellement annoncées par l'application. Il sert de référence pour :

- comprendre le périmètre fonctionnel existant ;
- identifier les règles métier et les données concernées ;
- préparer des améliorations sans modifier involontairement l'existant ;
- ajouter de nouvelles fonctionnalités avec des critères d'acceptation vérifiables ;
- suivre les décisions, dépendances et points restant à clarifier.

Les détails d'installation et d'exploitation restent dans `README.md`. Les règles de gouvernance et de sécurité définies dans `.specify/memory/constitution.md` priment sur ce document.

## 2. Vision produit

Mosquée App centralise la gestion quotidienne d'une mosquée dans une application locale unique. Elle doit fournir une vision fiable des finances, permettre le suivi des personnes et des activités, protéger les données personnelles et assurer la traçabilité de chaque opération sensible.

## 3. Acteurs et accès

| Acteur | Responsabilités connues | Accès connu |
|---|---|---|
| Administrateur | Paramétrage, utilisateurs, audit et opérations métier | Accès complet, dont la section Administration |
| Trésorier | Gestion financière courante | Rôle annoncé, permissions détaillées à clarifier |
| Lecteur | Consultation des informations | Accès en lecture attendu, périmètre détaillé à clarifier |
| Système | Calculs, agrégations et anciens enregistrements sans auteur identifié | Apparaît comme auteur des données historiques concernées |

### Règles d'accès transverses

- **ACC-001** : toute page métier nécessite une session authentifiée.
- **ACC-002** : une session est établie avec un JWT ayant une durée annoncée de 8 heures.
- **ACC-003** : l'utilisateur est déconnecté lorsque son jeton est expiré ou refusé.
- **ACC-004** : l'accès à l'Administration est réservé au rôle `admin`, côté interface et côté API.
- **ACC-005** : un utilisateur ne peut pas supprimer son propre compte connecté.
- **ACC-006** : les autorisations d'écriture de `tresorier` et `lecteur` doivent être précisées avant toute évolution de leur périmètre.

## 4. Catalogue des fonctionnalités existantes

### F01 - Authentification et session

**Objectif** : sécuriser l'accès à l'application et identifier l'auteur des opérations.

**Fonctionnalités** :

- connexion par email et mot de passe ;
- émission et utilisation d'un JWT ;
- persistance locale de la session ;
- déconnexion automatique en cas d'expiration du jeton ;
- redirection vers la connexion pour un utilisateur non authentifié.

**Critères d'acceptation** :

1. Étant donné des identifiants valides, lorsque l'utilisateur se connecte, alors il accède au tableau de bord avec son rôle.
2. Étant donné un jeton absent, expiré ou invalide, lorsqu'une ressource protégée est demandée, alors l'accès est refusé.
3. Étant donné un non-administrateur, lorsque la section Administration est demandée, alors l'accès est refusé par l'API même si l'URL est saisie directement.

### F02 - Tableau de bord global

**Objectif** : fournir une synthèse immédiate de l'activité financière et opérationnelle.

**Fonctionnalités** :

- affichage du solde, des entrées, des dépenses, des dons, des cotisations membres et des écolages ;
- indicateurs RH : employés actifs, masse salariale et salaires du mois ;
- indicateurs Madrasa : élèves actifs, écolages encaissés et paiements en attente ;
- alerte globale pour les produits sous leur seuil de stock ;
- graphique des dons sur 12 mois glissants ;
- listes des derniers dons, dernières sorties et derniers paiements Madrasa.

**Critères d'acceptation** :

1. Lorsque le tableau de bord est chargé, alors les indicateurs reflètent les données enregistrées au moment de la requête.
2. Lorsqu'un produit atteint ou passe sous son seuil d'alerte, alors une alerte visible est affichée.
3. Les fonds affectés au Social ne sont pas inclus dans les agrégats financiers généraux.

### F03 - Membres

**Objectif** : gérer le registre des fidèles membres de la mosquée.

**Fonctionnalités** :

- créer, consulter, modifier et supprimer une fiche membre ;
- enregistrer nom, prénom, email, téléphone, adresse et date d'adhésion ;
- gérer les statuts `actif`, `inactif` et `suspendu` ;
- rechercher un membre en temps réel ;
- exporter la liste en Excel ou PDF.

**Critères d'acceptation** :

1. Une fiche valide créée est immédiatement disponible dans la liste et la recherche.
2. Un changement de statut est conservé sans supprimer l'historique financier du membre.
3. Un export reprend les données correspondant à la liste concernée.

### F04 - Dons et caisses

**Objectif** : enregistrer les dons et garantir leur affectation à une caisse.

**Fonctionnalités** :

- enregistrer et supprimer un don ;
- associer un don à une caisse active chargée dynamiquement ;
- enregistrer un don anonyme ou le rattacher à un membre ;
- rechercher le membre lors de la saisie ;
- exporter les dons en Excel ou PDF.

**Critères d'acceptation** :

1. Un don est obligatoirement affecté à une caisse active.
2. Un don peut être enregistré sans membre et reste alors anonyme.
3. Un don affecté à une caisse Social alimente uniquement le bilan social.

### F05 - Cotisations des membres

**Objectif** : suivre les contributions périodiques des membres.

**Fonctionnalités** :

- enregistrer des cotisations mensuelles ou annuelles ;
- rattacher chaque cotisation à un membre ;
- gérer les statuts `payee`, `en attente` et `annulee` ;
- rechercher le membre lors de la saisie ;
- exporter les données en Excel ou PDF.

**Critères d'acceptation** :

1. Seules les cotisations payées sont incluses dans les entrées financières.
2. Une cotisation annulée ne contribue pas au solde.
3. La période, le membre, le montant et le statut restent consultables.

### F06 - Dépenses

**Objectif** : enregistrer et attribuer les sorties financières courantes.

**Fonctionnalités** :

- enregistrer et supprimer une dépense ;
- sélectionner une catégorie configurable ;
- rechercher une catégorie lors de la saisie ;
- afficher l'utilisateur ayant enregistré la dépense ;
- exporter les dépenses en Excel ou PDF.

**Critères d'acceptation** :

1. Toute dépense enregistrée diminue le solde général.
2. Une nouvelle dépense utilise une catégorie disponible dans la configuration.
3. L'auteur authentifié de la saisie est visible ; les anciennes données sans auteur affichent `Système`.

### F07 - Ressources humaines et salaires

**Objectif** : gérer le personnel et les paiements qui lui sont versés.

**Fonctionnalités** :

- créer, consulter, modifier et supprimer une fiche personnel ;
- gérer le poste, le salaire de base et le statut actif ou inactif ;
- empêcher la suppression d'un employé lié à des paiements ;
- enregistrer et consulter les paiements par type configurable ;
- afficher l'auteur de chaque paiement ;
- présenter un résumé des paiements par type ;
- exporter les fiches et paiements en Excel ou PDF.

**Critères d'acceptation** :

1. Un membre du personnel ayant des paiements ne peut pas être supprimé et peut être désactivé.
2. Chaque paiement de salaire contribue aux dépenses générales.
3. Chaque nouveau paiement identifie son bénéficiaire, son type, son montant, sa période et son auteur.

### F08 - Madrasa

**Objectif** : gérer les élèves de l'école coranique et leurs écolages.

**Fonctionnalités** :

- créer, consulter, modifier et supprimer une fiche élève ;
- conserver les informations d'inscription, le contact du parent, la classe et le statut ;
- configurer les classes depuis l'Administration ;
- filtrer les élèves par classe et statut ;
- enregistrer et consulter les écolages mensuels ;
- empêcher plusieurs cotisations pour un même élève et un même mois ;
- basculer un paiement entre payé et en attente ;
- exporter les élèves et écolages en Excel ou PDF.

**Critères d'acceptation** :

1. Deux écolages du même élève pour le même mois ne peuvent pas être enregistrés.
2. Seuls les écolages payés alimentent les entrées financières.
3. Une classe ajoutée dans l'Administration est proposée dans les formulaires concernés.

### F09 - Solidarité et social

**Objectif** : isoler et suivre les fonds destinés à l'aide sociale.

**Fonctionnalités** :

- gérer les fiches des familles nécessiteuses ;
- conserver les ressources, la composition et l'historique des aides ;
- enregistrer une distribution depuis une caisse affectée au Social ;
- calculer, par caisse sociale, les montants collectés, distribués et restants.

**Critères d'acceptation** :

1. Une distribution sociale est rattachée à une famille et à une caisse Social.
2. Le restant social correspond au montant collecté diminué des distributions.
3. Les collectes et distributions sociales restent séparées du solde général.

### F10 - Stocks

**Objectif** : suivre les produits et matériaux et anticiper les ruptures.

**Fonctionnalités** :

- créer, consulter, modifier et supprimer un produit ;
- conserver sa catégorie, sa quantité et son seuil d'alerte ;
- enregistrer rapidement une entrée ou une sortie ;
- afficher un statut normal ou critique selon le seuil ;
- remonter les alertes au tableau de bord ;
- exporter l'inventaire en Excel ou PDF.

**Critères d'acceptation** :

1. Une entrée augmente la quantité et une sortie la diminue de la valeur demandée.
2. Un produit dont la quantité est inférieure ou égale au seuil est signalé comme critique.
3. Une quantité de stock ne peut pas devenir négative.

### F11 - Bilans comptables

**Objectif** : produire une synthèse financière annuelle.

**Fonctionnalités** :

- sélectionner une année ;
- générer le bilan correspondant ;
- consolider les entrées et sorties selon les règles financières globales.

**Critères d'acceptation** :

1. Le bilan d'une année ne contient que les opérations appartenant à cette année.
2. Les totaux du bilan sont cohérents avec le détail des opérations incluses.
3. Les fonds sociaux sont présentés séparément des finances générales.

### F12 - Administration et configuration

**Objectif** : adapter les référentiels métier sans modification du code.

**Fonctionnalités** :

- gérer les caisses, leur état actif ou inactif et leur affectation ;
- gérer les catégories de dépenses ;
- gérer les classes Madrasa ;
- gérer les types de paiement RH ;
- modifier le budget prévisionnel et les capacités du projet de construction ;
- gérer les comptes utilisateurs ;
- consulter l'historique des actions avec recherche, type, dates et pagination.

**Critères d'acceptation** :

1. Seul un administrateur peut accéder à ces fonctions.
2. La désactivation d'une option empêche sa sélection pour une nouvelle opération sans altérer l'historique.
3. Un administrateur ne peut pas supprimer son propre compte pendant sa session.

### F13 - Traçabilité et audit

**Objectif** : répondre à la question « qui a fait quoi, quand et sur quelle donnée ? ».

**Fonctionnalités** :

- enregistrer l'acteur, l'action, la date, les détails de l'opération et l'adresse IP ;
- couvrir les opérations sensibles de tous les modules ;
- rechercher et filtrer les événements ;
- réserver la consultation de l'audit aux administrateurs.

**Critères d'acceptation** :

1. Toute modification d'une donnée métier produit une entrée d'audit attribuable.
2. Une entrée d'audit ne peut pas être modifiée ou supprimée depuis l'application.
3. Une opération financière n'est validée que si son audit est également enregistré.

> Écart identifié : le README décrit actuellement un audit « fire-and-forget ». La constitution exige désormais que l'opération et son audit soient validés dans la même transaction. La constitution fait autorité.

### F14 - Exports et documentation API

**Objectif** : permettre l'exploitation des données et la vérification des interfaces.

**Fonctionnalités** :

- exporter les listes métier en Excel et PDF ;
- consulter la documentation OpenAPI dans Swagger UI ;
- tester les routes protégées avec un JWT.

**Critères d'acceptation** :

1. Un export contient des colonnes lisibles et les données de la liste concernée.
2. Les montants, dates et caractères accentués sont correctement restitués.
3. Toute évolution d'une route est reflétée dans la documentation OpenAPI associée.

## 5. Règles métier transverses

### Calcul financier général

```text
Total des entrées = dons hors caisses Social
                    + cotisations membres payées
                    + écolages Madrasa payés

Total des dépenses = dépenses directes
                     + paiements de salaires

Solde général      = total des entrées - total des dépenses
```

- **FIN-001** : les montants sociaux sont comptabilisés exclusivement dans le bilan social.
- **FIN-002** : les agrégats sont recalculés depuis les données persistées.
- **FIN-003** : les calculs monétaires sont exacts et réalisés en base de données, sans arithmétique flottante applicative.
- **FIN-004** : une écriture financière et son audit forment une opération atomique.
- **FIN-005** : aucune quantité ou valeur financière ne peut être silencieusement tronquée ou ramenée à une limite.

### Affectation des caisses

| Affectation | Usage |
|---|---|
| `Chantier` | Fonds destinés au projet de construction |
| `Fonctionnement` | Budget courant de la mosquée |
| `Social` | Zakat, orphelins, solidarité et aides aux familles |

## 6. Entités métier principales

| Entité | Description | Relations principales |
|---|---|---|
| Utilisateur | Compte authentifié et rôle | Auteur des opérations et audits |
| Membre | Fidèle inscrit | Dons et cotisations |
| Don | Somme reçue | Caisse, membre optionnel, auteur |
| Caisse | Destination et affectation des dons | Dons et distributions sociales |
| Cotisation membre | Contribution périodique | Membre |
| Dépense | Sortie financière catégorisée | Catégorie et auteur |
| Personnel | Employé de la mosquée | Paiements RH |
| Paiement RH | Versement à un employé | Personnel, type et auteur |
| Élève | Inscrit à la Madrasa | Classe et écolages |
| Écolage | Paiement mensuel Madrasa | Élève |
| Famille | Bénéficiaire potentiel d'aides | Distributions sociales |
| Distribution sociale | Aide accordée | Famille, caisse Social et auteur |
| Produit | Article ou matériau en stock | Mouvements de quantité |
| Configuration | Référentiel administrable | Catégories, classes et types RH |
| Projet | Budget et capacités de construction | Caisses Chantier |
| Log d'activité | Trace immuable d'une action | Utilisateur et entité affectée |

## 7. Exigences non fonctionnelles

- **NFR-001 - Intégrité** : les écritures financières liées sont transactionnelles et utilisent des types décimaux exacts.
- **NFR-002 - Sécurité** : les accès sont refusés par défaut et chaque écriture est autorisée côté serveur selon le rôle.
- **NFR-003 - Confidentialité** : les données personnelles ne quittent pas le déploiement et ne figurent pas dans les journaux techniques ou messages d'erreur.
- **NFR-004 - Traçabilité** : chaque changement d'état est audité dans la même transaction que l'opération.
- **NFR-005 - Cohérence** : les règles partagées de calcul, formatage, autorisation et erreur ont une source unique.
- **NFR-006 - Documentation** : l'API OpenAPI reste synchronisée avec le comportement réel.
- **NFR-007 - Vérification** : toute évolution financière ou d'accès possède des tests automatisés, et tout correctif possède un test de non-régression.
- **NFR-008 - Compatibilité** : l'interface doit rester utilisable sur ordinateur et appareil mobile.
- **NFR-009 - Déploiement** : l'application reste exploitable localement avec Node.js et PostgreSQL selon le socle défini par le projet.

## 8. Cas limites à préserver

- un membre, employé, élève ou référentiel déjà lié à un historique ne doit pas rendre cet historique incohérent après désactivation ;
- une caisse inactive ne doit plus accepter de nouvelle opération mais ses anciennes opérations restent consultables ;
- une opération sans auteur historique affiche `Système`, sans attribuer artificiellement un utilisateur ;
- une saisie répétée ou un double clic ne doit pas créer deux écritures financières ;
- une période sans opération retourne des totaux à zéro et non une erreur ;
- une sortie de stock supérieure à la quantité disponible est refusée ;
- un montant nul, négatif, invalide ou hors limite est refusé ;
- une référence supprimée ou désactivée ne doit pas casser les bilans et exports historiques ;
- une erreur d'audit doit annuler l'opération métier correspondante ;
- l'expiration d'une session pendant une saisie doit refuser l'opération sans l'enregistrer partiellement.

## 9. Points à clarifier

- **CLR-001** : définir précisément les droits de lecture et d'écriture des rôles `tresorier` et `lecteur`, module par module.
- **CLR-002** : définir les champs obligatoires, formats et limites pour chaque formulaire.
- **CLR-003** : définir la devise et les règles d'arrondi officielles.
- **CLR-004** : préciser les règles de modification ou d'annulation des écritures financières déjà validées.
- **CLR-005** : préciser si les exports respectent les filtres actifs ou exportent toujours l'ensemble des données.
- **CLR-006** : définir la politique de conservation, sauvegarde, restauration et archivage des données.
- **CLR-007** : préciser les indicateurs et le contenu détaillé du bilan annuel.
- **CLR-008** : définir si une distribution sociale peut dépasser le restant disponible d'une caisse.
- **CLR-009** : définir le comportement attendu lors de la suppression d'une famille ou d'un élève possédant un historique.

## 10. Backlog d'amélioration initial

Les éléments ci-dessous sont des pistes et non des fonctionnalités existantes garanties. Ils doivent chacun faire l'objet d'une spécification dédiée avant implémentation.

| ID | Amélioration candidate | Valeur attendue | Priorité proposée |
|---|---|---|---|
| EVO-001 | Matrice complète des permissions par rôle | Réduire les accès excessifs et rendre le rôle lecteur réellement non modifiant | P1 |
| EVO-002 | Transactions financières et audit atomique | Garantir qu'aucune opération n'existe sans trace d'audit | P1 |
| EVO-003 | Suite de tests des calculs financiers et autorisations | Prévenir les régressions sur les fonds et les accès | P1 |
| EVO-004 | Sauvegarde et restauration guidées | Protéger les données contre la perte locale | P1 |
| EVO-005 | Annulation comptable par contre-écriture | Corriger une erreur sans supprimer l'historique | P2 |
| EVO-006 | Pièces justificatives pour dons et dépenses | Faciliter le contrôle et l'audit documentaire | P2 |
| EVO-007 | Reçus numérotés pour dons et cotisations | Fournir une preuve au donateur ou au membre | P2 |
| EVO-008 | Notifications d'échéance et de stock | Anticiper les impayés et ruptures | P2 |
| EVO-009 | Filtres avancés et exports alignés | Faciliter l'analyse ciblée des données | P2 |
| EVO-010 | Clôture mensuelle et annuelle | Figer et valider les périodes comptables | P2 |
| EVO-011 | Tableau de bord personnalisable par rôle | Présenter les indicateurs utiles à chaque profil | P3 |
| EVO-012 | Journal des mouvements de stock | Expliquer chaque variation de quantité | P3 |

## 11. Procédure d'ajout ou d'amélioration d'une fonctionnalité

Toute évolution doit être décrite dans une spécification dédiée contenant au minimum :

1. **Identifiant et titre** : reprendre un ID `EVO-xxx` ou créer un nouvel ID.
2. **Problème** : expliquer le besoin utilisateur, sans imposer immédiatement une solution technique.
3. **Périmètre** : préciser ce qui est inclus et explicitement exclu.
4. **Acteurs et permissions** : indiquer qui peut voir, créer, modifier, annuler ou supprimer.
5. **Parcours utilisateur** : décrire les scénarios principaux par priorité P1, P2 ou P3.
6. **Règles métier** : détailler calculs, validations, statuts et transitions.
7. **Impacts** : lister les modules, entités, données historiques, exports, audit et API concernés.
8. **Critères d'acceptation** : écrire des résultats observables sous la forme Étant donné / Lorsque / Alors.
9. **Cas limites** : prévoir erreurs, doublons, concurrence, session expirée et données absentes.
10. **Mesures de succès** : définir des critères mesurables et indépendants de la technologie.
11. **Conformité** : vérifier l'intégrité financière, l'audit atomique, le refus par défaut, les tests et l'absence de duplication.

## 12. Critères de succès globaux

- **SC-001** : 100 % des opérations financières enregistrées sont attribuables à un acteur et une date.
- **SC-002** : 100 % des agrégats affichés peuvent être recalculés depuis le détail des opérations.
- **SC-003** : aucune écriture n'est validée partiellement en cas d'erreur.
- **SC-004** : aucun utilisateur ne peut exécuter une action non autorisée en appelant directement l'API.
- **SC-005** : les bilans généraux et sociaux restent séparés et cohérents avec leurs opérations sources.
- **SC-006** : toute évolution des flux financiers ou des permissions est couverte par des tests automatisés.

## 13. Historique du document

| Version | Date | Modification |
|---|---|---|
| 1.0.0 | 2026-08-04 | Extraction initiale des fonctionnalités du README et création du backlog d'évolution |
