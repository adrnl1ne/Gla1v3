#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Source .env file
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="backups/gla1v3_manual_backup_${TIMESTAMP}.sql"

echo "Starting manual database backup..."
echo "Backup file: ${BACKUP_FILE}"

docker exec gla1v3-postgres pg_dump -U gla1v3_app -d gla1v3 > "${BACKUP_FILE}"

if [ $? -eq 0 ]; then
    gzip "${BACKUP_FILE}"
    echo "✅ Backup completed successfully: ${BACKUP_FILE}.gz"
    ls -lh "${BACKUP_FILE}.gz"
else
    echo "❌ Backup failed!"
    exit 1
fi
