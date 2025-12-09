# Build script for Gla1v3 Go agents
# Builds all agent binaries for Windows and Linux

param(
    [string]$OutputDir = "..\backend\public\agents",
    [switch]$Linux,
    [switch]$Windows,
    [switch]$All
)

$ErrorActionPreference = "Stop"

# If no platform specified, build for current OS
if (-not $Linux -and -not $Windows -and -not $All) {
    if ($IsLinux) {
        $Linux = $true
    } else {
        $Windows = $true
    }
}

if ($All) {
    $Linux = $true
    $Windows = $true
}

# Create output directory
$OutputPath = Join-Path $PSScriptRoot $OutputDir
if (-not (Test-Path $OutputPath)) {
    New-Item -ItemType Directory -Path $OutputPath -Force | Out-Null
}

Write-Host "Building Gla1v3 agents..." -ForegroundColor Cyan
Write-Host "Output directory: $OutputPath" -ForegroundColor Gray

# Agent list
$agents = @(
    "agent",
    "agent-fileenum",
    "agent-regenum",
    "agent-netscan",
    "agent-sysinfo"
)

$buildCount = 0
$errorCount = 0

foreach ($agent in $agents) {
    $agentPath = Join-Path "cmd" $agent
    
    if (-not (Test-Path $agentPath)) {
        Write-Warning "Agent directory not found: $agentPath"
        continue
    }
    
    # Build for Windows
    if ($Windows) {
        Write-Host "`nBuilding $agent for Windows..." -ForegroundColor Yellow
        $env:GOOS = "windows"
        $env:GOARCH = "amd64"
        $outputFile = Join-Path $OutputPath "$agent.exe"
        
        try {
            go build -o $outputFile -ldflags="-s -w" ".\$agentPath"
            if ($LASTEXITCODE -eq 0) {
                $size = (Get-Item $outputFile).Length / 1MB
                Write-Host "✓ Built: $outputFile ($([math]::Round($size, 2)) MB)" -ForegroundColor Green
                $buildCount++
            } else {
                Write-Error "Failed to build $agent for Windows"
                $errorCount++
            }
        } catch {
            Write-Error "Error building $agent for Windows: $_"
            $errorCount++
        }
    }
    
    # Build for Linux
    if ($Linux) {
        Write-Host "`nBuilding $agent for Linux..." -ForegroundColor Yellow
        $env:GOOS = "linux"
        $env:GOARCH = "amd64"
        $outputFile = Join-Path $OutputPath $agent
        
        try {
            go build -o $outputFile -ldflags="-s -w" ".\$agentPath"
            if ($LASTEXITCODE -eq 0) {
                $size = (Get-Item $outputFile).Length / 1MB
                Write-Host "✓ Built: $outputFile ($([math]::Round($size, 2)) MB)" -ForegroundColor Green
                $buildCount++
            } else {
                Write-Error "Failed to build $agent for Linux"
                $errorCount++
            }
        } catch {
            Write-Error "Error building $agent for Linux: $_"
            $errorCount++
        }
    }
}

# Reset environment variables
Remove-Item Env:\GOOS -ErrorAction SilentlyContinue
Remove-Item Env:\GOARCH -ErrorAction SilentlyContinue

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Build Summary:" -ForegroundColor Cyan
Write-Host "  Successful: $buildCount" -ForegroundColor Green
Write-Host "  Failed: $errorCount" -ForegroundColor $(if ($errorCount -gt 0) { "Red" } else { "Green" })
Write-Host "  Output: $OutputPath" -ForegroundColor Gray
Write-Host "========================================`n" -ForegroundColor Cyan

if ($errorCount -gt 0) {
    exit 1
}
