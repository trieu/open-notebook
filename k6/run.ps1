# Runs a k6 phase against the API. Uses native k6 if on PATH, else the
# grafana/k6 Docker image (Rancher Desktop / Docker Desktop).
#
# Usage:
#   .\run.ps1 phase1
#   .\run.ps1 phase2 -BaseUrl http://localhost:5055 -Password secret
#   .\run.ps1 phase4 -EnvVars @{ CHAT_MODEL='model:abc'; LLM_VUS='2' }
#
# Phase names map to scenarios\<phase>*.js (phase1, phase1b, phase2..phase5).

param(
  [Parameter(Mandatory = $true)][string]$Phase,
  [string]$BaseUrl = "http://localhost:5055",
  [string]$Password = $env:OPEN_NOTEBOOK_PASSWORD,
  [hashtable]$EnvVars = @{}
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$scenarioDir = Join-Path $here "scenarios"

# Resolve phase -> script file (prefix match: phase1 -> phase1_hot_reads.js)
$match = Get-ChildItem -Path $scenarioDir -Filter "$Phase*.js" | Select-Object -First 1
if (-not $match) {
  Write-Error "No scenario matching '$Phase' in $scenarioDir. Available: $((Get-ChildItem $scenarioDir -Filter *.js | ForEach-Object { ($_.BaseName -split '_')[0] }) -join ', ')"
  exit 1
}

# Merge env: BASE_URL/PASSWORD plus any extra K/V pairs
$allEnv = @{ "BASE_URL" = $BaseUrl }
if ($Password) { $allEnv["PASSWORD"] = $Password }
foreach ($k in $EnvVars.Keys) { $allEnv[$k] = $EnvVars[$k] }

# k6 writes its built-in web-dashboard HTML here at end of run (local only).
$reportDir = Join-Path $here "reports"
if (-not (Test-Path $reportDir)) { New-Item -ItemType Directory -Path $reportDir | Out-Null }
$reportName = "$($match.BaseName)-$(Get-Date -Format 'yyyyMMdd-HHmmss').html"

$native = Get-Command k6 -ErrorAction SilentlyContinue
if ($native) {
  $envArgs = @()
  foreach ($k in $allEnv.Keys) { $envArgs += "--env"; $envArgs += "$k=$($allEnv[$k])" }
  $env:K6_WEB_DASHBOARD = "true"
  $env:K6_WEB_DASHBOARD_EXPORT = Join-Path $reportDir $reportName
  Write-Host "Running native k6: $($match.Name)" -ForegroundColor Cyan
  & k6 run @envArgs $match.FullName
  Write-Host "HTML report: $(Join-Path $reportDir $reportName)" -ForegroundColor Green
}
else {
  # Docker: container can't see host 'localhost' — rewrite to host.docker.internal
  if ($allEnv["BASE_URL"] -match "localhost|127\.0\.0\.1") {
    $allEnv["BASE_URL"] = $allEnv["BASE_URL"] -replace "localhost|127\.0\.0\.1", "host.docker.internal"
    Write-Host "k6 not on PATH; using Docker. BASE_URL -> $($allEnv['BASE_URL'])" -ForegroundColor Yellow
  }
  $envArgs = @()
  foreach ($k in $allEnv.Keys) { $envArgs += "--env"; $envArgs += "$k=$($allEnv[$k])" }
  $rel = "scenarios/$($match.Name)"
  & docker run --rm -i `
    --add-host host.docker.internal:host-gateway `
    -e K6_WEB_DASHBOARD=true `
    -e "K6_WEB_DASHBOARD_EXPORT=/k6/reports/$reportName" `
    -v "${here}:/k6" -w /k6 `
    grafana/k6 run @envArgs $rel
  Write-Host "HTML report: $(Join-Path $reportDir $reportName)" -ForegroundColor Green
}
