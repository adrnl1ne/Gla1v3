#Requires -Version 5.1

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Gla1v3 Database Startup" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# Note: Docker Compose will create the network if needed
# No manual network creation required

# Check if .env exists
if (-not (Test-Path .env)) {
    Write-Host "⚠️  No .env file found. Creating with default password..." -ForegroundColor Yellow
    
    # Generate secure password
    $bytes = New-Object byte[] 32
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $DB_PASSWORD = [Convert]::ToBase64String($bytes) -replace '[+/=]', '' | Select-Object -First 32
    
    @"
# PostgreSQL Configuration
DB_PASSWORD=$DB_PASSWORD
BACKUP_KEEP_DAYS=7
"@ | Out-File -FilePath .env -Encoding ASCII
    
    Write-Host "✅ Generated secure database password in .env" -ForegroundColor Green
    Write-Host "   Password: $DB_PASSWORD" -ForegroundColor White
    Write-Host ""
}

# Start database
Write-Host "Starting PostgreSQL database..." -ForegroundColor White
docker-compose -f docker-compose.db.yml up -d

Write-Host ""
Write-Host "Waiting for database to be healthy..." -ForegroundColor White
$timeout = 60
$elapsed = 0
$ready = $false

while ($elapsed -lt $timeout) {
    $result = docker exec gla1v3-postgres pg_isready -U gla1v3_app -d gla1v3 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Database is ready!" -ForegroundColor Green
        $ready = $true
        break
    }
    Start-Sleep -Seconds 2
    $elapsed += 2
    Write-Host -NoNewline "."
}

if (-not $ready) {
    Write-Host ""
    Write-Host "❌ Database failed to start within $timeout seconds" -ForegroundColor Red
    docker-compose -f docker-compose.db.yml logs postgres
    exit 1
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  Database Started Successfully" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  Database: gla1v3" -ForegroundColor White
Write-Host "  User: gla1v3_app" -ForegroundColor White
Write-Host "  Host: localhost:5432 (from host)" -ForegroundColor White
Write-Host "  Host: postgres:5432 (from containers)" -ForegroundColor White
Write-Host "  Backups: .\backups\ (daily at 3 AM)" -ForegroundColor White
Write-Host "==========================================" -ForegroundColor Green
