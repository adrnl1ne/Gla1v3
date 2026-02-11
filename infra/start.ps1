Write-Host ""
Write-Host "=== GLA1V3 Infrastructure Startup ===" -ForegroundColor Cyan
Write-Host ""

# Check if .env file exists and has required variables
if (-not (Test-Path .env)) {
    Write-Host "⚠️  No .env file found. Please copy .env.example to .env and configure." -ForegroundColor Yellow
    exit 1
}

# Check for required environment variables
$envContent = Get-Content .env -Raw
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
DB_PASSWORD=$dbPassword
"@ | Out-File -FilePath "$PSScriptRoot\db\.env" -Encoding ASCII -NoNewline
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
Write-Host "[4/4] Starting Docker services..." -ForegroundColor Yellow
Set-Location $PSScriptRoot
docker compose up -d --build

if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker startup failed!" -ForegroundColor Red
    exit 1
}

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
