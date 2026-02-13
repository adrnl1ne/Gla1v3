$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$BackupFile = "backups\gla1v3_manual_backup_$Timestamp.sql"

Write-Host "Starting manual database backup..." -ForegroundColor Cyan
Write-Host "Backup file: $BackupFile" -ForegroundColor White

docker exec gla1v3-postgres pg_dump -U gla1v3_app -d gla1v3 | Out-File -FilePath $BackupFile -Encoding UTF8

if ($LASTEXITCODE -eq 0) {
    # Compress the backup
    Compress-Archive -Path $BackupFile -DestinationPath "$BackupFile.zip" -Force
    Remove-Item $BackupFile
    
    Write-Host "✅ Backup completed successfully: $BackupFile.zip" -ForegroundColor Green
    Get-Item "$BackupFile.zip" | Format-List Name, Length, LastWriteTime
} else {
    Write-Host "❌ Backup failed!" -ForegroundColor Red
    exit 1
}
