Write-Host ""
Write-Host "=== GLA1V3 Infrastructure Startup ===" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/2] Generating session certificates..." -ForegroundColor Yellow
& "$PSScriptRoot\generate_session_certs.ps1"

if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) {
    Write-Host "Certificate generation failed!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[2/2] Starting Docker services..." -ForegroundColor Yellow
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
