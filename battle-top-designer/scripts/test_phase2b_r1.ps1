$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Blender = "D:\Program Files\Blender Foundation\Blender 4.5\blender.exe"
$LogDir = Join-Path $ProjectRoot "build\logs"
$Parts = @("blade_dual_comet", "assist_heavy", "assist_guard", "assist_air")
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
    Invoke-Logged "python" @("scripts\validate_specs.py", "--self-test") "phase2b-r1-spec-self-test.log"
    Invoke-Logged "python" @("scripts\validate_specs.py", "--scope", "phase2b") "phase2b-r1-spec-test.log"
    Invoke-Logged $Blender @("--background", "--python", "blender\test_collision.py") "phase2b-r1-collision-unit.log"
    foreach ($part in $Parts) {
        Invoke-Logged $Blender @("--background", "--python", "blender\validate_collision_proxies.py", "--", "--part", $part) "phase2b-r1-collider-$part.log"
        Invoke-Logged $Blender @("--background", "--python", "blender\validate_geometry.py", "--", "--part", $part) "phase2b-r1-geometry-$part.log"
        $slug = $part.Replace("_", "-")
        Invoke-Logged "node" @("scripts\validate_gltf.mjs", "--input", "public\models\parts\$part.glb", "--output", "reports\validation\gltf-$slug.json") "phase2b-r1-gltf-$part.log"
    }
    foreach ($assembly in $Assemblies) {
        Invoke-Logged $Blender @("--background", "--python", "blender\validate_assemblies.py", "--", "--assembly", $assembly) "phase2b-r1-assembly-$assembly.log"
        $slug = $assembly.Replace("_", "-")
        Invoke-Logged "node" @("scripts\validate_gltf.mjs", "--input", "public\models\assemblies\$assembly.glb", "--output", "reports\validation\gltf-$slug.json") "phase2b-r1-gltf-$assembly.log"
    }
    Invoke-Logged "python" @("scripts\verify_phase2b_r1_regression.py", "--allowed", "blade_dual_comet", "assist_heavy", "assist_guard", "--output", "reports\validation\phase2b-r1-regression.json") "phase2b-r1-regression.log"
    Invoke-Logged "python" @("scripts\analyze_phase2b_r1_dual_comet.py") "phase2b-r1-symmetry.log"
    Invoke-Logged "npm.cmd" @("--prefix", "preview", "test", "--", "phase2b-r1-assist-focus.spec.mjs") "phase2b-r1-browser.log"
    Invoke-Logged "python" @("scripts\report_phase2b_r1.py") "phase2b-r1-report.log"
    Write-Host "NSS_PHASE2B_R1_TEST=PASS"
    Write-Host "NSS_PHASE2B_R1_FULL_288_MATRIX_EXECUTED=false"
} finally {
    Pop-Location
}
