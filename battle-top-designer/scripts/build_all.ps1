$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $ProjectRoot "build\logs"
$Parts = @("core_solar_wolf", "blade_storm_fang", "assist_heavy", "gear_low", "tip_flat_attack")

function Find-Blender {
    $candidates = @(
        $env:BLENDER_EXE,
        "D:\Program Files\Blender Foundation\Blender 4.5\blender.exe",
        "$env:ProgramFiles\Blender Foundation\Blender 4.5\blender.exe",
        "$env:ProgramFiles\Blender Foundation\Blender 4.4\blender.exe"
    ) | Where-Object { $_ }
    $command = Get-Command blender.exe -ErrorAction SilentlyContinue
    if ($command) { $candidates = @($command.Source) + $candidates }
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { return (Resolve-Path -LiteralPath $candidate).Path }
    }
    throw "Blender executable was not found. Checked PATH, BLENDER_EXE, Blender 4.5 and Blender 4.4 under Program Files."
}

function Invoke-Logged([string]$Executable, [string[]]$Arguments, [string]$LogName) {
    $logPath = Join-Path $LogDir $LogName
    & $Executable @Arguments 2>&1 | Tee-Object -FilePath $logPath
    if ($LASTEXITCODE -ne 0) { throw "Command failed with exit code $LASTEXITCODE. Log: $logPath" }
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Blender = Find-Blender
Write-Host "NSS_BLENDER=$Blender"
Push-Location $ProjectRoot
try {
    Invoke-Logged "python" @("scripts\validate_specs.py", "--scope", "vertical_slice") "build-specs.log"
    foreach ($part in $Parts) {
        Invoke-Logged $Blender @("--background", "--python", "blender\generate_parts.py", "--", "--part", $part) "generate-$part.log"
    }
    Invoke-Logged $Blender @("--background", "--python", "blender\generate_assemblies.py", "--", "--assembly", "assembly_storm_attack") "generate-assembly_storm_attack.log"
    Invoke-Logged $Blender @("--background", "--python", "blender\render_catalog.py", "--", "--target", "blade_storm_fang") "render-blade_storm_fang.log"
    Invoke-Logged $Blender @("--background", "--python", "blender\render_catalog.py", "--", "--target", "assembly_storm_attack") "render-assembly_storm_attack.log"
    Invoke-Logged "python" @("scripts\make_contact_sheets.py") "build-contact-sheets.log"
    Write-Host "NSS_BUILD=PASS"
} finally {
    Pop-Location
}
