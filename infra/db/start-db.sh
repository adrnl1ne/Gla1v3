#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "  Gla1v3 Database Startup"
echo "=========================================="

# Check if network exists, create if not
if ! docker network inspect infra_gla1v3-net >/dev/null 2>&1; then
    echo "Creating Docker network: infra_gla1v3-net"
    docker network create infra_gla1v3-net
fi

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  No .env file found. Creating with default password..."
    DB_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)
    cat > .env << EOF
# PostgreSQL Configuration
DB_PASSWORD=${DB_PASSWORD}
BACKUP_KEEP_DAYS=7
EOF
    echo "✅ Generated secure database password in .env"
    echo "   Password: ${DB_PASSWORD}"
    echo ""
fi

# Start database
echo "Starting PostgreSQL database..."
docker-compose -f docker-compose.db.yml up -d

echo ""
echo "Waiting for database to be healthy..."
timeout=60
elapsed=0
while [ $elapsed -lt $timeout ]; do
    if docker exec gla1v3-postgres pg_isready -U gla1v3_app -d gla1v3 >/dev/null 2>&1; then
        echo "✅ Database is ready!"
        break
    fi
    sleep 2
    elapsed=$((elapsed + 2))
    echo -n "."
done

if [ $elapsed -ge $timeout ]; then
    echo ""
    echo "❌ Database failed to start within ${timeout} seconds"
    docker-compose -f docker-compose.db.yml logs postgres
    exit 1
fi

echo ""
echo "Ensuring gla1v3_api user exists with correct password..."

# Load DB_PASSWORD from .env
source .env

# Create/update gla1v3_api user
docker exec gla1v3-postgres psql -U gla1v3_app -d gla1v3 <<-EOSQL
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'gla1v3_api') THEN
        CREATE ROLE gla1v3_api WITH LOGIN PASSWORD '$DB_PASSWORD';
        RAISE NOTICE 'Created gla1v3_api user';
    ELSE
        ALTER ROLE gla1v3_api WITH PASSWORD '$DB_PASSWORD';
        RAISE NOTICE 'Updated gla1v3_api password';
    END IF;
END \$\$;

GRANT CONNECT ON DATABASE gla1v3 TO gla1v3_api;
GRANT USAGE, CREATE ON SCHEMA public TO gla1v3_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO gla1v3_api;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO gla1v3_api;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO gla1v3_api;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gla1v3_api;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO gla1v3_api;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO gla1v3_api;
EOSQL

echo "✅ gla1v3_api user configured"

echo ""
echo "Applying schema updates..."

# Apply all init scripts to ensure schema is up to date
# This ensures new columns/tables are added even if DB was created before the scripts existed
for sql_file in $(ls -1 ./init/*.sql 2>/dev/null | sort); do
    filename=$(basename "$sql_file")
    echo "  Applying: $filename"
    docker exec gla1v3-postgres psql -U gla1v3_app -d gla1v3 -f "/docker-entrypoint-initdb.d/$filename" >/dev/null 2>&1
done

echo "✅ Schema updates applied"

echo ""
echo "=========================================="
echo "  Database Started Successfully"
echo "=========================================="
echo "  Database: gla1v3"
echo "  User: gla1v3_app (admin)"
echo "  User: gla1v3_api (application)"
echo "  Host: localhost:5432 (from host)"
echo "  Host: postgres:5432 (from containers)"
echo "  Backups: ./backups/ (daily at 3 AM)"
echo "=========================================="
