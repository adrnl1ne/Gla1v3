#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Stopping Gla1v3 database..."
docker-compose -f docker-compose.db.yml down

echo "✅ Database stopped"
