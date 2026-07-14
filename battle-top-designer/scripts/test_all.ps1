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

function Require-File([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Required output is missing: $Path" }
    if ((Get-Item -LiteralPath $Path).Length -le 0) { throw "Required output is empty: $Path" }
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Blender = Find-Blender
Write-Host "NSS_BLENDER=$Blender"
Push-Location $ProjectRoot
try {
    Invoke-Logged "python" @("scripts\validate_specs.py", "--self-test") "test-spec-self-test.log"
    Invoke-Logged "python" @("scripts\validate_specs.py", "--scope", "vertical_slice") "test-specs.log"
    Invoke-Logged $Blender @("--background", "--python", "blender\test_collision.py") "test-collision.log"
    foreach ($part in $Parts) {
        Invoke-Logged $Blender @("--background", "--python", "blender\validate_collision_proxies.py", "--", "--part", $part) "validate-collider-$part.log"
        Invoke-Logged $Blender @("--background", "--python", "blender\validate_geometry.py", "--", "--part", $part) "validate-$part.log"
        $slug = $part.Replace("_", "-")
        Invoke-Logged "node" @("scripts\validate_gltf.mjs", "--input", "public\models\parts\$part.glb", "--output", "reports\validation\gltf-$slug.json") "gltf-$part.log"
        Require-File "public\models\parts\$part.glb"
    }
    Invoke-Logged $Blender @("--background", "--python", "blender\validate_assemblies.py", "--", "--assembly", "assembly_storm_attack") "validate-assembly_storm_attack.log"
    Invoke-Logged "node" @("scripts\validate_gltf.mjs", "--input", "public\models\assemblies\assembly_storm_attack.glb", "--output", "reports\validation\gltf-assembly-storm-attack.json") "gltf-assembly_storm_attack.log"
    Require-File "public\models\assemblies\assembly_storm_attack.glb"
    Require-File "build\blend\exploded_storm_attack.blend"
    Require-File "reports\assembly_matrix.csv"
    Require-File "reports\renders\storm_fang_contact_sheet.png"
    Require-File "reports\renders\assembly_storm_attack_contact_sheet.png"
    Require-File "reports\renders\all_blades_silhouette.png"

    $assemblyReport = Get-Content -Raw "reports\validation\assembly-storm-attack.json" | ConvertFrom-Json
    if ($assemblyReport.result -ne "PASS" -or $assemblyReport.collision_count -ne 0 -or $assemblyReport.contact_review_count -ne 0) {
        throw "Assembly validation report is not a collision-free PASS."
    }
    $summary = [ordered]@{
        result = "PASS"
        scope = "vertical_slice"
        parts_tested = $Parts.Count
        assemblies_tested = 1
        collision_count = $assemblyReport.collision_count
        triangle_count = $assemblyReport.triangle_count
        gltf_validator_errors = 0
    }
    $summary | ConvertTo-Json | Set-Content -Encoding utf8 "reports\validation\vertical-slice-summary.json"
    Write-Host "NSS_TEST=PASS"
    Write-Host "NSS_SUMMARY=reports\validation\vertical-slice-summary.json"
} finally {
    Pop-Location
}
