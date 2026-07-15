$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Blender = "D:\Program Files\Blender Foundation\Blender 4.5\blender.exe"
$LogDir = Join-Path $ProjectRoot "build\logs"
$Tag = "v0.2.0-rc1-technical-baseline"
$AuditNote = "Human visual review remains pending. Technical continuation was authorized by documented provisional exception, not by fabricated review data."

function Invoke-Logged([string]$Executable, [string[]]$Arguments, [string]$Name) {
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & $Executable @Arguments 2>&1 | Tee-Object -FilePath (Join-Path $LogDir $Name)
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    if ($exitCode -ne 0) { throw "$Name failed with exit code $exitCode" }
}

if (-not (Test-Path -LiteralPath $Blender -PathType Leaf)) { throw "Blender 4.5.11 was not found: $Blender" }
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
Push-Location $ProjectRoot
try {
    Invoke-Logged "python" @("scripts\validate_phase2c_waiver.py") "phase2c-waiver-run.log"
    $tagTarget = (git rev-list -n 1 $Tag).Trim()
    if (-not $tagTarget) { throw "Provisional baseline tag is missing: $Tag" }
    Invoke-Logged "python" @("scripts\validate_specs.py", "--scope", "phase2c") "phase2c-specs.log"
    Invoke-Logged "python" @("scripts\phase2c_matrix.py", "--enumerate-only") "phase2c-enumeration.log"
    Invoke-Logged "python" @("-m", "unittest", "tests/test_phase2c_waiver.py", "tests/test_phase2c_matrix.py") "phase2c-unit.log"
    Invoke-Logged $Blender @("--background", "--python", "blender\test_collision.py") "phase2c-collision-unit.log"
    foreach ($assembly in @("assembly_storm_attack", "assembly_phase2a_storm_fang", "assembly_phase2a_iron_bastion", "assembly_phase2a_orbit_halo", "assembly_phase2a_dual_comet")) {
        Invoke-Logged $Blender @("--background", "--python", "blender\validate_assemblies.py", "--", "--assembly", $assembly) "phase2c-regression-$assembly.log"
    }
    Invoke-Logged "python" @("scripts\verify_phase2b_r1_regression.py", "--allowed", "blade_dual_comet", "assist_heavy", "assist_guard", "--output", "reports\validation\phase2c-phase2b-r1-regression.json") "phase2c-phase2b-r1-regression.log"

    Invoke-Logged $Blender @("--background", "--python", "blender\validate_phase2c_matrix.py") "phase2c-matrix-run1.log"
    $first = Get-Content -Raw -Encoding UTF8 "reports\validation\phase2c-combination-matrix.json" | ConvertFrom-Json
    $digest = $first.normalized_digest
    if (-not $digest) { throw "First Phase 2C run did not produce a normalized digest" }
    Invoke-Logged $Blender @("--background", "--python", "blender\validate_phase2c_matrix.py", "--", "--expected-digest", $digest) "phase2c-matrix-run2.log"
    Invoke-Logged $Blender @("--background", "--python", "blender\validate_phase2c_matrix.py", "--", "--combination-id", "nss-p2c-0001") "phase2c-reproduction.log"
    Invoke-Logged "python" @("scripts\manage_phase2c_provisional_baseline.py", "verify") "phase2c-baseline-verify.log"
    Invoke-Logged "python" @("scripts\report_phase2c.py") "phase2c-report.log"
    Write-Host "NSS_PHASE2C_AUDIT_NOTE=$AuditNote"
} finally {
    Pop-Location
}
