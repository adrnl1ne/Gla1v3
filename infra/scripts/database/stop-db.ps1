$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Host "Stopping Gla1v3 database..." -ForegroundColor Yellow
docker-compose -f ../../db/docker-compose.db.yml down

Write-Host "✅ Database stopped" -ForegroundColor Green
