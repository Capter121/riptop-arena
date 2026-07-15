$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Blender = "D:\Program Files\Blender Foundation\Blender 4.5\blender.exe"
$LogDir = Join-Path $ProjectRoot "build\logs"
$Parts = @("blade_dual_comet", "assist_heavy", "assist_guard")
$Assemblies = @(
    "assembly_storm_attack",
    "assembly_phase2a_storm_fang", "assembly_phase2a_iron_bastion",
    "assembly_phase2a_orbit_halo", "assembly_phase2a_dual_comet",
    "assembly_phase2b_assist_guard", "assembly_phase2b_assist_air"
)

function Invoke-Logged([string]$Executable, [string[]]$Arguments, [string]$Name) {
    & $Executable @Arguments 2>&1 | Tee-Object -FilePath (Join-Path $LogDir $Name)
    if ($LASTEXITCODE -ne 0) { throw "$Name failed with exit code $LASTEXITCODE" }
}

if (-not (Test-Path -LiteralPath $Blender -PathType Leaf)) { throw "Blender 4.5.11 was not found: $Blender" }
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
Push-Location $ProjectRoot
try {
    Invoke-Logged "python" @("scripts\validate_specs.py", "--scope", "phase2b") "phase2b-r1-specs.log"
    foreach ($part in $Parts) {
        Invoke-Logged $Blender @("--background", "--python", "blender\generate_parts.py", "--", "--part", $part) "phase2b-r1-generate-$part.log"
    }
    foreach ($assembly in $Assemblies) {
        Invoke-Logged $Blender @("--background", "--python", "blender\generate_assemblies.py", "--", "--assembly", $assembly) "phase2b-r1-generate-$assembly.log"
    }
    Invoke-Logged $Blender @("--background", "--python", "blender\render_phase2b_r1.py") "phase2b-r1-render-dual.log"
    Invoke-Logged $Blender @("--background", "--python", "blender\render_catalog.py", "--", "--target", "phase2b_all_assists") "phase2b-r1-render-assists.log"
    foreach ($assembly in @("assembly_storm_attack", "assembly_phase2b_assist_guard", "assembly_phase2b_assist_air")) {
        Invoke-Logged $Blender @("--background", "--python", "blender\render_catalog.py", "--", "--target", $assembly) "phase2b-r1-render-$assembly.log"
    }
    Invoke-Logged "python" @("scripts\analyze_phase2b_r1_dual_comet.py") "phase2b-r1-analyze-dual.log"
    Invoke-Logged "python" @("scripts\build_phase2b_r1_visuals.py") "phase2b-r1-build-visuals.log"
    Write-Host "NSS_PHASE2B_R1_BUILD=PASS"
    Write-Host "NSS_PHASE2B_R1_CARTESIAN_PRODUCT_EXECUTED=false"
} finally {
    Pop-Location
}
