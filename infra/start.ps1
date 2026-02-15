Write-Host ""
Write-Host "=== GLA1V3 Infrastructure Startup ===" -ForegroundColor Cyan
Write-Host ""

# Check if root .env file exists and has required variables
$rootEnvPath = "$PSScriptRoot\..\.env"
if (-not (Test-Path $rootEnvPath)) {
    Write-Host "⚠️  No root .env file found at $rootEnvPath. Please copy .env.example to repo root and configure." -ForegroundColor Yellow
    exit 1
}

# Check for required environment variables
$envContent = Get-Content $rootEnvPath -Raw
$requiredVars = @('JWT_SECRET', 'ADMIN_PASSWORD', 'DB_PASSWORD', 'REDIS_PASSWORD')
$missing = @()

foreach ($var in $requiredVars) {
    if ($envContent -notmatch "$var=") {
        $missing += $var
    }
}

if ($missing.Count -gt 0) {
    Write-Host "⚠️  Missing required environment variables in .env:" -ForegroundColor Yellow
    $missing | ForEach-Object { Write-Host "   - $_" -ForegroundColor Yellow }
    Write-Host ""
    Write-Host "Please add these to your .env file." -ForegroundColor Yellow
    exit 1
}

# Sync DB_PASSWORD to database .env
Write-Host "[1/4] Synchronizing database configuration..." -ForegroundColor Yellow
$dbPassword = ($envContent | Select-String "DB_PASSWORD=(.+)" | ForEach-Object { $_.Matches.Groups[1].Value })
if (Test-Path "$PSScriptRoot\db\.env") {
    $dbEnvContent = Get-Content "$PSScriptRoot\db\.env" -Raw
    $dbEnvContent = $dbEnvContent -replace "DB_PASSWORD=.+", "DB_PASSWORD=$dbPassword"
    $dbEnvContent | Out-File -FilePath "$PSScriptRoot\db\.env" -Encoding ASCII -NoNewline
} else {
    @"
# PostgreSQL Configuration
# Generate a secure password by running: openssl rand -base64 32
DB_PASSWORD=$dbPassword
BACKUP_KEEP_DAYS=7
"@ | Out-File -FilePath "$PSScriptRoot\db\.env" -Encoding ASCII -NoNewline
}

# Ensure docker-compose picks up environment: copy root .env into infra/.env
$infraEnvPath = "$PSScriptRoot\.env"
Copy-Item -Force $rootEnvPath -Destination $infraEnvPath
Write-Host "[0/6] Copied repo root .env -> infra/.env (so docker compose has env vars)" -ForegroundColor Cyan

# Sync DB_PASSWORD to root .env for backend
$rootEnvPath = "$PSScriptRoot\..\.env"
if (Test-Path $rootEnvPath) {
    $rootEnvContent = Get-Content $rootEnvPath -Raw
    $rootEnvContent = $rootEnvContent -replace "DB_PASSWORD=.+", "DB_PASSWORD=$dbPassword"
    $rootEnvContent | Out-File -FilePath $rootEnvPath -Encoding ASCII -NoNewline
} else {
    @"
# Backend Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=gla1v3
DB_USER=gla1v3_api
DB_PASSWORD=$dbPassword

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d

# Server Configuration
PORT=3000
NODE_ENV=development
"@ | Out-File -FilePath $rootEnvPath -Encoding ASCII -NoNewline
}

Write-Host ""
Write-Host "[2/4] Starting PostgreSQL database..." -ForegroundColor Yellow
if (Test-Path "$PSScriptRoot\db") {
    Set-Location "$PSScriptRoot\db"
    & .\start-db.ps1
    Set-Location $PSScriptRoot
    Write-Host ""
}

Write-Host "[3/4] Generating session certificates..." -ForegroundColor Yellow
& "$PSScriptRoot\scripts\generate_session_certs.ps1"

if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) {
    Write-Host "Certificate generation failed!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[4/6] Starting Docker services..." -ForegroundColor Yellow
Set-Location $PSScriptRoot
docker compose up -d --build

if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker startup failed!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[5/6] Starting Wazuh EDR (optional)..." -ForegroundColor Yellow
if (Test-Path "$PSScriptRoot\wazuh") {
    Write-Host "→ Wazuh folder detected — starting optional EDR stack" -ForegroundColor Cyan
    Set-Location "$PSScriptRoot\wazuh"
    & docker compose up -d
    if ($LASTEXITCODE -ne 0) {
        Write-Host "⚠️  Wazuh EDR failed to start (platform will work without EDR)" -ForegroundColor Yellow
    } else {
        Write-Host "✓ Wazuh EDR started (if configured)" -ForegroundColor Green
    }
    Set-Location $PSScriptRoot
} else {
    Write-Host "→ No 'infra/wazuh' folder found; skipping optional EDR start" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "[6/6] Verifying services..." -ForegroundColor Yellow
Start-Sleep -Seconds 3
$running = docker ps --filter "name=gla1v3" --format "{{.Names}}" | Measure-Object | Select-Object -ExpandProperty Count
Write-Host "✓ $running core services running" -ForegroundColor Green

Write-Host ""
Write-Host "Infrastructure started successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Services:" -ForegroundColor Cyan
Write-Host "  Dashboard: https://dashboard.gla1v3.local" -ForegroundColor White
Write-Host "  API:       https://api.gla1v3.local" -ForegroundColor White
Write-Host "  C2:        https://c2.gla1v3.local" -ForegroundColor White
Write-Host "  CA:        https://ca.gla1v3.local" -ForegroundColor White
if (docker ps --filter "name=wazuh-edr" --format "{{.Names}}" | Select-String "wazuh-edr") {
    Write-Host "  Wazuh EDR: http://localhost:8443 (admin/SecretPassword)" -ForegroundColor White
}
Write-Host ""
Write-Host "Default Credentials:" -ForegroundColor Cyan
Write-Host "  Username: admin" -ForegroundColor White
Write-Host "  Password: admin123" -ForegroundColor White
Write-Host ""
