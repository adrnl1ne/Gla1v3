#!/bin/bash
set -e

echo ""
echo "=== GLA1V3 Infrastructure Startup ==="
echo ""

echo "[1/2] Generating session certificates..."
bash "$(dirname "$0")/generate_session_certs.sh"

echo ""
echo "[2/2] Starting Docker services..."
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
