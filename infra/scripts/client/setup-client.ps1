# Gla1v3 Client Setup Script
# Run this on client devices to configure DNS and CA trust
# Requires: PowerShell with admin privileges

param(
    [string]$ServerIP = "192.168.1.125"  # Change this to your Gla1v3 server IP
)

# Requires admin privileges
#Requires -RunAsAdministrator

Write-Host "Gla1v3 Client Setup" -ForegroundColor Cyan
Write-Host "===================" -ForegroundColor Cyan

# Backup hosts file
$hostsPath = "$env:windir\System32\drivers\etc\hosts"
$backupPath = "$hostsPath.backup.$(Get-Date -Format 'yyyyMMddHHmmss')"
Copy-Item $hostsPath $backupPath
Write-Host "✓ Backed up hosts file to: $backupPath"

# Add Gla1v3 entries to hosts
$hostsEntries = @"
$ServerIP dashboard.gla1v3.local
$ServerIP api.gla1v3.local
$ServerIP c2.gla1v3.local
$ServerIP ca.gla1v3.local
"@

Add-Content $hostsPath "`n# Gla1v3 entries"
Add-Content $hostsPath $hostsEntries
Write-Host "✓ Added Gla1v3 DNS entries to hosts file"

# Download CA certificate (requires accepting cert first)
$caUrl = "https://ca.gla1v3.local/ca.crt"
$caPath = "$env:TEMP\gla1v3-ca.crt"

try {
    Invoke-WebRequest -Uri $caUrl -OutFile $caPath -SkipCertificateCheck
    Write-Host "✓ Downloaded CA certificate"
} catch {
    Write-Host "⚠️  Failed to download CA certificate. Please ensure you can access https://ca.gla1v3.local and have accepted the certificate." -ForegroundColor Yellow
    Write-Host "   You can manually download ca.crt from the server and place it at: $caPath" -ForegroundColor Yellow
    exit 1
}

# Install CA certificate
try {
    $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2
    $cert.Import($caPath)

    $store = New-Object System.Security.Cryptography.X509Certificates.X509Store("Root", "LocalMachine")
    $store.Open("ReadWrite")
    $store.Add($cert)
    $store.Close()

    Write-Host "✓ Installed CA certificate to Trusted Root store"
} catch {
    Write-Host "❌ Failed to install CA certificate: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Clean up
Remove-Item $caPath -ErrorAction SilentlyContinue

# Flush DNS
ipconfig /flushdns | Out-Null
Write-Host "✓ Flushed DNS cache"

Write-Host ""
Write-Host "Setup complete! You can now access:" -ForegroundColor Green
Write-Host "  Dashboard: https://dashboard.gla1v3.local" -ForegroundColor White
Write-Host "  Login: admin / admin123" -ForegroundColor White
Write-Host ""
Write-Host "Note: Restart your browser if you still see certificate warnings." -ForegroundColor Yellow