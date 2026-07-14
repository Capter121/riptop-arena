$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Source = Join-Path $Root "preview\node_modules\three"
$Target = Join-Path $Root "preview\vendor\three\0.185.1"
$Package = Get-Content -Raw -Encoding UTF8 (Join-Path $Source "package.json") | ConvertFrom-Json
if ($Package.version -ne "0.185.1") {
    throw "Expected Three.js 0.185.1, found $($Package.version)"
}

$Copies = [ordered]@{
    "build\three.module.js" = "build\three.module.js"
    "build\three.core.js" = "build\three.core.js"
    "examples\jsm\loaders\GLTFLoader.js" = "examples\jsm\loaders\GLTFLoader.js"
    "examples\jsm\controls\OrbitControls.js" = "examples\jsm\controls\OrbitControls.js"
    "examples\jsm\utils\BufferGeometryUtils.js" = "examples\jsm\utils\BufferGeometryUtils.js"
    "examples\jsm\utils\SkeletonUtils.js" = "examples\jsm\utils\SkeletonUtils.js"
    "LICENSE" = "LICENSE"
}
foreach ($Entry in $Copies.GetEnumerator()) {
    $Destination = Join-Path $Target $Entry.Value
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Destination) | Out-Null
    Copy-Item -LiteralPath (Join-Path $Source $Entry.Key) -Destination $Destination -Force
}
Set-Content -Encoding UTF8 -Path (Join-Path $Target "VERSION") -Value "0.185.1"
Write-Output "THREE_VENDOR_VERSION=0.185.1"
Write-Output "THREE_VENDOR_LICENSE=$(Join-Path $Target 'LICENSE')"
