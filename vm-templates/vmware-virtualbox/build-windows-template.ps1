# Build Windows 10 VM Template for Gla1v3
# Automates Windows VM template creation for VMware/VirtualBox

param(
    [Parameter(Mandatory=$false)]
    [switch]$VMWare,
    
    [Parameter(Mandatory=$false)]
    [switch]$VirtualBox,
    
    [Parameter(Mandatory=$false)]
    [string]$ISOPath = "C:\ISOs\Windows10.iso",
    
    [Parameter(Mandatory=$false)]
    [string]$OutputPath = ".\",
    
    [Parameter(Mandatory=$false)]
    [string]$VMName = "Gla1v3-Windows-Target",
    
    [Parameter(Mandatory=$false)]
    [int]$RAMSize = 4096,
    
    [Parameter(Mandatory=$false)]
    [int]$CPUs = 2,
    
    [Parameter(Mandatory=$false)]
    [int]$DiskSize = 60
)

$ErrorActionPreference = "Stop"

# Validate platform selection
if (-not $VMWare -and -not $VirtualBox) {
    Write-Error "Please specify either -VMWare or -VirtualBox"
    exit 1
}

# Validate ISO exists
if (-not (Test-Path $ISOPath)) {
    Write-Error "Windows ISO not found at: $ISOPath"
    Write-Host "Download Windows 10 ISO from: https://www.microsoft.com/software-download/windows10"
    exit 1
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Gla1v3 Windows Template Builder" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Platform: $(if($VMWare){'VMware'}else{'VirtualBox'})" -ForegroundColor Green
Write-Host "VM Name: $VMName" -ForegroundColor Green
Write-Host "RAM: $RAMSize MB" -ForegroundColor Green
Write-Host "CPUs: $CPUs" -ForegroundColor Green
Write-Host "Disk: $DiskSize GB" -ForegroundColor Green
Write-Host ""

# Create unattended installation answer file
$unattendXML = @"
<?xml version="1.0" encoding="utf-8"?>
<unattend xmlns="urn:schemas-microsoft-com:unattend">
    <settings pass="windowsPE">
        <component name="Microsoft-Windows-International-Core-WinPE" processorArchitecture="amd64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS">
            <SetupUILanguage>
                <UILanguage>en-US</UILanguage>
            </SetupUILanguage>
            <InputLocale>en-US</InputLocale>
            <SystemLocale>en-US</SystemLocale>
            <UILanguage>en-US</UILanguage>
            <UserLocale>en-US</UserLocale>
        </component>
        <component name="Microsoft-Windows-Setup" processorArchitecture="amd64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS">
            <DiskConfiguration>
                <Disk wcm:action="add">
                    <CreatePartitions>
                        <CreatePartition wcm:action="add">
                            <Order>1</Order>
                            <Type>Primary</Type>
                            <Extend>true</Extend>
                        </CreatePartition>
                    </CreatePartitions>
                    <ModifyPartitions>
                        <ModifyPartition wcm:action="add">
                            <Active>true</Active>
                            <Format>NTFS</Format>
                            <Label>Windows</Label>
                            <Order>1</Order>
                            <PartitionID>1</PartitionID>
                        </ModifyPartition>
                    </ModifyPartitions>
                    <DiskID>0</DiskID>
                    <WillWipeDisk>true</WillWipeDisk>
                </Disk>
            </DiskConfiguration>
            <ImageInstall>
                <OSImage>
                    <InstallFrom>
                        <MetaData wcm:action="add">
                            <Key>/IMAGE/INDEX</Key>
                            <Value>1</Value>
                        </MetaData>
                    </InstallFrom>
                    <InstallTo>
                        <DiskID>0</DiskID>
                        <PartitionID>1</PartitionID>
                    </InstallTo>
                </OSImage>
            </ImageInstall>
            <UserData>
                <AcceptEula>true</AcceptEula>
                <FullName>Gla1v3 Target</FullName>
                <Organization>Gla1v3</Organization>
            </UserData>
        </component>
    </settings>
    <settings pass="specialize">
        <component name="Microsoft-Windows-Shell-Setup" processorArchitecture="amd64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS">
            <ComputerName>WIN10-TARGET</ComputerName>
            <TimeZone>UTC</TimeZone>
        </component>
    </settings>
    <settings pass="oobeSystem">
        <component name="Microsoft-Windows-Shell-Setup" processorArchitecture="amd64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS">
            <OOBE>
                <HideEULAPage>true</HideEULAPage>
                <HideWirelessSetupInOOBE>true</HideWirelessSetupInOOBE>
                <NetworkLocation>Work</NetworkLocation>
                <ProtectYourPC>3</ProtectYourPC>
                <SkipUserOOBE>true</SkipUserOOBE>
                <SkipMachineOOBE>true</SkipMachineOOBE>
            </OOBE>
            <UserAccounts>
                <LocalAccounts>
                    <LocalAccount wcm:action="add">
                        <Password>
                            <Value>vagrant</Value>
                            <PlainText>true</PlainText>
                        </Password>
                        <Description>Gla1v3 Default User</Description>
                        <DisplayName>vagrant</DisplayName>
                        <Group>Administrators</Group>
                        <Name>vagrant</Name>
                    </LocalAccount>
                </LocalAccounts>
            </UserAccounts>
            <AutoLogon>
                <Password>
                    <Value>vagrant</Value>
                    <PlainText>true</PlainText>
                </Password>
                <Enabled>true</Enabled>
                <Username>vagrant</Username>
            </AutoLogon>
            <FirstLogonCommands>
                <SynchronousCommand wcm:action="add">
                    <Order>1</Order>
                    <CommandLine>cmd /c powershell -ExecutionPolicy Bypass -File C:\Users\vagrant\Desktop\setup-windows-target.ps1</CommandLine>
                    <Description>Run Gla1v3 Setup</Description>
                </SynchronousCommand>
            </FirstLogonCommands>
        </component>
    </settings>
</unattend>
"@

# Save answer file
$answerFilePath = Join-Path $PSScriptRoot "autounattend.xml"
$unattendXML | Out-File -FilePath $answerFilePath -Encoding utf8
Write-Host "[+] Created unattended installation file: $answerFilePath" -ForegroundColor Green

# Copy setup script for inclusion in VM
$setupScriptSource = Join-Path (Split-Path $PSScriptRoot -Parent) "setup-windows-target.ps1"
if (-not (Test-Path $setupScriptSource)) {
    Write-Error "Setup script not found at: $setupScriptSource"
    exit 1
}

Write-Host "[+] Found setup script: $setupScriptSource" -ForegroundColor Green

# Platform-specific VM creation
if ($VMWare) {
    Write-Host ""
    Write-Host "VMware VM Creation Steps:" -ForegroundColor Yellow
    Write-Host "1. Open VMware Workstation/Player" -ForegroundColor White
    Write-Host "2. File → New Virtual Machine → Typical" -ForegroundColor White
    Write-Host "3. Select ISO: $ISOPath" -ForegroundColor White
    Write-Host "4. Guest OS: Windows 10 x64" -ForegroundColor White
    Write-Host "5. VM Name: $VMName" -ForegroundColor White
    Write-Host "6. Disk Size: $DiskSize GB" -ForegroundColor White
    Write-Host "7. Customize Hardware:" -ForegroundColor White
    Write-Host "   - RAM: $RAMSize MB" -ForegroundColor Gray
    Write-Host "   - CPUs: $CPUs" -ForegroundColor Gray
    Write-Host "   - Network: Host-only" -ForegroundColor Gray
    Write-Host "   - Add Floppy Drive → Use floppy image → Select: $answerFilePath" -ForegroundColor Gray
    Write-Host "8. Power On VM (Windows will auto-install)" -ForegroundColor White
    Write-Host "9. After installation, copy $setupScriptSource to VM Desktop" -ForegroundColor White
    Write-Host "10. Run setup script inside VM" -ForegroundColor White
    Write-Host "11. VM → Manage → Clone → Full Clone → Save as OVA" -ForegroundColor White
}

if ($VirtualBox) {
    Write-Host ""
    Write-Host "VirtualBox VM Creation Steps:" -ForegroundColor Yellow
    Write-Host "1. Open VirtualBox" -ForegroundColor White
    Write-Host "2. Machine → New" -ForegroundColor White
    Write-Host "   - Name: $VMName" -ForegroundColor Gray
    Write-Host "   - Type: Microsoft Windows" -ForegroundColor Gray
    Write-Host "   - Version: Windows 10 (64-bit)" -ForegroundColor Gray
    Write-Host "   - RAM: $RAMSize MB" -ForegroundColor Gray
    Write-Host "   - Create virtual hard disk: VDI, $DiskSize GB" -ForegroundColor Gray
    Write-Host "3. Settings → Storage → Add Optical Drive → $ISOPath" -ForegroundColor White
    Write-Host "4. Settings → Storage → Add Floppy Controller → Add Floppy → $answerFilePath" -ForegroundColor White
    Write-Host "5. Settings → Network → Adapter 1 → Host-only Adapter" -ForegroundColor White
    Write-Host "6. Start VM (Windows will auto-install)" -ForegroundColor White
    Write-Host "7. After installation, copy $setupScriptSource to VM Desktop" -ForegroundColor White
    Write-Host "8. Run setup script inside VM" -ForegroundColor White
    Write-Host "9. File → Export Appliance → OVA Format" -ForegroundColor White
}

Write-Host ""
Write-Host "Automated Installation Details:" -ForegroundColor Cyan
Write-Host "  Username: vagrant" -ForegroundColor White
Write-Host "  Password: vagrant" -ForegroundColor White
Write-Host "  Auto-login: Enabled" -ForegroundColor White
Write-Host "  First boot: Setup script will run automatically" -ForegroundColor White

Write-Host ""
Write-Host "After VM is created and setup is complete:" -ForegroundColor Cyan
Write-Host "  1. Take snapshot: 'Clean - Post Setup'" -ForegroundColor White
Write-Host "  2. Export to OVA for distribution" -ForegroundColor White
Write-Host "  3. Test by importing OVA in new VM" -ForegroundColor White

Write-Host ""
Write-Host "[✓] Template builder setup complete!" -ForegroundColor Green
Write-Host "Follow the steps above to create your Windows VM template." -ForegroundColor Green
