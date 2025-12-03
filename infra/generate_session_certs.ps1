Param()
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $repoRoot 'certs'
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
Set-Location $outDir

$CAKey = 'repo-ca.key'
$CACert = 'ca.crt'
$ServerKey = 'demo.indexer.key'
$ServerCSR = 'demo.indexer.csr'
$ServerCert = 'demo.indexer.crt'
$ClientKey = 'manager-client.key'
$ClientCSR = 'manager-client.csr'
$ClientCert = 'manager-client.crt'

if (-not (Test-Path $CAKey -PathType Leaf -ErrorAction SilentlyContinue) -or -not (Test-Path $CACert -PathType Leaf -ErrorAction SilentlyContinue)) {
    Write-Host 'Generating repo CA...'
    & openssl genrsa -out $CAKey 4096
    & openssl req -x509 -new -nodes -key $CAKey -sha256 -days 3650 -subj '/CN=gla1v3-repo-ca' -out $CACert
} else {
    Write-Host 'CA already exists, skipping generation.'
}

Write-Host 'Generating server cert for demo.indexer...'
& openssl genrsa -out $ServerKey 2048
& openssl req -new -key $ServerKey -out $ServerCSR -subj '/CN=demo.indexer'
@'
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = DNS:demo.indexer,IP:127.0.0.1
'@ | Out-File -FilePath demo.indexer.ext -Encoding ascii
& openssl x509 -req -in $ServerCSR -CA $CACert -CAkey $CAKey -CAcreateserial -out $ServerCert -days 365 -sha256 -extfile demo.indexer.ext
Remove-Item $ServerCSR, demo.indexer.ext -ErrorAction SilentlyContinue

Write-Host 'Generating client cert for manager (optional mTLS)...'
& openssl genrsa -out $ClientKey 2048
& openssl req -new -key $ClientKey -out $ClientCSR -subj '/CN=manager-client'
@'
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = clientAuth
'@ | Out-File -FilePath manager-client.ext -Encoding ascii
& openssl x509 -req -in $ClientCSR -CA $CACert -CAkey $CAKey -CAcreateserial -out $ClientCert -days 365 -sha256 -extfile manager-client.ext
Remove-Item $ClientCSR, manager-client.ext -ErrorAction SilentlyContinue

Write-Host "Generated certs in: $outDir"
Get-ChildItem -Path $outDir | Format-Table Name, Length -AutoSize
