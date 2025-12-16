#!/usr/bin/env bash
set -e

OUT_DIR="$(cd "$(dirname "$0")" && cd .. && pwd)/certs"
mkdir -p "$OUT_DIR"
cd "$OUT_DIR"

CA_KEY=repo-ca.key
CA_CERT=ca.crt
SERVER_KEY=demo.indexer.key
SERVER_CSR=demo.indexer.csr
SERVER_CERT=demo.indexer.crt
CLIENT_KEY=manager-client.key
CLIENT_CSR=manager-client.csr
CLIENT_CERT=manager-client.crt

# Create CA
if [ ! -f "$CA_KEY" ] || [ ! -f "$CA_CERT" ]; then
  echo "Generating repo CA..."
  openssl genrsa -out "$CA_KEY" 4096
  openssl req -x509 -new -nodes -key "$CA_KEY" -sha256 -days 3650 -subj "/CN=gla1v3-repo-ca" -out "$CA_CERT"
else
  echo "CA already exists, skipping generation."
fi

# Server cert for demo.indexer
echo "Generating server cert for demo.indexer..."
openssl genrsa -out "$SERVER_KEY" 2048
openssl req -new -key "$SERVER_KEY" -out "$SERVER_CSR" -subj "/CN=demo.indexer"
cat > demo.indexer.ext <<EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = DNS:demo.indexer,IP:127.0.0.1
EOF
openssl x509 -req -in "$SERVER_CSR" -CA "$CA_CERT" -CAkey "$CA_KEY" -CAcreateserial -out "$SERVER_CERT" -days 365 -sha256 -extfile demo.indexer.ext
rm -f "$SERVER_CSR" demo.indexer.ext

# Client cert for manager/filebeat (optional for mTLS)
echo "Generating client cert for manager (optional mTLS)..."
openssl genrsa -out "$CLIENT_KEY" 2048
openssl req -new -key "$CLIENT_KEY" -out "$CLIENT_CSR" -subj "/CN=manager-client"
cat > manager-client.ext <<EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = clientAuth
EOF
openssl x509 -req -in "$CLIENT_CSR" -CA "$CA_CERT" -CAkey "$CA_KEY" -CAcreateserial -out "$CLIENT_CERT" -days 365 -sha256 -extfile manager-client.ext
rm -f "$CLIENT_CSR" manager-client.ext

# Traefik / C2 server cert
TRAEFIK_KEY=traefik.key
TRAEFIK_CSR=traefik.csr
TRAEFIK_CERT=traefik.crt

echo "Generating Traefik / C2 cert (c2.gla1v3.local)..."
openssl genrsa -out "$TRAEFIK_KEY" 2048
openssl req -new -key "$TRAEFIK_KEY" -out "$TRAEFIK_CSR" -subj "/CN=c2.gla1v3.local"
cat > traefik.ext <<EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = DNS:c2.gla1v3.local,DNS:traefik,DNS:dashboard.gla1v3.local,DNS:api.gla1v3.local,IP:127.0.0.1,DNS:localhost
EOF
openssl x509 -req -in "$TRAEFIK_CSR" -CA "$CA_CERT" -CAkey "$CA_KEY" -CAcreateserial -out "$TRAEFIK_CERT" -days 365 -sha256 -extfile traefik.ext
rm -f "$TRAEFIK_CSR" traefik.ext

# Create filenames services expect in repo (keeps everything self-contained)
cp -f "$TRAEFIK_CERT" c2.gla1v3.local.crt
cp -f "$TRAEFIK_KEY" c2.gla1v3.local.key
cp -f "$TRAEFIK_CERT" server.crt
cp -f "$TRAEFIK_KEY" server.key

echo "Generated certs in: $OUT_DIR"
ls -la "$OUT_DIR" || true

# Secure private keys
echo "Setting key permissions to 644 for private keys so non-root containers can read them (dev)."
echo "Note: For production, use docker secrets or a secrets manager and restrict permissions to 600."
# Make keys readable so containers running as non-root can access them when mounted from the repo.
chmod 644 "$OUT_DIR"/*.key || true

