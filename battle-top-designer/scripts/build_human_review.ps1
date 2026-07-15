param()

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$BlenderCandidates = @(
    $env:BLENDER_EXE,
    "D:\Program Files\Blender Foundation\Blender 4.5\blender.exe",
    "$env:ProgramFiles\Blender Foundation\Blender 4.5\blender.exe"
) | Where-Object { $_ }
$Blender = $BlenderCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if (-not $Blender) { throw "Blender executable was not found." }

Push-Location $ProjectRoot
try {
    & $Blender --background --python "blender\render_human_review.py" -- --scope all
    if ($LASTEXITCODE -ne 0) { throw "Human-review Blender rendering failed with exit code $LASTEXITCODE." }

    Push-Location "preview"
    try {
        & ".\node_modules\.bin\playwright.cmd" test "phase2b-human-review.spec.mjs"
        if ($LASTEXITCODE -ne 0) { throw "Human-review Playwright capture failed with exit code $LASTEXITCODE." }
    }
    finally { Pop-Location }

    & python "scripts\build_human_review.py" --mode all
    if ($LASTEXITCODE -ne 0) { throw "Human-review package composition failed with exit code $LASTEXITCODE." }
    Write-Host "NSS_PHASE2B_HUMAN_REVIEW=PASS"
}
finally { Pop-Location }
