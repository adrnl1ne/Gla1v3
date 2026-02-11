#!/bin/bash
set -e

echo ""
echo "=== GLA1V3 Infrastructure Startup ==="
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚠️  No .env file found. Please copy .env.example to .env and configure."
    exit 1
fi

# Sync DB_PASSWORD to database .env
echo "[1/4] Synchronizing database configuration..."
DB_PASSWORD=$(grep "^DB_PASSWORD=" .env | cut -d'=' -f2)
if [ -f "$(dirname "$0")/db/.env" ]; then
    sed -i "s/^DB_PASSWORD=.*/DB_PASSWORD=$DB_PASSWORD/" "$(dirname "$0")/db/.env"
else
    cat > "$(dirname "$0")/db/.env" <<EOF
# PostgreSQL Configuration
DB_PASSWORD=$DB_PASSWORD
BACKUP_KEEP_DAYS=7
EOF
fi

# Check if database is running, start if not
if ! docker ps | grep -q gla1v3-postgres; then
    echo "[2/4] Database not running. Starting database..."
    cd "$(dirname "$0")/db"
    bash start-db.sh
    cd "$(dirname "$0")"
    echo ""
fi

echo "[3/4] Generating session certificates..."
bash "$(dirname "$0")/scripts/generate_session_certs.sh"

echo ""
echo "[4/4] Starting Docker services..."
cd "$(dirname "$0")"
docker compose up -d --build

echo ""
echo "✓ Infrastructure started successfully!"
echo ""
echo "Services:"
echo "  Dashboard: https://dashboard.gla1v3.local"
echo "  API:       https://api.gla1v3.local"
echo "  C2:        https://c2.gla1v3.local"
echo "  CA:        https://ca.gla1v3.local"
echo ""
echo "Default Credentials:"
echo "  Username: admin"
echo "  Password: admin123"
echo ""
