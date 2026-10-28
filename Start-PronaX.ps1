param(
  [switch]$Production
)

$ErrorActionPreference = "Stop"
$projectRoot = $PSScriptRoot
$bundledNode = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
$bundledPnpm = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback"

if (Test-Path (Join-Path $bundledNode "node.exe")) {
  $env:PATH = "$bundledNode;$bundledPnpm;$env:PATH"
}

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
  Write-Host "Node.js was not found. Install Node.js 20.9 or newer, reopen PowerShell, and run this script again." -ForegroundColor Red
  exit 1
}

$pnpmCommand = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
if (-not $pnpmCommand) {
  Write-Host "pnpm was not found. Install it with: corepack enable" -ForegroundColor Red
  exit 1
}

Set-Location $projectRoot
if (-not (Test-Path (Join-Path $projectRoot "node_modules\next\package.json"))) {
  Write-Host "Installing PronaX dependencies..." -ForegroundColor Cyan
  & $pnpmCommand.Source install
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if ($Production) {
  Write-Host "Building the production version..." -ForegroundColor Cyan
  & $pnpmCommand.Source build
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  & $pnpmCommand.Source start
} else {
  Write-Host "Starting PronaX locally at http://localhost:3000" -ForegroundColor Green
  & $pnpmCommand.Source dev
}
exit $LASTEXITCODE
