#!/usr/bin/env bash
#
# Sauvegarde de la base Amana.
#
# Principes :
#   • format « custom » de pg_dump : compressé, et restaurable table par table;
#   • toute sauvegarde est VÉRIFIÉE avant d'être conservée — un fichier illisible
#     est pire que pas de sauvegarde, car il donne une fausse assurance;
#   • rétention en deux paliers : les 7 derniers jours, puis 4 hebdomadaires;
#   • le script échoue bruyamment. Une sauvegarde qui échoue en silence n'existe
#     pas le jour où on en a besoin.
#
# Usage :  ./sauvegarde.sh
# Cron  :  30 3 * * *  /chemin/backend/scripts/sauvegarde.sh >> /var/log/amana-sauvegarde.log 2>&1

set -Eeuo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESTINATION="${AMANA_BACKUP_DIR:-/var/backups/amana}"
RETENTION_JOURS=7
RETENTION_SEMAINES=4

# ─── Configuration : lue depuis .env, jamais codée en dur ────────────────────
if [[ -f "$RACINE/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source <(grep -E '^(DB_HOST|DB_PORT|DB_NAME|DB_USER|DB_PASSWORD)=' "$RACINE/.env")
  set +a
fi

: "${DB_HOST:?DB_HOST manquant}"
: "${DB_PORT:?DB_PORT manquant}"
: "${DB_NAME:?DB_NAME manquant}"
: "${DB_USER:?DB_USER manquant}"
: "${DB_PASSWORD:?DB_PASSWORD manquant}"

export PGPASSWORD="$DB_PASSWORD"

horodatage()  { date '+%Y-%m-%d %H:%M:%S'; }
journal()     { echo "[$(horodatage)] $*"; }
echouer()     { journal "ÉCHEC : $*" >&2; exit 1; }

trap 'echouer "interruption inattendue ligne $LINENO"' ERR

# ─── Préparation ─────────────────────────────────────────────────────────────
mkdir -p "$DESTINATION/quotidien" "$DESTINATION/hebdomadaire"
chmod 700 "$DESTINATION"

JOUR="$(date +%Y%m%d-%H%M%S)"
FICHIER="$DESTINATION/quotidien/amana-${JOUR}.dump"

journal "Sauvegarde de « $DB_NAME » vers $FICHIER"

# ─── Extraction ──────────────────────────────────────────────────────────────
# --format=custom : compressé et restaurable sélectivement.
# --no-owner / --no-privileges : la base restaurée peut appartenir à un autre
#   rôle que l'original, ce qui rend la restauration possible ailleurs.
pg_dump \
  --host="$DB_HOST" --port="$DB_PORT" \
  --username="$DB_USER" --dbname="$DB_NAME" \
  --format=custom --compress=9 \
  --no-owner --no-privileges \
  --file="$FICHIER" \
  || echouer "pg_dump n'a pas abouti"

# ─── Vérification ────────────────────────────────────────────────────────────
# Une sauvegarde non vérifiée est une promesse, pas une garantie.

[[ -s "$FICHIER" ]] || echouer "le fichier produit est vide"

# L'inventaire est lu UNE fois, puis inspecté en mémoire.
# Le piper directement dans « grep -q » ferait sortir grep au premier résultat,
# pg_restore recevrait un SIGPIPE, et pipefail le prendrait pour un échec.
INVENTAIRE="$(pg_restore --list "$FICHIER" 2>/dev/null)" \
  || echouer "archive illisible ou tronquée"

NB_OBJETS="$(grep -c '^[0-9]' <<< "$INVENTAIRE" || true)"
[[ "$NB_OBJETS" -gt 0 ]] || echouer "archive sans contenu"

# Les tables porteuses de données financières doivent être présentes.
for table in ecritures_financieres logs_activite utilisateurs dons cotisations \
             depenses paiements_salaires cotisations_madrasa distributions_sociales; do
  grep -q "TABLE public $table " <<< "$INVENTAIRE" \
    || echouer "table « $table » absente de la sauvegarde"
done

TAILLE="$(du -h "$FICHIER" | cut -f1)"
journal "Vérifiée : $NB_OBJETS objets, $TAILLE"

# ─── Copie hebdomadaire (le dimanche) ────────────────────────────────────────
if [[ "$(date +%u)" == "7" ]]; then
  cp -- "$FICHIER" "$DESTINATION/hebdomadaire/amana-semaine-$(date +%Y-%V).dump"
  journal "Copie hebdomadaire conservée"
fi

# ─── Rétention ───────────────────────────────────────────────────────────────
# Supprimé APRÈS vérification : on ne se sépare jamais d'une ancienne copie
# tant que la nouvelle n'est pas prouvée bonne.
find "$DESTINATION/quotidien"     -name 'amana-*.dump' -mtime "+$RETENTION_JOURS"            -delete
find "$DESTINATION/hebdomadaire"  -name 'amana-*.dump' -mtime "+$((RETENTION_SEMAINES * 7))" -delete

chmod 600 "$DESTINATION"/quotidien/*.dump "$DESTINATION"/hebdomadaire/*.dump 2>/dev/null || true

QUOTIDIENNES="$(find "$DESTINATION/quotidien" -name '*.dump' | wc -l)"
HEBDOS="$(find "$DESTINATION/hebdomadaire" -name '*.dump' | wc -l)"
journal "Terminé — $QUOTIDIENNES quotidienne(s), $HEBDOS hebdomadaire(s)"
