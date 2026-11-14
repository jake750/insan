# Opens Insan: starts the local server in the background if it isn't running, then opens the browser.
param([int]$Port = 3210)
$ProgressPreference = "SilentlyContinue"
$env:NEXT_TELEMETRY_DISABLED = "1"
$App = Split-Path -Parent $PSScriptRoot
$Url = "http://localhost:$Port/"

function Up { try { (Invoke-WebRequest $Url -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200 } catch { $false } }

if (-not (Up)) {
  Start-Process node -ArgumentList "node_modules/next/dist/bin/next", "start", "-p", "$Port" -WorkingDirectory $App -WindowStyle Hidden
  for ($i = 0; $i -lt 60 -and -not (Up); $i++) { Start-Sleep -Milliseconds 500 }
}
Start-Process $Url
