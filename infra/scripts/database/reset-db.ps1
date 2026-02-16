$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Host "==========================================" -ForegroundColor Red
Write-Host "  ⚠️  DATABASE RESET WARNING ⚠️" -ForegroundColor Red
Write-Host "==========================================" -ForegroundColor Red
Write-Host "This will:" -ForegroundColor Yellow
Write-Host "  1. Stop the database" -ForegroundColor Yellow
Write-Host "  2. DELETE ALL DATA" -ForegroundColor Yellow
Write-Host "  3. Recreate the database from scratch" -ForegroundColor Yellow
Write-Host ""
Write-Host "ALL AGENTS, TASKS, USERS, AND TENANTS WILL BE LOST!" -ForegroundColor Red
Write-Host ""

$confirmation = Read-Host "Type 'DELETE EVERYTHING' to confirm"

if ($confirmation -ne "DELETE EVERYTHING") {
    Write-Host "Reset cancelled." -ForegroundColor Green
    exit 0
}

Write-Host ""
Write-Host "Creating backup before reset..." -ForegroundColor Cyan
& .\backup-db.ps1

Write-Host ""
Write-Host "Stopping database..." -ForegroundColor Yellow
docker-compose -f ../../db/docker-compose.db.yml down

Write-Host "Removing database volume..." -ForegroundColor Yellow
docker volume rm gla1v3-postgres-data 2>$null

Write-Host "Recreating database..." -ForegroundColor Cyan
& .\start-db.ps1

Write-Host ""
Write-Host "✅ Database has been reset successfully" -ForegroundColor Green
Write-Host "   A backup was created before reset in .\backups\" -ForegroundColor White
