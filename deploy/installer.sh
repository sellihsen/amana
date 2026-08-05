#!/usr/bin/env bash
#
# Installation assistée d'Amana sur un serveur Debian/Ubuntu.
#
# Ce script prépare l'infrastructure — Nginx, PM2, pare-feu, sauvegardes — à
# partir des modèles de ce dossier. Il ne remplace pas la lecture du guide :
# deux étapes lui échappent nécessairement, l'ouverture des ports chez votre
# hébergeur et l'obtention d'un nom de domaine.
#
# Il est IDEMPOTENT : le relancer ne casse rien.
# Il NE TOUCHE PAS aux données ni à backend/.env s'il existe déjà.
#
# Usage :  sudo -v && ./deploy/installer.sh amana.mondomaine.fr

set -Eeuo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODELES="$RACINE/deploy"
DOMAINE="${1:-}"
UTILISATEUR="${SUDO_USER:-$USER}"

vert()   { printf '\033[0;32m%s\033[0m\n' "$*"; }
jaune()  { printf '\033[0;33m%s\033[0m\n' "$*"; }
rouge()  { printf '\033[0;31m%s\033[0m\n' "$*"; }
etape()  { printf '\n\033[1m── %s\033[0m\n' "$*"; }
echouer(){ rouge "ÉCHEC : $*"; exit 1; }

[[ -n "$DOMAINE" ]] || echouer "usage : ./deploy/installer.sh <domaine>
  Exemple : ./deploy/installer.sh amana.mondomaine.fr"

# ─── 1. Prérequis ────────────────────────────────────────────────────────────
etape "Vérification des prérequis"

command -v node >/dev/null || echouer "Node.js absent (18.14 minimum)"
NODE_MAJEUR="$(node -p 'process.versions.node.split(".")[0]')"
[[ "$NODE_MAJEUR" -ge 18 ]] || echouer "Node $NODE_MAJEUR trop ancien, 18 minimum"
vert "  Node $(node -v)"

command -v psql >/dev/null || echouer "PostgreSQL client absent"
PG_MAJEUR="$(psql --version | grep -oE '[0-9]+' | head -1)"
[[ "$PG_MAJEUR" -ge 14 ]] || echouer "PostgreSQL $PG_MAJEUR trop ancien, 14 minimum"
vert "  PostgreSQL $PG_MAJEUR"

# ─── 2. Résolution DNS ───────────────────────────────────────────────────────
etape "Vérification du domaine « $DOMAINE »"

IP_DOMAINE="$(getent hosts "$DOMAINE" | awk '{print $1}' | head -1 || true)"
IP_PUBLIQUE="$(curl -s --max-time 10 https://api.ipify.org || echo '')"

if [[ -z "$IP_DOMAINE" ]]; then
  echouer "« $DOMAINE » ne résout pas. Créez un enregistrement A vers ${IP_PUBLIQUE:-votre IP publique}."
elif [[ -n "$IP_PUBLIQUE" && "$IP_DOMAINE" != "$IP_PUBLIQUE" ]]; then
  jaune "  Attention : $DOMAINE → $IP_DOMAINE, mais l'IP publique semble être $IP_PUBLIQUE"
  jaune "  Le certificat échouera si le domaine ne pointe pas vers cette machine."
else
  vert "  $DOMAINE → $IP_DOMAINE"
fi

# ─── 3. Paquets ──────────────────────────────────────────────────────────────
etape "Installation des paquets"
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  nginx certbot python3-certbot-nginx ufw >/dev/null
command -v pm2 >/dev/null || sudo npm install -g pm2 --silent
vert "  Nginx, Certbot, ufw, PM2"

# ─── 4. Dépendances et build ─────────────────────────────────────────────────
etape "Dépendances applicatives"
( cd "$RACINE" && npm --prefix backend ci --omit=dev --silent 2>/dev/null \
                || npm --prefix backend install --omit=dev --silent )
( cd "$RACINE" && npm --prefix frontend ci --silent 2>/dev/null \
                || npm --prefix frontend install --silent )
( cd "$RACINE" && npm run build --silent )
vert "  Interface construite"

# ─── 5. Configuration ────────────────────────────────────────────────────────
etape "Configuration de l'application"
if [[ -f "$RACINE/backend/.env" ]]; then
  jaune "  backend/.env existe déjà — laissé intact"
else
  SECRET="$(node -e 'console.log(require("crypto").randomBytes(48).toString("base64url"))')"
  cat > "$RACINE/backend/.env" <<EOF
NODE_ENV=production
PORT=3001
FRONTEND_URL=https://$DOMAINE

DB_HOST=localhost
DB_PORT=5432
DB_NAME=amana_db
DB_USER=amana_app
DB_PASSWORD=À_RENSEIGNER

JWT_SECRET=$SECRET
JWT_EXPIRES_IN=8h
SESSION_COOKIE_NAME=session

TEST_DB_NAME=amana_test
MAINTENANCE_DB_NAME=postgres
EOF
  chmod 600 "$RACINE/backend/.env"
  vert "  backend/.env créé, clé de session générée"
  jaune "  → Renseignez DB_PASSWORD avant de démarrer (voir le guide, section base)"
fi

# ─── 6. Nginx ────────────────────────────────────────────────────────────────
etape "Reverse proxy"
sed "s/AMANA_DOMAINE/$DOMAINE/g" "$MODELES/nginx/amana.conf.template" \
  | sudo tee /etc/nginx/sites-available/amana >/dev/null
sudo ln -sf /etc/nginx/sites-available/amana /etc/nginx/sites-enabled/amana
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t >/dev/null 2>&1 || echouer "configuration Nginx invalide"
sudo systemctl reload nginx
vert "  Nginx configuré pour $DOMAINE"

# ─── 7. Pare-feu ─────────────────────────────────────────────────────────────
etape "Pare-feu"
sudo ufw allow 22/tcp  >/dev/null 2>&1 || true
sudo ufw allow 80/tcp  >/dev/null 2>&1 || true
sudo ufw allow 443/tcp >/dev/null 2>&1 || true
sudo ufw --force enable >/dev/null 2>&1 || true
vert "  22, 80, 443 autorisés — le reste refusé"

# ─── 8. Sauvegardes ──────────────────────────────────────────────────────────
etape "Sauvegardes"
sudo mkdir -p /var/backups/amana
sudo chown "$UTILISATEUR":"$UTILISATEUR" /var/backups/amana
sudo touch /var/log/amana-sauvegarde.log
sudo chown "$UTILISATEUR":"$UTILISATEUR" /var/log/amana-sauvegarde.log

LIGNE_CRON="30 3 * * * AMANA_BACKUP_DIR=/var/backups/amana $RACINE/backend/scripts/sauvegarde.sh >> /var/log/amana-sauvegarde.log 2>&1"
( crontab -l 2>/dev/null | grep -v 'amana.*sauvegarde.sh' || true; echo "$LIGNE_CRON" ) | crontab -
vert "  Sauvegarde quotidienne planifiée à 3h30"

# ─── 9. Étapes restantes ─────────────────────────────────────────────────────
etape "Ce qu'il reste à faire"
cat <<EOF

  1. Ouvrir les ports 80 et 443 chez votre hébergeur.
     Ni ce script ni le pare-feu local ne peuvent le faire : c'est une couche
     au-dessus de la machine.
       Azure : az vm open-port -g <groupe> -n <vm> --port 80,443 --priority 310
       AWS   : règle entrante du groupe de sécurité
       OVH   : pare-feu réseau du panneau de configuration

  2. Créer la base et son rôle applicatif :
       sudo -u postgres psql -c "CREATE DATABASE amana_db"
       sudo -u postgres psql -c "CREATE ROLE amana_app LOGIN PASSWORD '<mot-de-passe>'"
       sudo -u postgres psql -d amana_db -f deploy/base-droits.sql
     puis renseigner DB_PASSWORD dans backend/.env

  3. Appliquer les migrations, en tant que postgres (le rôle applicatif n'a
     volontairement pas le droit de modifier le schéma) :
       DB_USER=postgres DB_PASSWORD=<mdp-postgres> npm run migrate

  4. Obtenir le certificat, une fois les ports ouverts :
       sudo certbot --nginx -d $DOMAINE --redirect

  5. Démarrer :
       pm2 start ecosystem.config.js && pm2 save
       pm2 startup    # puis exécuter la commande affichée

  6. Vérifier :
       curl -I https://$DOMAINE
       curl https://$DOMAINE/api/health

EOF
vert "Préparation terminée."
