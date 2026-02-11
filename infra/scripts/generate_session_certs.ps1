# PowerShell version of certificate generation script
$ErrorActionPreference = "Stop"

# Use native Windows openssl directly
function Invoke-OpenSSL {
    openssl @args
}

$OUT_DIR = Join-Path (Split-Path $PSScriptRoot -Parent) "certs"
New-Item -ItemType Directory -Force -Path $OUT_DIR | Out-Null
Push-Location $OUT_DIR

$CA_KEY = "repo-ca.key"
$CA_CERT = "ca.crt"
$SERVER_KEY = "demo.indexer.key"
$SERVER_CSR = "demo.indexer.csr"
$SERVER_CERT = "demo.indexer.crt"
$CLIENT_KEY = "manager-client.key"
$CLIENT_CSR = "manager-client.csr"
$CLIENT_CERT = "manager-client.crt"

# Create CA
if (!(Test-Path $CA_KEY)) {
    Write-Host "Generating CA key..."
    Invoke-OpenSSL genrsa -out $CA_KEY 4096
}
if (!(Test-Path $CA_CERT)) {
    Write-Host "Generating CA certificate..."
    Invoke-OpenSSL req -x509 -new -nodes -key $CA_KEY -sha256 -days 3650 -subj "/CN=gla1v3-repo-ca" -out $CA_CERT
}
if ((Test-Path $CA_KEY) -and (Test-Path $CA_CERT)) {
    Write-Host "CA ready (key + cert exist)"
}

# Server cert for demo.indexer
Write-Host "Generating server cert for demo.indexer..."
Invoke-OpenSSL genrsa -out $SERVER_KEY 2048
Invoke-OpenSSL req -new -key $SERVER_KEY -out $SERVER_CSR -subj "/CN=demo.indexer"
@"
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = DNS:demo.indexer,IP:127.0.0.1
"@ | Out-File -Encoding ASCII -FilePath "demo.indexer.ext"
Invoke-OpenSSL x509 -req -in $SERVER_CSR -CA $CA_CERT -CAkey $CA_KEY -CAcreateserial -out $SERVER_CERT -days 365 -sha256 -extfile demo.indexer.ext
Remove-Item -Force $SERVER_CSR, "demo.indexer.ext" -ErrorAction SilentlyContinue

# Client cert for manager/filebeat (optional for mTLS)
Write-Host "Generating client cert for manager (optional mTLS)..."
Invoke-OpenSSL genrsa -out $CLIENT_KEY 2048
Invoke-OpenSSL req -new -key $CLIENT_KEY -out $CLIENT_CSR -subj "/CN=manager-client"
@"
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = clientAuth
"@ | Out-File -Encoding ASCII -FilePath "manager-client.ext"
Invoke-OpenSSL x509 -req -in $CLIENT_CSR -CA $CA_CERT -CAkey $CA_KEY -CAcreateserial -out $CLIENT_CERT -days 365 -sha256 -extfile manager-client.ext
Remove-Item -Force $CLIENT_CSR, "manager-client.ext" -ErrorAction SilentlyContinue

# Traefik / C2 server cert
$TRAEFIK_KEY = "traefik.key"
$TRAEFIK_CSR = "traefik.csr"
$TRAEFIK_CERT = "traefik.crt"

Write-Host "Generating Traefik / C2 cert (c2.gla1v3.local)..."
Invoke-OpenSSL genrsa -out $TRAEFIK_KEY 2048
Invoke-OpenSSL req -new -key $TRAEFIK_KEY -out $TRAEFIK_CSR -subj "/CN=c2.gla1v3.local"
@"
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = DNS:c2.gla1v3.local,DNS:traefik,DNS:dashboard.gla1v3.local,DNS:api.gla1v3.local,IP:127.0.0.1,DNS:localhost
"@ | Out-File -Encoding ASCII -FilePath "traefik.ext"
Invoke-OpenSSL x509 -req -in $TRAEFIK_CSR -CA $CA_CERT -CAkey $CA_KEY -CAcreateserial -out $TRAEFIK_CERT -days 365 -sha256 -extfile traefik.ext
Remove-Item -Force $TRAEFIK_CSR, "traefik.ext" -ErrorAction SilentlyContinue

# Create filenames services expect in repo (keeps everything self-contained)
Copy-Item -Force $TRAEFIK_CERT "c2.gla1v3.local.crt"
Copy-Item -Force $TRAEFIK_KEY "c2.gla1v3.local.key"
Copy-Item -Force $TRAEFIK_CERT "server.crt"
Copy-Item -Force $TRAEFIK_KEY "server.key"

Write-Host "`nGenerated certs in: $OUT_DIR"
Get-ChildItem $OUT_DIR

Write-Host "`nNote: Private keys have standard Windows permissions."
Write-Host "For production, use proper secrets management."

Pop-Location
