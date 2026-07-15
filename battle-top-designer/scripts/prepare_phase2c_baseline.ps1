$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Blender = "D:\Program Files\Blender Foundation\Blender 4.5\blender.exe"
$LogDir = Join-Path $ProjectRoot "build\logs"
$FingerprintDir = Join-Path $ProjectRoot "build\fingerprint-work\phase2c-baseline"
$Parts = @(
    "core_solar_wolf", "core_void_falcon",
    "blade_storm_fang", "blade_iron_bastion", "blade_orbit_halo", "blade_dual_comet",
    "assist_heavy", "assist_guard", "assist_air",
    "gear_low", "gear_medium", "gear_high",
    "tip_flat_attack", "tip_ball_defense", "tip_needle_stamina", "tip_taper_balance"
)

function Invoke-Logged([string]$Executable, [string[]]$Arguments, [string]$Name) {
    & $Executable @Arguments 2>&1 | Tee-Object -FilePath (Join-Path $LogDir $Name)
    if ($LASTEXITCODE -ne 0) { throw "$Name failed with exit code $LASTEXITCODE" }
}

if (-not (Test-Path -LiteralPath $Blender -PathType Leaf)) { throw "Blender 4.5.11 was not found: $Blender" }
New-Item -ItemType Directory -Force -Path $LogDir, $FingerprintDir | Out-Null
Push-Location $ProjectRoot
try {
    Invoke-Logged "python" @("scripts\validate_phase2c_waiver.py") "phase2c-waiver.log"
    Invoke-Logged "python" @("scripts\validate_specs.py", "--scope", "phase2c-baseline") "phase2c-baseline-specs.log"
    foreach ($part in $Parts) {
        $slug = $part.Replace("_", "-")
        Invoke-Logged $Blender @("--background", "--python", "blender\validate_collision_proxies.py", "--", "--part", $part) "phase2c-collider-$part.log"
        Invoke-Logged $Blender @("--background", "--python", "blender\validate_geometry.py", "--", "--part", $part) "phase2c-geometry-$part.log"
        Invoke-Logged "node" @("scripts\validate_gltf.mjs", "--input", "public\models\parts\$part.glb", "--output", "reports\validation\gltf-$slug.json") "phase2c-gltf-$part.log"
        Invoke-Logged $Blender @("--background", "--python", "blender\fingerprint_glb.py", "--", "--input", "public\models\parts\$part.glb", "--output", "build\fingerprint-work\phase2c-baseline\$part.json") "phase2c-fingerprint-$part.log"
    }
    Invoke-Logged "python" @("scripts\manage_phase2c_provisional_baseline.py", "capture") "phase2c-baseline-capture.log"
    Write-Host "NSS_PHASE2C_PROVISIONAL_BASELINE=PASS"
} finally {
    Pop-Location
}
