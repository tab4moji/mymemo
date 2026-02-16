#!/usr/bin/env pwsh
<#
.SYNOPSIS
    WSL2 Disk Compactor
.DESCRIPTION
    Reclaims disk space from WSL2 virtual hard disks (vhdx) using wsl --manage --compact.
.NOTES
    Update History:
    No.1 2026-02-16 Initial Release.
#>

Set-StrictMode -Version 3.0
$ErrorActionPreference = "Stop"

function Get-WslDistributionInfo {
    <#
    .SYNOPSIS
        Retrieves WSL distribution info from Registry.
    #>
    [CmdletBinding()]
    param()

    $DistroList = @()
    $LxssPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Lxss"

    try {
        if (-not (Test-Path $LxssPath)) {
            throw "WSL registry key not found at $LxssPath."
        }

        $SubKeys = Get-ChildItem -Path $LxssPath -ErrorAction Stop

        foreach ($Key in $SubKeys) {
            $DistroName = $null
            $BasePath = $null
            $VhdxPath = $null

            # Get Distribution Name
            if ($Key.Property -contains "DistributionName") {
                $DistroName = Get-ItemProperty -Path $Key.PSPath -Name "DistributionName" | Select-Object -ExpandProperty DistributionName
            }

            # Get Base Path
            if ($Key.Property -contains "BasePath") {
                $BasePath = Get-ItemProperty -Path $Key.PSPath -Name "BasePath" | Select-Object -ExpandProperty BasePath
            }

            # Construct VHDX Path
            if (-not [string]::IsNullOrEmpty($BasePath)) {
                $PotentialPath = Join-Path -Path $BasePath -ChildPath "ext4.vhdx"
                if (Test-Path $PotentialPath) {
                    $VhdxPath = $PotentialPath
                }
            }

            # Add to list if valid VHDX found
            if (-not [string]::IsNullOrEmpty($DistroName) -and -not [string]::IsNullOrEmpty($VhdxPath)) {
                $DistroList += [PSCustomObject]@{
                    Name     = $DistroName
                    VhdxPath = $VhdxPath
                }
            }
        }
    }
    catch {
        Write-Error "Failed to retrieve WSL information: $_"
        # Exception based guard, but returning empty array on failure for safety in loop
        $DistroList = @() 
    }

    return $DistroList
}

function Format-FileSize {
    <#
    .SYNOPSIS
        Formats bytes into human readable string.
    #>
    [CmdletBinding()]
    param(
        [long]$Bytes
    )

    $Result = ""
    $Units = @("B", "KiB", "MiB", "GiB", "TiB")
    $Index = 0

    try {
        $Value = [double]$Bytes
        while ($Value -ge 1024 -and $Index -lt ($Units.Count - 1)) {
            $Value /= 1024
            $Index++
        }
        $Result = "{0:N2} {1}" -f $Value, $Units[$Index]
    }
    catch {
        Write-Error "Error formatting file size: $_"
        $Result = "0 B"
    }

    return $Result
}

function Invoke-WslCompact {
    <#
    .SYNOPSIS
        Executes the compaction process for a list of distributions.
    #>
    [CmdletBinding()]
    param(
        [array]$Distributions
    )

    $TotalReclaimed = 0
    $ResultStatus = $true

    try {
        Write-Host "Shutting down WSL instances..." -ForegroundColor Cyan
        wsl --shutdown
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to shutdown WSL."
        }
        
        # Small pause to ensure file handles are released
        Start-Sleep -Seconds 2

        foreach ($Distro in $Distributions) {
            Write-Host "--------------------------------------------------"
            Write-Host "Target: $($Distro.Name)" -ForegroundColor Yellow
            
            $FileItem = Get-Item -Path $Distro.VhdxPath -ErrorAction Stop
            $SizeBefore = $FileItem.Length
            
            Write-Host "  Path: $($Distro.VhdxPath)"
            Write-Host "  Size (Before): $(Format-FileSize $SizeBefore)"

            Write-Host "  Compacting..." -NoNewline
            
            # Execute WSL native compact command
            wsl --manage $Distro.Name --compact
            
            if ($LASTEXITCODE -eq 0) {
                Write-Host " Done." -ForegroundColor Green
                
                $FileItem.Refresh()
                $SizeAfter = $FileItem.Length
                $Diff = $SizeBefore - $SizeAfter
                $TotalReclaimed += $Diff

                Write-Host "  Size (After) : $(Format-FileSize $SizeAfter)"
                
                if ($Diff -gt 0) {
                    Write-Host "  Reclaimed    : $(Format-FileSize $Diff)" -ForegroundColor Cyan
                } else {
                    Write-Host "  No space reclaimed." -ForegroundColor Gray
                }
            }
            else {
                Write-Host " Failed." -ForegroundColor Red
                Write-Error "wsl --manage failed for $($Distro.Name)"
            }
        }

        Write-Host "=================================================="
        Write-Host "Total Space Reclaimed: $(Format-FileSize $TotalReclaimed)" -ForegroundColor Magenta
        Write-Host "=================================================="

    }
    catch {
        Write-Error "An unexpected error occurred during compaction: $_"
        $ResultStatus = $false
    }

    return $ResultStatus
}

function Main {
    <#
    .SYNOPSIS
        Entry point.
    #>
    $ExitCode = 0

    try {
        Write-Host "Starting WSL Disk Compactor (PowerShell 7)..." -ForegroundColor Cyan
        
        $Distros = Get-WslDistributionInfo

        if ($Distros.Count -eq 0) {
            Write-Warning "No WSL distributions with valid VHDX files found."
            throw "No targets found."
        }

        $Success = Invoke-WslCompact -Distributions $Distros
        
        if (-not $Success) {
            throw "Compaction process completed with errors."
        }
    }
    catch {
        Write-Error $_
        $ExitCode = 1
    }

    return $ExitCode
}

# Execution
$Global:LastExitCode = Main
