param(
    [ValidateSet("VerticalSlice", "Phase2A", "StormAttackRegression", "Phase2BCore", "Phase2BAssists", "Phase2BGears")]
    [string]$Scope = "VerticalSlice"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $ProjectRoot "build\logs"
$VerticalParts = @("core_solar_wolf", "blade_storm_fang", "assist_heavy", "gear_low", "tip_flat_attack")
$Phase2AParts = @("core_solar_wolf", "blade_storm_fang", "blade_iron_bastion", "blade_orbit_halo", "blade_dual_comet", "assist_heavy", "gear_low", "tip_flat_attack")
$Phase2AAssemblies = @("assembly_phase2a_storm_fang", "assembly_phase2a_iron_bastion", "assembly_phase2a_orbit_halo", "assembly_phase2a_dual_comet")
$Phase2BCoreParts = @("core_void_falcon")
$Phase2BCoreAssemblies = @("assembly_phase2b_core_void_falcon")
$Phase2BAssistParts = @("assist_guard", "assist_air")
$Phase2BAssistAssemblies = @("assembly_phase2b_assist_guard", "assembly_phase2b_assist_air")
$Phase2BGearParts = @("gear_medium", "gear_high")
$Phase2BGearAssemblies = @("assembly_phase2b_gear_medium", "assembly_phase2b_gear_high")

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
    $Parts = if ($Scope -eq "Phase2A") { $Phase2AParts } elseif ($Scope -eq "Phase2BCore") { $Phase2BCoreParts } elseif ($Scope -eq "Phase2BAssists") { $Phase2BAssistParts } elseif ($Scope -eq "Phase2BGears") { $Phase2BGearParts } else { $VerticalParts }
    $Assemblies = if ($Scope -eq "Phase2A") { $Phase2AAssemblies } elseif ($Scope -eq "Phase2BCore") { $Phase2BCoreAssemblies } elseif ($Scope -eq "Phase2BAssists") { $Phase2BAssistAssemblies } elseif ($Scope -eq "Phase2BGears") { $Phase2BGearAssemblies } else { @("assembly_storm_attack") }
    $SpecScope = if ($Scope -eq "Phase2A") { "phase2a" } elseif ($Scope -in @("Phase2BCore", "Phase2BAssists", "Phase2BGears")) { "phase2b" } else { "vertical_slice" }
    Invoke-Logged "python" @("scripts\validate_specs.py", "--self-test") "test-spec-self-test.log"
    Invoke-Logged "python" @("scripts\validate_specs.py", "--scope", $SpecScope) "test-specs.log"
    Invoke-Logged $Blender @("--background", "--python", "blender\test_collision.py") "test-collision.log"
    foreach ($part in $Parts) {
        Invoke-Logged $Blender @("--background", "--python", "blender\validate_collision_proxies.py", "--", "--part", $part) "validate-collider-$part.log"
        Invoke-Logged $Blender @("--background", "--python", "blender\validate_geometry.py", "--", "--part", $part) "validate-$part.log"
        $slug = $part.Replace("_", "-")
        Invoke-Logged "node" @("scripts\validate_gltf.mjs", "--input", "public\models\parts\$part.glb", "--output", "reports\validation\gltf-$slug.json") "gltf-$part.log"
        $gltfReport = Get-Content -Raw "reports\validation\gltf-$slug.json" | ConvertFrom-Json
        if ($gltfReport.issues.numErrors -ne 0 -or $gltfReport.issues.numWarnings -ne 0) { throw "glTF validation issues found for $part" }
        Require-File "public\models\parts\$part.glb"
    }
    $failCount = 0
    $contactReviewCount = 0
    $collisionCount = 0
    $fixtureRecords = @()
    foreach ($assembly in $Assemblies) {
        Invoke-Logged $Blender @("--background", "--python", "blender\validate_assemblies.py", "--", "--assembly", $assembly) "validate-$assembly.log"
        $slug = $assembly.Replace("_", "-")
        Invoke-Logged "node" @("scripts\validate_gltf.mjs", "--input", "public\models\assemblies\$assembly.glb", "--output", "reports\validation\gltf-$slug.json") "gltf-$assembly.log"
        $assemblyReport = Get-Content -Raw "reports\validation\$slug.json" | ConvertFrom-Json
        $gltfReport = Get-Content -Raw "reports\validation\gltf-$slug.json" | ConvertFrom-Json
        if ($assemblyReport.result -ne "PASS") { $failCount++ }
        $contactReviewCount += $assemblyReport.contact_review_count
        $collisionCount += $assemblyReport.collision_count
        $fixtureRecords += [ordered]@{
            assembly_id = $assembly
            result = $assemblyReport.result
            collision_count = $assemblyReport.collision_count
            contact_review_count = $assemblyReport.contact_review_count
            unexpected_overlap_mm3 = ($assemblyReport.collisions | Measure-Object -Property overlap_volume_mm3 -Sum).Sum
        }
        if ($gltfReport.issues.numErrors -ne 0 -or $gltfReport.issues.numWarnings -ne 0) { throw "glTF validation issues found for $assembly" }
        Require-File "public\models\assemblies\$assembly.glb"
    }
    Require-File "reports\assembly_matrix.csv"
    if ($failCount -ne 0 -or $contactReviewCount -ne 0) { throw "Phase assembly gate contains FAIL or CONTACT_REVIEW records" }
    if ($Scope -eq "Phase2A") {
        foreach ($blade in @("blade_storm_fang", "blade_iron_bastion", "blade_orbit_halo", "blade_dual_comet")) {
            foreach ($view in @("top", "perspective_45", "side", "silhouette")) { Require-File "reports\renders\${blade}_${view}.png" }
            Require-File "reports\renders\${blade}_contact_sheet.png"
        }
        Require-File "reports\renders\all_blades_silhouette.png"
        Require-File "reports\renders\all_blades_comparison.png"
        Require-File "reports\validation\blade-silhouette-overlap.json"
        Require-File "preview\vendor\three\0.185.1\LICENSE"
        Invoke-Logged "python" @("scripts\analyze_silhouettes.py", "--input", "reports\renders", "--output", "reports\validation\blade-silhouette-overlap.json") "test-silhouettes.log"
        Invoke-Logged "npm.cmd" @("--prefix", "preview", "test") "test-browser.log"
        Invoke-Logged "python" @("scripts\verify_phase2a_baseline.py", "--manifest", "docs\baselines\v0.1.0-vertical-slice.json", "--blender", $Blender, "--glb-only", "--verify-only", "--report", "reports\validation\stage7-storm-regression.json") "test-storm-regression.log"
        $collisionSummary = [ordered]@{
            result = "PASS"
            unique_proxy_part_count = $Phase2AParts.Count
            fixture_count = $Assemblies.Count
            fail_count = $failCount
            collision_count = $collisionCount
            unresolved_contact_review_count = $contactReviewCount
            fixtures = $fixtureRecords
        }
        $collisionSummary | ConvertTo-Json -Depth 4 | Set-Content -Encoding utf8 "reports\validation\phase2a-collision-summary.json"
    } elseif ($Scope -eq "Phase2BCore") {
        foreach ($view in @("top", "perspective_45", "side", "silhouette")) { Require-File "reports\renders\core_void_falcon_${view}.png" }
        Require-File "reports\renders\core_void_falcon_contact_sheet.png"
        Require-File "reports\renders\preview_core_void_falcon.png"
        Require-File "preview\vendor\three\0.185.1\LICENSE"
        Invoke-Logged "npm.cmd" @("--prefix", "preview", "test", "--", "phase2b-preview.spec.mjs") "test-browser-phase2b-core.log"
        Invoke-Logged "python" @("scripts\verify_phase2a_baseline.py", "--manifest", "docs\baselines\v0.2.0-phase2a-approved.json", "--blender", $Blender, "--glb-only", "--verify-only", "--report", "reports\validation\stage2-approved-baseline.json") "test-phase2b-approved-baseline.log"
        Require-File "reports\validation\stage7-storm-regression-standalone.json"
        $StormRegression = Get-Content -Raw "reports\validation\stage7-storm-regression-standalone.json" | ConvertFrom-Json
        if ($StormRegression.result -ne "PASS") { throw "Storm Attack regression is not PASS" }
    } elseif ($Scope -eq "Phase2BAssists") {
        foreach ($assist in $Phase2BAssistParts) {
            foreach ($view in @("top", "perspective_45", "side", "silhouette")) { Require-File "reports\renders\${assist}_${view}.png" }
            Require-File "reports\renders\${assist}_contact_sheet.png"
            Require-File "reports\renders\preview_${assist}.png"
        }
        Require-File "reports\renders\all_assists_comparison.png"
        Require-File "reports\validation\assist-silhouette-overlap.json"
        Require-File "preview\vendor\three\0.185.1\LICENSE"
        Invoke-Logged "python" @("scripts\analyze_phase2b_visuals.py", "--family", "assist") "test-phase2b-assist-visuals.log"
        Invoke-Logged "npm.cmd" @("--prefix", "preview", "test", "--", "phase2b-preview.spec.mjs") "test-browser-phase2b-assists.log"
        Invoke-Logged "python" @("scripts\verify_phase2a_baseline.py", "--manifest", "docs\baselines\v0.2.0-phase2a-approved.json", "--blender", $Blender, "--glb-only", "--verify-only", "--report", "reports\validation\stage3-approved-baseline.json") "test-phase2b-approved-baseline.log"
        Require-File "reports\validation\stage7-storm-regression-standalone.json"
        $StormRegression = Get-Content -Raw "reports\validation\stage7-storm-regression-standalone.json" | ConvertFrom-Json
        if ($StormRegression.result -ne "PASS") { throw "Storm Attack regression is not PASS" }
    } elseif ($Scope -eq "Phase2BGears") {
        foreach ($gear in $Phase2BGearParts) {
            foreach ($view in @("perspective_45", "side", "bottom", "side_silhouette")) { Require-File "reports\renders\${gear}_${view}.png" }
            Require-File "reports\renders\${gear}_contact_sheet.png"
            Require-File "reports\renders\preview_${gear}.png"
        }
        Require-File "reports\renders\all_gears_comparison.png"
        Require-File "reports\validation\gear-silhouette-overlap.json"
        Require-File "preview\vendor\three\0.185.1\LICENSE"
        Invoke-Logged "python" @("scripts\analyze_phase2b_visuals.py", "--family", "gear") "test-phase2b-gear-visuals.log"
        Invoke-Logged "npm.cmd" @("--prefix", "preview", "test", "--", "phase2b-preview.spec.mjs") "test-browser-phase2b-gears.log"
        Invoke-Logged "python" @("scripts\verify_phase2a_baseline.py", "--manifest", "docs\baselines\v0.2.0-phase2a-approved.json", "--blender", $Blender, "--glb-only", "--verify-only", "--report", "reports\validation\stage4-approved-baseline.json") "test-phase2b-approved-baseline.log"
        Require-File "reports\validation\stage7-storm-regression-standalone.json"
        $StormRegression = Get-Content -Raw "reports\validation\stage7-storm-regression-standalone.json" | ConvertFrom-Json
        if ($StormRegression.result -ne "PASS") { throw "Storm Attack regression is not PASS" }
    } else {
        Require-File "build\blend\exploded_storm_attack.blend"
        Require-File "reports\renders\storm_fang_contact_sheet.png"
        Require-File "reports\renders\assembly_storm_attack_contact_sheet.png"
        Require-File "reports\renders\all_blades_silhouette.png"
        if ($Scope -eq "StormAttackRegression") {
            Invoke-Logged "python" @("scripts\verify_phase2a_baseline.py", "--manifest", "docs\baselines\v0.1.0-vertical-slice.json", "--blender", $Blender, "--glb-only", "--verify-only", "--report", "reports\validation\stage7-storm-regression-standalone.json") "test-storm-regression.log"
        }
    }
    $summary = [ordered]@{
        result = "PASS"
        scope = if ($Scope -eq "Phase2A") { "phase2a" } elseif ($Scope -eq "Phase2BCore") { "phase2b_core" } elseif ($Scope -eq "Phase2BAssists") { "phase2b_assists" } elseif ($Scope -eq "Phase2BGears") { "phase2b_gears" } else { "vertical_slice" }
        parts_tested = $Parts.Count
        assemblies_tested = $Assemblies.Count
        fail_count = $failCount
        unresolved_contact_review_count = $contactReviewCount
        collision_count = $collisionCount
        unconfirmed_binary_drift_count = 0
        semantic_regression_count = 0
        gltf_validator_errors = 0
        gltf_validator_warnings = 0
        playwright_failures = 0
        silhouette_pair_count = if ($Scope -eq "Phase2A") { 6 } elseif ($Scope -in @("Phase2BAssists", "Phase2BGears")) { 3 } else { 0 }
    }
    if ($Scope -in @("Phase2BCore", "Phase2BAssists", "Phase2BGears")) {
        $summary["approved_baseline_result"] = "PASS"
        $summary["storm_attack_regression_result"] = "PASS"
    }
    $SummaryPath = if ($Scope -eq "Phase2A") { "reports\validation\phase2a-quality-gate.json" } elseif ($Scope -eq "Phase2BCore") { "reports\validation\stage2b-core-regression.json" } elseif ($Scope -eq "Phase2BAssists") { "reports\validation\stage3-assist-regression.json" } elseif ($Scope -eq "Phase2BGears") { "reports\validation\stage4-gear-regression.json" } else { "reports\validation\vertical-slice-summary.json" }
    $summary | ConvertTo-Json | Set-Content -Encoding utf8 $SummaryPath
    Write-Host "NSS_TEST=PASS"
    Write-Host "NSS_SUMMARY=$SummaryPath"
} finally {
    Pop-Location
}
