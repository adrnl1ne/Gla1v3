#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && cd .. && pwd)"
CERT_DIR="$REPO_ROOT/certs"
BACKUP_DIR="$REPO_ROOT/certs.backup-$(date +%Y%m%d-%H%M%S)"

if [ -d "$CERT_DIR" ] && [ "$(ls -A "$CERT_DIR")" ]; then
  echo "Backing up existing certs to $BACKUP_DIR"
  mkdir -p "$BACKUP_DIR"
  cp -a "$CERT_DIR/." "$BACKUP_DIR/"
fi

mkdir -p "$CERT_DIR"

echo "Generating certs inside a disposable container (Ubuntu)..."
docker run --rm -v "$REPO_ROOT":/work -w /work/infra ubuntu:22.04 bash -lc \
  "apt-get update -qq && apt-get install -y openssl ca-certificates bash >/dev/null && chmod +x ./generate_session_certs.sh && ./generate_session_certs.sh"

echo "Setting private key permissions to 600"
chmod 600 "$CERT_DIR"/*.key || true

echo "Done. New certs are in: $CERT_DIR"
echo "To restart the infra stack so services pick up new certs run:" \
  "(cd $REPO_ROOT/infra && docker compose down --remove-orphans && docker compose up -d --build)"

exit 0
