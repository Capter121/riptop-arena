param(
    [ValidateSet("VerticalSlice", "Phase2A", "StormAttackRegression", "Phase2BRepresentative", "Phase2B")]
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
$Phase2BParts = @(
    "core_void_falcon", "assist_guard", "assist_air", "gear_medium", "gear_high",
    "tip_ball_defense", "tip_needle_stamina", "tip_taper_balance"
)
$Phase2BSingleAssemblies = @(
    "assembly_phase2b_core_void_falcon", "assembly_phase2b_assist_guard", "assembly_phase2b_assist_air",
    "assembly_phase2b_gear_medium", "assembly_phase2b_gear_high", "assembly_phase2b_tip_ball_defense",
    "assembly_phase2b_tip_needle_stamina", "assembly_phase2b_tip_taper_balance"
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
    $Parts = if ($Scope -eq "Phase2A") { $Phase2AParts } elseif ($Scope -eq "Phase2BRepresentative") { @() } elseif ($Scope -eq "Phase2B") { $Phase2BParts } else { $VerticalParts }
    $Assemblies = if ($Scope -eq "Phase2A") { $Phase2AAssemblies } elseif ($Scope -eq "Phase2BRepresentative") { $Phase2BRepresentativeAssemblies } elseif ($Scope -eq "Phase2B") { $Phase2BSingleAssemblies + $Phase2BRepresentativeAssemblies } else { @("assembly_storm_attack") }
    $SpecScope = if ($Scope -eq "Phase2A") { "phase2a" } elseif ($Scope -in @("Phase2BRepresentative", "Phase2B")) { "phase2b" } else { "vertical_slice" }
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
    } elseif ($Scope -eq "Phase2B") {
        Invoke-Logged $Blender @("--background", "--python", "blender\render_catalog.py", "--", "--target", "core_void_falcon") "render-phase2b-core.log"
        Invoke-Logged $Blender @("--background", "--python", "blender\render_catalog.py", "--", "--target", "phase2b_all_assists") "render-phase2b-assists.log"
        Invoke-Logged $Blender @("--background", "--python", "blender\render_catalog.py", "--", "--target", "phase2b_all_gears") "render-phase2b-gears.log"
        Invoke-Logged $Blender @("--background", "--python", "blender\render_catalog.py", "--", "--target", "phase2b_all_tips") "render-phase2b-tips.log"
        foreach ($part in $Phase2BParts) {
            Invoke-Logged "python" @("scripts\make_contact_sheets.py", "--target", $part) "contact-$part.log"
        }
        Invoke-Logged "python" @("scripts\analyze_phase2b_visuals.py", "--family", "assist") "analyze-assists.log"
        Invoke-Logged "python" @("scripts\analyze_phase2b_visuals.py", "--family", "gear") "analyze-gears.log"
        Invoke-Logged "python" @("scripts\analyze_phase2b_visuals.py", "--family", "tip") "analyze-tips.log"
    } elseif ($Scope -eq "VerticalSlice") {
        Invoke-Logged $Blender @("--background", "--python", "blender\render_catalog.py", "--", "--target", "blade_storm_fang") "render-blade_storm_fang.log"
        Invoke-Logged $Blender @("--background", "--python", "blender\render_catalog.py", "--", "--target", "assembly_storm_attack") "render-assembly_storm_attack.log"
        Invoke-Logged "python" @("scripts\make_contact_sheets.py") "build-contact-sheets.log"
    }
    Write-Host "NSS_BUILD=PASS"
} finally {
    Pop-Location
}
