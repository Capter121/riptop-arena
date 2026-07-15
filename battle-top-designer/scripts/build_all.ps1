param(
    [ValidateSet("VerticalSlice", "Phase2A", "StormAttackRegression", "Phase2BRepresentative")]
    [string]$Scope = "VerticalSlice"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $ProjectRoot "build\logs"
$VerticalParts = @("core_solar_wolf", "blade_storm_fang", "assist_heavy", "gear_low", "tip_flat_attack")
$Phase2AParts = @("core_solar_wolf", "blade_storm_fang", "blade_iron_bastion", "blade_orbit_halo", "blade_dual_comet", "assist_heavy", "gear_low", "tip_flat_attack")
$Phase2AAssemblies = @("assembly_phase2a_storm_fang", "assembly_phase2a_iron_bastion", "assembly_phase2a_orbit_halo", "assembly_phase2a_dual_comet")
$Phase2BRepresentativeAssemblies = @(
    "assembly_phase2b_attack_representative",
    "assembly_phase2b_defense_representative",
    "assembly_phase2b_stamina_representative",
    "assembly_phase2b_balance_representative"
)

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
    $Parts = if ($Scope -eq "Phase2A") { $Phase2AParts } elseif ($Scope -eq "Phase2BRepresentative") { @() } else { $VerticalParts }
    $Assemblies = if ($Scope -eq "Phase2A") { $Phase2AAssemblies } elseif ($Scope -eq "Phase2BRepresentative") { $Phase2BRepresentativeAssemblies } else { @("assembly_storm_attack") }
    $SpecScope = if ($Scope -eq "Phase2A") { "phase2a" } elseif ($Scope -eq "Phase2BRepresentative") { "phase2b" } else { "vertical_slice" }
    Invoke-Logged "python" @("scripts\validate_specs.py", "--scope", $SpecScope) "build-specs.log"
    foreach ($part in $Parts) {
        Invoke-Logged $Blender @("--background", "--python", "blender\generate_parts.py", "--", "--part", $part) "generate-$part.log"
    }
    foreach ($assembly in $Assemblies) {
        Invoke-Logged $Blender @("--background", "--python", "blender\generate_assemblies.py", "--", "--assembly", $assembly) "generate-$assembly.log"
    }
    if ($Scope -eq "Phase2A") {
        Invoke-Logged $Blender @("--background", "--python", "blender\render_catalog.py", "--", "--target", "phase2a_all_blades") "render-phase2a-all-blades.log"
        Invoke-Logged "python" @("scripts\make_contact_sheets.py", "--scope", "phase2a") "build-contact-sheets.log"
        Invoke-Logged "python" @("scripts\analyze_silhouettes.py", "--input", "reports\renders", "--output", "reports\validation\blade-silhouette-overlap.json") "analyze-silhouettes.log"
    } elseif ($Scope -eq "VerticalSlice") {
        Invoke-Logged $Blender @("--background", "--python", "blender\render_catalog.py", "--", "--target", "blade_storm_fang") "render-blade_storm_fang.log"
        Invoke-Logged $Blender @("--background", "--python", "blender\render_catalog.py", "--", "--target", "assembly_storm_attack") "render-assembly_storm_attack.log"
        Invoke-Logged "python" @("scripts\make_contact_sheets.py") "build-contact-sheets.log"
    }
    Write-Host "NSS_BUILD=PASS"
} finally {
    Pop-Location
}
