param(
    [ValidateSet("Phase2A", "Phase2B")]
    [string]$Scope = "Phase2A"
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Workspace = Split-Path -Parent $Root
$ReportName = if ($Scope -eq "Phase2B") { "phase2b-environment.json" } else { "phase2a-environment.json" }
$ReportPath = Join-Path $Root "reports\validation\$ReportName"
$BlenderPath = "D:\Program Files\Blender Foundation\Blender 4.5\blender.exe"
$ValidatorPackage = Join-Path $Root "build\tools\gltf-validator\node_modules\gltf-validator\package.json"
$ThreePackage = Join-Path $Workspace "node_modules\three\package.json"
$PlaywrightPackage = Join-Path $Workspace "node_modules\@playwright\test\package.json"
$ApprovalPath = Join-Path $Root "reports\validation\phase2a-visual-review-disposition.json"
$ThreeLicensePath = Join-Path $Root "preview\vendor\three\0.185.1\LICENSE"
$ThreeVersionPath = Join-Path $Root "preview\vendor\three\0.185.1\VERSION"
$Phase2BArtifacts = @(
    "public\models\parts\core_solar_wolf.glb",
    "public\models\parts\blade_storm_fang.glb",
    "public\models\parts\blade_iron_bastion.glb",
    "public\models\parts\blade_orbit_halo.glb",
    "public\models\parts\blade_dual_comet.glb",
    "public\models\parts\assist_heavy.glb",
    "public\models\parts\gear_low.glb",
    "public\models\parts\tip_flat_attack.glb",
    "public\models\assemblies\assembly_phase2a_storm_fang.glb",
    "public\models\assemblies\assembly_phase2a_iron_bastion.glb",
    "public\models\assemblies\assembly_phase2a_orbit_halo.glb",
    "public\models\assemblies\assembly_phase2a_dual_comet.glb",
    "public\models\assemblies\assembly_storm_attack.glb"
)

if (-not (Test-Path -LiteralPath $BlenderPath -PathType Leaf)) {
    throw "Blender executable not found: $BlenderPath"
}

$BlenderOutput = (& $BlenderPath --version 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0) {
    throw "Blender version command failed with exit code $LASTEXITCODE"
}

$BlenderVersion = [regex]::Match($BlenderOutput, "Blender\s+([0-9.]+(?:\s+LTS)?)").Groups[1].Value
$NodeVersion = (& node --version 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0) {
    throw "Node version command failed with exit code $LASTEXITCODE"
}
$PythonVersion = (& python --version 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0) {
    throw "Python version command failed with exit code $LASTEXITCODE"
}

$ValidatorVersion = (Get-Content -Raw -Encoding UTF8 $ValidatorPackage | ConvertFrom-Json).version
$ThreeVersion = (Get-Content -Raw -Encoding UTF8 $ThreePackage | ConvertFrom-Json).version
$PlaywrightVersion = (Get-Content -Raw -Encoding UTF8 $PlaywrightPackage | ConvertFrom-Json).version

$Errors = @()
if ($BlenderVersion -ne "4.5.11 LTS") { $Errors += "BLENDER_VERSION_MISMATCH" }
if ($ValidatorVersion -ne "2.0.0-dev.3.10") { $Errors += "GLTF_VALIDATOR_VERSION_MISMATCH" }
if ($ThreeVersion -ne "0.185.1") { $Errors += "THREE_VERSION_MISMATCH" }
if ($PlaywrightVersion -ne "1.61.1") { $Errors += "PLAYWRIGHT_VERSION_MISMATCH" }

$ApprovalStatus = $null
$ArtifactResults = @()
if ($Scope -eq "Phase2B") {
    if (Test-Path -LiteralPath $ApprovalPath -PathType Leaf) {
        $ApprovalStatus = (Get-Content -Raw -Encoding UTF8 $ApprovalPath | ConvertFrom-Json).status
        if ($ApprovalStatus -ne "APPROVED") { $Errors += "PHASE2A_VISUAL_REVIEW_NOT_APPROVED" }
    } else {
        $Errors += "PHASE2A_VISUAL_REVIEW_DISPOSITION_MISSING"
    }
    if (-not (Test-Path -LiteralPath $ThreeLicensePath -PathType Leaf)) { $Errors += "THREE_LICENSE_MISSING" }
    if (-not (Test-Path -LiteralPath $ThreeVersionPath -PathType Leaf)) { $Errors += "THREE_VERSION_FILE_MISSING" }
    foreach ($RelativePath in $Phase2BArtifacts) {
        $ArtifactPath = Join-Path $Root $RelativePath
        $Exists = Test-Path -LiteralPath $ArtifactPath -PathType Leaf
        $Size = if ($Exists) { (Get-Item -LiteralPath $ArtifactPath).Length } else { 0 }
        if (-not $Exists -or $Size -le 0) { $Errors += "BASELINE_ARTIFACT_MISSING_OR_EMPTY:$RelativePath" }
        $ArtifactResults += [ordered]@{ path = $RelativePath.Replace("\", "/"); exists = $Exists; size = $Size }
    }
}

$Report = [ordered]@{
    result = if ($Errors.Count -eq 0) { "PASS" } else { "FAIL" }
    errors = $Errors
    blender = [ordered]@{
        path = $BlenderPath
        version = $BlenderVersion
    }
    gltf_validator = [ordered]@{
        package = $ValidatorPackage
        version = $ValidatorVersion
    }
    node = [ordered]@{
        executable = (Get-Command node).Source
        version = $NodeVersion
    }
    python = [ordered]@{
        executable = (Get-Command python).Source
        version = $PythonVersion
    }
    browser_test = [ordered]@{
        playwright_version = $PlaywrightVersion
        three_version = $ThreeVersion
    }
    phase2b_gate = if ($Scope -eq "Phase2B") { [ordered]@{
        phase2a_visual_review = $ApprovalStatus
        three_license = $ThreeLicensePath
        three_version_file = $ThreeVersionPath
        baseline_artifacts = $ArtifactResults
    } } else { $null }
}

$ReportDirectory = Split-Path -Parent $ReportPath
New-Item -ItemType Directory -Force -Path $ReportDirectory | Out-Null
$Report | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 $ReportPath

Write-Output "${Scope}_ENVIRONMENT_RESULT=$($Report.result)"
Write-Output "BLENDER_PATH=$BlenderPath"
Write-Output "BLENDER_VERSION=$BlenderVersion"
Write-Output "GLTF_VALIDATOR_VERSION=$ValidatorVersion"
Write-Output "NODE_VERSION=$NodeVersion"
Write-Output "PYTHON_VERSION=$PythonVersion"
Write-Output "THREE_VERSION=$ThreeVersion"
Write-Output "PLAYWRIGHT_VERSION=$PlaywrightVersion"
Write-Output "${Scope}_ENVIRONMENT_REPORT=$ReportPath"

if ($Errors.Count -ne 0) {
    throw "$Scope environment validation failed: $($Errors -join ',')"
}
