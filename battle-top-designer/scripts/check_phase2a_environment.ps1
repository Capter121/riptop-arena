$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Workspace = Split-Path -Parent $Root
$ReportPath = Join-Path $Root "reports\validation\phase2a-environment.json"
$BlenderPath = "D:\Program Files\Blender Foundation\Blender 4.5\blender.exe"
$ValidatorPackage = Join-Path $Root "build\tools\gltf-validator\node_modules\gltf-validator\package.json"
$ThreePackage = Join-Path $Workspace "node_modules\three\package.json"
$PlaywrightPackage = Join-Path $Workspace "node_modules\@playwright\test\package.json"

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
}

$ReportDirectory = Split-Path -Parent $ReportPath
New-Item -ItemType Directory -Force -Path $ReportDirectory | Out-Null
$Report | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 $ReportPath

Write-Output "PHASE2A_ENVIRONMENT_RESULT=$($Report.result)"
Write-Output "BLENDER_PATH=$BlenderPath"
Write-Output "BLENDER_VERSION=$BlenderVersion"
Write-Output "GLTF_VALIDATOR_VERSION=$ValidatorVersion"
Write-Output "NODE_VERSION=$NodeVersion"
Write-Output "PYTHON_VERSION=$PythonVersion"
Write-Output "THREE_VERSION=$ThreeVersion"
Write-Output "PLAYWRIGHT_VERSION=$PlaywrightVersion"
Write-Output "PHASE2A_ENVIRONMENT_REPORT=$ReportPath"

if ($Errors.Count -ne 0) {
    throw "Phase 2A environment validation failed: $($Errors -join ',')"
}
