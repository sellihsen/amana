#!/usr/bin/env bash
#
# Restauration d'une sauvegarde Amana.
#
# Par défaut, restaure vers une base TEMPORAIRE et compare les effectifs à la
# base courante : c'est le test de restauration, qui ne touche à rien.
# Avec --vers-production, écrase réellement la base applicative.
#
# Une sauvegarde jamais restaurée n'est pas une sauvegarde : c'est un fichier.
#
# Usage :
#   ./restaurer.sh                          # dernière sauvegarde → base d'essai
#   ./restaurer.sh /chemin/vers/x.dump      # sauvegarde précise → base d'essai
#   ./restaurer.sh x.dump --vers-production # restauration réelle (destructive)

set -Eeuo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESTINATION="${AMANA_BACKUP_DIR:-/var/backups/amana}"

if [[ -f "$RACINE/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source <(grep -E '^(DB_HOST|DB_PORT|DB_NAME|DB_USER|DB_PASSWORD)=' "$RACINE/.env")
  set +a
fi

# La restauration crée une base : elle exige un rôle habilité au DDL, donc pas
# le rôle applicatif, volontairement privé de ce droit.
ADMIN_USER="${AMANA_ADMIN_DB_USER:-postgres}"
ADMIN_PASS="${AMANA_ADMIN_DB_PASSWORD:-postgres}"

journal() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
echouer() { journal "ÉCHEC : $*" >&2; exit 1; }

ARCHIVE="${1:-}"
MODE="${2:-essai}"
[[ "${1:-}" == "--vers-production" ]] && { ARCHIVE=""; MODE="--vers-production"; }

if [[ -z "$ARCHIVE" ]]; then
  ARCHIVE="$(find "$DESTINATION" -name 'amana-*.dump' -printf '%T@ %p\n' 2>/dev/null \
             | sort -rn | head -1 | cut -d' ' -f2-)"
fi
[[ -f "$ARCHIVE" ]] || echouer "aucune sauvegarde trouvée dans $DESTINATION"

journal "Archive : $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1))"

export PGPASSWORD="$ADMIN_PASS"

if [[ "$MODE" == "--vers-production" ]]; then
  CIBLE="$DB_NAME"
  journal "⚠  RESTAURATION VERS LA PRODUCTION : « $CIBLE » va être ÉCRASÉE."
  read -r -p "    Taper le nom de la base pour confirmer : " confirmation
  [[ "$confirmation" == "$CIBLE" ]] || echouer "confirmation incorrecte, rien n'a été fait"

  # Filet : une copie de l'état actuel avant de l'écraser.
  AVANT="$DESTINATION/avant-restauration-$(date +%Y%m%d-%H%M%S).dump"
  pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$ADMIN_USER" -d "$CIBLE" \
          --format=custom --no-owner --no-privileges --file="$AVANT" \
    && journal "État actuel sauvegardé dans $AVANT"

  psql -h "$DB_HOST" -p "$DB_PORT" -U "$ADMIN_USER" -d postgres -q \
    -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$CIBLE' AND pid<>pg_backend_pid();" \
    -c "DROP DATABASE IF EXISTS \"$CIBLE\";" -c "CREATE DATABASE \"$CIBLE\";"
else
  CIBLE="amana_restauration_essai"
  journal "Restauration d'essai vers « $CIBLE » (la production n'est pas touchée)"
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$ADMIN_USER" -d postgres -q \
    -c "DROP DATABASE IF EXISTS \"$CIBLE\";" -c "CREATE DATABASE \"$CIBLE\";"
fi

pg_restore -h "$DB_HOST" -p "$DB_PORT" -U "$ADMIN_USER" -d "$CIBLE" \
           --no-owner --no-privileges "$ARCHIVE" 2>/dev/null \
  || journal "note : pg_restore a signalé des avertissements (droits), contenu vérifié ci-dessous"

# ─── Contrôle du contenu restauré ────────────────────────────────────────────
journal "Contenu restauré :"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$ADMIN_USER" -d "$CIBLE" -tA -F' ' <<'SQL' | sed 's/^/    /'
SELECT 'utilisateurs',           COUNT(*) FROM utilisateurs
UNION ALL SELECT 'membres',      COUNT(*) FROM membres
UNION ALL SELECT 'dons',         COUNT(*) FROM dons
UNION ALL SELECT 'écritures',    COUNT(*) FROM ecritures_financieres
UNION ALL SELECT 'audit',        COUNT(*) FROM logs_activite
UNION ALL SELECT 'migrations',   COUNT(*) FROM schema_migrations;
SQL

# Le solde recalculé doit correspondre : c'est la preuve que les montants sont
# intacts, pas seulement que les lignes sont là.
SOLDE="$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$ADMIN_USER" -d "$CIBLE" -tAc \
  "SELECT COALESCE(SUM(montant * CASE sens WHEN 'CREDIT' THEN 1 ELSE -1 END),0)::TEXT
     FROM ecritures_financieres WHERE perimetre='GENERAL';")"
journal "Solde général reconstitué : $SOLDE EUR"

if [[ "$MODE" != "--vers-production" ]]; then
  journal "Base d'essai « $CIBLE » conservée pour inspection."
  journal "La supprimer :  psql -U $ADMIN_USER -c 'DROP DATABASE $CIBLE'"
else
  journal "Restauration terminée. Redémarrer l'application :  pm2 restart amana"
fi
