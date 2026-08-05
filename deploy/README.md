# Déploiement d'Amana

Ce dossier contient de quoi installer Amana sur un serveur Debian ou Ubuntu.
Les fichiers sont des **modèles** : ils ne contiennent aucun secret ni valeur
propre à une installation particulière.

> Amana gère des fonds confiés et des données personnelles — membres,
> employés, élèves, familles bénéficiaires. Les choix ci-dessous ne sont pas
> des précautions décoratives : chacun répond à une façon concrète de perdre
> ces données ou d'en laisser fuiter.

## Ce dont vous avez besoin

| | |
|---|---|
| Serveur | Debian 11+ ou Ubuntu 22.04+, 1 Go de RAM suffit |
| Node.js | 18.14 ou plus |
| PostgreSQL | 14 ou plus |
| Nom de domaine | pointant vers l'IP du serveur — indispensable au certificat |
| Ports 80 et 443 | ouverts chez l'hébergeur, **pas seulement** dans le pare-feu local |

Un sous-domaine gratuit ([DuckDNS](https://duckdns.org), [nip.io](https://nip.io))
convient parfaitement : Let's Encrypt délivre un vrai certificat dessus.

## Installation assistée

```bash
git clone https://github.com/sellihsen/amana.git
cd amana
./deploy/installer.sh amana.mondomaine.fr
```

Le script installe Nginx, Certbot, PM2 et le pare-feu, construit l'interface,
génère `backend/.env` avec une clé de session aléatoire, et planifie les
sauvegardes. Il est idempotent et ne touche jamais à un `.env` existant ni aux
données.

Il affiche ensuite les étapes qui lui échappent nécessairement. Elles sont
détaillées ci-dessous.

## Les étapes manuelles

### 1. Ouvrir les ports chez l'hébergeur

Le pare-feu de la machine ne suffit pas : une couche réseau au-dessus bloque
généralement tout par défaut.

```bash
# Azure
az vm open-port -g <groupe> -n <vm> --port 80,443 --priority 310
```

Sur AWS, c'est le groupe de sécurité ; sur OVH ou Scaleway, le pare-feu du
panneau de configuration.

### 2. Créer la base et le rôle applicatif

```bash
sudo -u postgres psql -c "CREATE DATABASE amana_db"
sudo -u postgres psql -c "CREATE ROLE amana_app LOGIN PASSWORD '<mot-de-passe-fort>'"
sudo -u postgres psql -d amana_db -v DBNAME=amana_db -f deploy/base-droits.sql
```

Renseigner ensuite `DB_PASSWORD` dans `backend/.env`.

**Pourquoi un rôle dédié.** L'application ne modifie jamais le schéma : elle
lit et écrit des données. Lui refuser le DDL fait qu'une injection SQL, même
réussie, ne peut ni supprimer une table ni désactiver les déclencheurs qui
rendent le grand livre et le journal d'audit immuables.

Vérifiez que le durcissement a pris :

```bash
PGPASSWORD=<mdp> psql -U amana_app -d amana_db -c "CREATE TABLE t(id int);"
# → ERROR:  permission denied for schema public
```

Si cette commande réussit, recommencez : PostgreSQL accorde `CREATE` sur le
schéma `public` à tout le monde par défaut, et le script le révoque.

### 3. Appliquer les migrations

Sous un rôle habilité au DDL — donc pas le rôle applicatif :

```bash
DB_USER=postgres DB_PASSWORD=<mdp-postgres> npm run migrate
```

Les 20 migrations sont forward-only, idempotentes et suivies par checksum. Une
migration déjà appliquée n'est jamais rejouée ; une base existante est adoptée
sans être réécrite. Chacune s'interrompt avec un diagnostic plutôt que de
corriger silencieusement des données ambiguës.

### 4. Créer le premier administrateur

```bash
SEED_ADMIN_PASSWORD='<mot-de-passe-fort>' SEED_ADMIN_EMAIL='vous@mosquee.fr' \
  npm run seed
```

Le seed refuse de s'exécuter sans mot de passe explicite : aucun identifiant
par défaut n'existe dans ce dépôt. La politique serveur exige 12 caractères
minimum, avec minuscule, majuscule, chiffre et caractère spécial.

> Le seed insère aussi un jeu de démonstration **fictif**. Pour une
> installation vierge, ne lancez que la création du compte, ou supprimez
> ensuite les données d'exemple depuis l'interface.

### 5. Obtenir le certificat

Une fois les ports ouverts et le DNS propagé :

```bash
sudo certbot --nginx -d amana.mondomaine.fr --redirect
```

Certbot écrit les directives TLS, active la redirection HTTP→HTTPS et installe
le renouvellement automatique. Vérifiez-le :

```bash
sudo certbot renew --dry-run
```

### 6. Démarrer

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup          # exécuter ensuite la commande affichée
```

**Si l'application vit sur un disque distinct du système**, ajoutez la
dépendance de montage — sans elle, PM2 démarrera avant que le disque soit
monté et le site ne remontera pas après un redémarrage :

```bash
sudo mkdir -p /etc/systemd/system/pm2-$USER.service.d
sed "s|AMANA_POINT_DE_MONTAGE|$(df -h . | tail -1 | awk '{print $6}')|" \
  deploy/systemd/pm2-override.conf.template \
  | sudo tee /etc/systemd/system/pm2-$USER.service.d/override.conf
sudo systemctl daemon-reload
```

Vérifiez également que le montage figure dans `/etc/fstab` avec l'option
`nofail`, faute de quoi un disque absent empêcherait la machine de démarrer.

## Vérifier l'installation

```bash
curl -I  https://amana.mondomaine.fr           # 200, en-têtes de sécurité
curl     https://amana.mondomaine.fr/api/health
curl -o /dev/null -w '%{http_code}\n' https://amana.mondomaine.fr/api/membres   # 401
curl -o /dev/null -w '%{http_code}\n' https://amana.mondomaine.fr/api-docs/     # 404
```

Attendu : l'application répond, les routes protégées refusent l'accès sans
session, et `/api-docs` reste invisible.

Contrôlez aussi que le cookie porte bien ses trois marqueurs :

```bash
curl -i -X POST https://amana.mondomaine.fr/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"vous@mosquee.fr","mot_de_passe":"…"}' | grep -i set-cookie
# → HttpOnly; Secure; SameSite=Strict
```

Si `Secure` manque, `X-Forwarded-Proto` ne parvient pas jusqu'à Express :
revoyez la configuration Nginx.

## Restreindre l'accès d'administration

Les tentatives de connexion automatisées sur SSH sont incessantes. Si votre
adresse est fixe, restreignez-y la source plutôt que de laisser le port ouvert
au monde :

```bash
az network nsg rule update -g <groupe> --nsg-name <nsg> -n <règle-ssh> \
  --source-address-prefixes <votre-ip>
```

**Attention** : avec une adresse dynamique, vous vous couperez l'accès au
prochain changement. Prévoyez une porte de secours — console série du
fournisseur — et sachez la retrouver avant d'en avoir besoin. `fail2ban` est
une alternative sans risque de verrouillage.

## Sauvegardes

Configurées par l'installateur. Voir la section correspondante du
[README principal](../README.md) pour le détail et la restauration.

Un point à traiter vous-même : **les archives résident sur la même machine que
la base**. Elles protègent d'une fausse manipulation, pas de la perte du
serveur. Copiez `/var/backups/amana` vers un stockage distant.

## Mise à jour

```bash
git pull
npm --prefix backend ci --omit=dev
npm --prefix frontend ci
npm run build
npm run migrate          # sous un rôle habilité au DDL
pm2 restart amana
```

Sauvegardez avant toute migration : `backend/scripts/sauvegarde.sh`.

## Ce que ces modèles ne couvrent pas

- **Réplication ou haute disponibilité** — une seule machine, un seul processus.
- **Supervision** — aucune alerte si l'application tombe ; PM2 la relance, sans
  prévenir personne.
- **Sauvegardes hors site** — à ajouter, voir plus haut.
- **Rotation des journaux applicatifs** — `backend/logs/` croît indéfiniment ;
  `pm2 install pm2-logrotate` y remédie.
