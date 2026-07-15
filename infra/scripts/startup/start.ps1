Write-Host ""
Write-Host "=== GLA1V3 Infrastructure Startup ===" -ForegroundColor Cyan
Write-Host ""

# Check if root .env file exists and has required variables
$rootEnvPath = "$PSScriptRoot\..\..\..\.env"
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
Write-Host "[0/3] Synchronizing database configuration..." -ForegroundColor Yellow
$dbPassword = ($envContent | Select-String "DB_PASSWORD=(.+)" | ForEach-Object { $_.Matches.Groups[1].Value })
if (Test-Path "$PSScriptRoot\..\database\.env") {
    $dbEnvContent = Get-Content "$PSScriptRoot\..\database\.env" -Raw
    $dbEnvContent = $dbEnvContent -replace "DB_PASSWORD=.+", "DB_PASSWORD=$dbPassword"
    $dbEnvContent | Out-File -FilePath "$PSScriptRoot\..\database\.env" -Encoding ASCII -NoNewline
} else {
    @"
# PostgreSQL Configuration
# Generate a secure password by running: openssl rand -base64 32
DB_PASSWORD=$dbPassword
BACKUP_KEEP_DAYS=7
"@ | Out-File -FilePath "$PSScriptRoot\..\database\.env" -Encoding ASCII -NoNewline
}

# Sync DB_PASSWORD to root .env for backend
$rootEnvPath = "$PSScriptRoot\..\..\..\.env"
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

Write-Host "[1/3] Starting PostgreSQL database..." -ForegroundColor Yellow
if (Test-Path "$PSScriptRoot\..\database") {
    Set-Location "$PSScriptRoot\..\database"
    & .\start-db.ps1
    Set-Location $PSScriptRoot
    Write-Host ""
}

Write-Host "[2/3] Generating session certificates..." -ForegroundColor Yellow
& "$PSScriptRoot\..\certgen\generate_session_certs.ps1"

if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) {
    Write-Host "Certificate generation failed!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[3/3] Starting Docker services..." -ForegroundColor Yellow
Set-Location "$PSScriptRoot\.."
docker compose --env-file ../../.env up -d --build

if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker startup failed!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[3/3] Verifying services..." -ForegroundColor Yellow
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
Write-Host ""
Write-Host "Default Credentials:" -ForegroundColor Cyan
Write-Host "  Username: admin" -ForegroundColor White
Write-Host "  Password: admin123" -ForegroundColor White
Write-Host ""
