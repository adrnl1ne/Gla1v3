#!/bin/bash
set -e

echo ""
echo "=== GLA1V3 Infrastructure Startup ==="
echo ""

# Check if root .env file exists (single source-of-truth in repo root)
ROOT_ENV="$(dirname "$0")/../../../.env"
if [ ! -f "$ROOT_ENV" ]; then
    echo "⚠️  No root .env file found at $ROOT_ENV. Please copy .env.example to repo root and configure."
    exit 1
fi

# Sync DB_PASSWORD to database .env
echo "[1/5] Synchronizing database configuration..."
DB_PASSWORD=$(grep "^DB_PASSWORD=" "$ROOT_ENV" | cut -d'=' -f2)
if [ -f "$(dirname "$0")/../database/.env" ]; then
    sed -i "s/^DB_PASSWORD=.*/DB_PASSWORD=$DB_PASSWORD/" "$(dirname "$0")/../database/.env"
else
    cat > "$(dirname "$0")/../database/.env" <<EOF
# PostgreSQL Configuration
# Generate a secure password by running: openssl rand -base64 32
DB_PASSWORD=$DB_PASSWORD
BACKUP_KEEP_DAYS=7
EOF
fi

# Ensure docker-compose picks up environment: use --env-file to read from root .env
# (Removed copy to avoid duplicate .env file)
echo "[0/6] Using repo root .env for docker compose"

# Sync DB_PASSWORD to root .env for backend
ROOT_ENV="$(dirname "$0")/../../../.env"
if [ -f "$ROOT_ENV" ]; then
    sed -i "s/^DB_PASSWORD=.*/DB_PASSWORD=$DB_PASSWORD/" "$ROOT_ENV"
else
    cat > "$ROOT_ENV" <<EOF
# Backend Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=gla1v3
DB_USER=gla1v3_api
DB_PASSWORD=$DB_PASSWORD

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d

# Server Configuration
PORT=3000
NODE_ENV=development
EOF
fi

# Check if database is running, start if not
if ! docker ps | grep -q gla1v3-postgres; then
    echo "[2/5] Database not running. Starting database..."
    if [ -d "$(dirname "$0")/../database" ] && [ -f "$(dirname "$0")/../database/start-db.sh" ]; then
        cd "$(dirname "$0")/../database"
        if bash start-db.sh; then
            echo "✓ Database started successfully"
        else
            echo "⚠️  Database startup failed, but continuing with main services..."
        fi
        cd "$(dirname "$0")"
    else
        echo "⚠️  Database scripts not found at $(dirname "$0")/../database/"
    fi
    echo ""
fi

echo "[3/5] Generating session certificates..."
if [ -f "$(dirname "$0")/../certgen/generate_session_certs.sh" ]; then
    if bash "$(dirname "$0")/../certgen/generate_session_certs.sh"; then
        echo "✓ Certificates generated successfully"
    else
        echo "⚠️  Certificate generation failed, but continuing..."
    fi
else
    echo "⚠️  Certificate generation script not found"
fi

echo ""
echo "[4/5] Starting Docker services..."
cd "$(dirname "$0")/.."

# Try newer docker compose syntax first, fall back to older docker-compose
if command -v docker > /dev/null && docker compose version > /dev/null 2>&1; then
    DOCKER_COMPOSE_CMD="docker compose"
elif command -v docker-compose > /dev/null; then
    DOCKER_COMPOSE_CMD="docker-compose"
else
    echo "✗ Neither 'docker compose' nor 'docker-compose' found. Please install Docker."
    exit 1
fi

$DOCKER_COMPOSE_CMD --env-file ../../.env up -d --build

if [ $? -ne 0 ]; then
    echo "✗ Docker startup failed!"
    echo "  Make sure Docker is running and you have permission to use it."
    echo "  On Linux, you may need to run: sudo usermod -aG docker \$USER"
    exit 1
fi

echo ""
echo "Starting Wazuh EDR (optional)..."
if [ -d "$(dirname "$0")/../../wazuh" ]; then
    echo "→ Wazuh folder detected — starting optional EDR stack"
    cd "$(dirname "$0")/../../wazuh"
    $DOCKER_COMPOSE_CMD up -d || echo "⚠️  Wazuh EDR failed to start (platform will work without EDR)"
    echo "✓ Wazuh EDR start attempted"
    cd "$(dirname "$0")"
else
    echo "→ No 'infra/wazuh' folder found; skipping optional EDR start"
fi

echo ""
echo "[5/5] Verifying services..."
sleep 3
RUNNING=$(docker ps --filter "name=gla1v3" --format "{{.Names}}" | wc -l)
echo "✓ $RUNNING core services running"

echo ""
echo "✓ Infrastructure started successfully!"
echo ""
echo "Services:"
echo "  Dashboard: https://dashboard.gla1v3.local"
echo "  API:       https://api.gla1v3.local"
echo "  C2:        https://c2.gla1v3.local"
echo "  CA:        https://ca.gla1v3.local"
if docker ps --filter "name=wazuh-edr" --format "{{.Names}}" | grep -q "wazuh-edr"; then
    echo "  Wazuh EDR: http://localhost:8443 (admin/SecretPassword)"
fi
echo ""
echo "Default Credentials:"
echo "  Username: admin"
echo "  Password: admin123"
echo ""
