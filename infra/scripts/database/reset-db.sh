#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "  ⚠️  DATABASE RESET WARNING ⚠️"
echo "=========================================="
echo "This will:"
echo "  1. Stop the database"
echo "  2. DELETE ALL DATA"
echo "  3. Recreate the database from scratch"
echo ""
echo "ALL AGENTS, TASKS, USERS, AND TENANTS WILL BE LOST!"
echo ""
read -p "Type 'DELETE EVERYTHING' to confirm: " confirmation

if [ "$confirmation" != "DELETE EVERYTHING" ]; then
    echo "Reset cancelled."
    exit 0
fi

echo ""
echo "Creating backup before reset..."
./backup-db.sh

echo ""
echo "Stopping database..."
docker-compose -f docker-compose.db.yml down

echo "Removing database volume..."
docker volume rm gla1v3-postgres-data 2>/dev/null || true

echo "Recreating database..."
./start-db.sh

echo ""
echo "✅ Database has been reset successfully"
echo "   A backup was created before reset in ./backups/"
