#!/bin/sh
# Sauvegarde PostgreSQL + médias de la stack de production.
# À planifier via cron (ex. quotidien : 0 2 * * * /chemin/backend/scripts/backup.sh).
set -e

cd "$(dirname "$0")/.."
[ -f .env ] && . ./.env

STAMP=$(date +%Y%m%d-%H%M%S)
DIR=${BACKUP_DIR:-./backups}
RETENTION_JOURS=${BACKUP_RETENTION:-14}
VOLUME="$(basename "$(pwd)")_media-data"
mkdir -p "$DIR"

echo "→ Dump PostgreSQL..."
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip >"$DIR/db-$STAMP.sql.gz"

echo "→ Archive des médias (volume $VOLUME)..."
docker run --rm \
  -v "$VOLUME":/media:ro \
  -v "$(pwd)/$DIR":/backup \
  alpine tar czf "/backup/media-$STAMP.tar.gz" -C /media .

echo "→ Purge des sauvegardes de plus de $RETENTION_JOURS jours..."
find "$DIR" -type f -name '*.gz' -mtime +"$RETENTION_JOURS" -delete

echo "✓ Sauvegarde terminée dans $DIR"
