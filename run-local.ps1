param(
  [Parameter(Mandatory = $false)]
  [ValidateSet("dev", "build", "start", "lint")]
  [string]$Command = "dev"
)

$portableNodeCandidates = @(
  (Join-Path $PSScriptRoot ".tools\node-v22.22.0-win-x64"),
  (Join-Path (Split-Path $PSScriptRoot -Parent) ".tools\node-v22.22.0-win-x64"),
  (Join-Path (Split-Path $PSScriptRoot -Parent) ".tools\node-v24.14.0-win-x64")
)

$nodeDir = $portableNodeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $nodeDir) {
  Write-Error "Portable Node runtime not found. Install Node.js or place it under .tools/."
  exit 1
}

$env:Path = "$nodeDir;$env:Path"

npm.cmd run $Command
