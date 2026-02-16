#Requires -Version 5.1

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)

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
    $DB_PASSWORD = ([Convert]::ToBase64String($bytes) -replace '[+/=]', '').Substring(0, 32)
    
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
docker-compose -f ../../db/docker-compose.db.yml up -d

Write-Host ""
Write-Host "Waiting for database to be healthy..." -ForegroundColor White
$timeout = 60
$elapsed = 0
$ready = $false

while ($elapsed -lt $timeout) {
    docker exec gla1v3-postgres pg_isready -U gla1v3_app -d gla1v3 2>$null
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
    docker-compose -f ../../db/docker-compose.db.yml logs postgres
    exit 1
}

Write-Host ""
Write-Host "Ensuring gla1v3_api user exists with correct password..." -ForegroundColor White

# Load DB_PASSWORD from .env
$envContent = Get-Content .env -Raw
if ($envContent -match 'DB_PASSWORD=(.+)') {
    $DB_PASSWORD = $matches[1].Trim()

    # Create/update gla1v3_api user
    $sqlCommand = @"
DO `$`$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'gla1v3_api') THEN
        CREATE ROLE gla1v3_api WITH LOGIN PASSWORD '$DB_PASSWORD';
        RAISE NOTICE 'Created gla1v3_api user';
    ELSE
        ALTER ROLE gla1v3_api WITH PASSWORD '$DB_PASSWORD';
        RAISE NOTICE 'Updated gla1v3_api password';
    END IF;
END `$`$;
GRANT CONNECT ON DATABASE gla1v3 TO gla1v3_api;
GRANT USAGE, CREATE ON SCHEMA public TO gla1v3_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO gla1v3_api;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO gla1v3_api;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO gla1v3_api;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gla1v3_api;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO gla1v3_api;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO gla1v3_api;
"@

    $ErrorActionPreference = 'Continue'
    docker exec gla1v3-postgres psql -U gla1v3_app -d gla1v3 -c $sqlCommand 2>$null | Out-Null
    $ErrorActionPreference = 'Stop'
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to configure gla1v3_api user" -ForegroundColor Red
        # Run again to show error output
        docker exec gla1v3-postgres psql -U gla1v3_app -d gla1v3 -c $sqlCommand
        exit 1
    }
    Write-Host "✅ gla1v3_api user configured" -ForegroundColor Green
}

Write-Host ""
Write-Host "Applying schema updates..." -ForegroundColor White

# Apply all init scripts to ensure schema is up to date
# This ensures new columns/tables are added even if DB was created before the scripts existed
$agentsExists = docker exec gla1v3-postgres psql -U gla1v3_app -d gla1v3 -c "SELECT 1 FROM information_schema.tables WHERE table_name = 'agents'" -t -A 2>$null
if ($agentsExists -eq "1") {
    Write-Host "  Database already initialized, skipping schema creation" -ForegroundColor Gray
} else {
    Get-ChildItem -Path ".\init\*.sql" | Sort-Object Name | ForEach-Object {
        Write-Host "  Applying: $($_.Name)" -ForegroundColor Gray
        $ErrorActionPreference = 'Continue'
        docker exec gla1v3-postgres psql -U gla1v3_app -d gla1v3 -f "/docker-entrypoint-initdb.d/$($_.Name)" 2>$null | Out-Null
        $ErrorActionPreference = 'Stop'
        if ($LASTEXITCODE -ne 0) {
            Write-Host "❌ Failed to apply $($_.Name)" -ForegroundColor Red
            docker exec gla1v3-postgres psql -U gla1v3_app -d gla1v3 -f "/docker-entrypoint-initdb.d/$($_.Name)"
            exit 1
        }
    }
}

Write-Host "✅ Schema updates applied" -ForegroundColor Green

# Apply migrations
Write-Host "Applying database migrations..." -ForegroundColor White
Get-ChildItem -Path "..\..\db\migrations\*.sql" | Sort-Object Name | ForEach-Object {
    Write-Host "  Applying migration: $($_.Name)" -ForegroundColor Gray
    $ErrorActionPreference = 'Continue'
    docker exec gla1v3-postgres psql -U gla1v3_app -d gla1v3 -f "/migrations/$($_.Name)" 2>$null | Out-Null
    $ErrorActionPreference = 'Stop'
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to apply migration $($_.Name)" -ForegroundColor Red
        docker exec gla1v3-postgres psql -U gla1v3_app -d gla1v3 -f "/migrations/$($_.Name)"
        exit 1
    }
}
Write-Host "✅ Migrations applied" -ForegroundColor Green

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  Database Started Successfully" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  Database: gla1v3" -ForegroundColor White
Write-Host "  User: gla1v3_app (admin)" -ForegroundColor White
Write-Host "  User: gla1v3_api (application)" -ForegroundColor White
Write-Host "  Host: localhost:5432 (from host)" -ForegroundColor White
Write-Host "  Host: postgres:5432 (from containers)" -ForegroundColor White
Write-Host "  Backups: .\backups\ (daily at 3 AM)" -ForegroundColor White
Write-Host "==========================================" -ForegroundColor Green
