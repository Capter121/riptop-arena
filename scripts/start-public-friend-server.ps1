$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$logRoot = Join-Path $projectRoot 'server-logs'
New-Item -ItemType Directory -Path $logRoot -Force | Out-Null

$env:NODE_ENV = 'production'
$env:HOST = '0.0.0.0'
$env:PORT = '8080'
$env:DATABASE_PATH = Join-Path $projectRoot 'data\arena.sqlite'
$env:BACKUP_ROOT = Join-Path $projectRoot 'private-server-backups'
$env:SITE_ROOT = Join-Path $projectRoot 'dist\site'

$pathValue = $env:Path
Remove-Item Env:Path
$env:Path = $pathValue

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$stdout = Join-Path $logRoot "friend-server-$timestamp.stdout.log"
$stderr = Join-Path $logRoot "friend-server-$timestamp.stderr.log"

$process = Start-Process -FilePath 'node.exe' `
  -ArgumentList 'server/match-server.mjs' `
  -WorkingDirectory $projectRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $stdout `
  -RedirectStandardError $stderr `
  -PassThru

Write-Output "PID=$($process.Id)"
Write-Output "STDOUT=$stdout"
Write-Output "STDERR=$stderr"
