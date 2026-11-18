# Opens Insan (installed by Insan-Setup.exe): starts the bundled server on this computer only if it
# isn't running yet, then opens the app in its own window (Edge, Chrome or Brave app mode), or the default browser.
param([int]$Port = 3219)
$ProgressPreference = "SilentlyContinue"
$Here = $PSScriptRoot
$Url = "http://localhost:$Port/"

function Up { try { (Invoke-WebRequest $Url -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200 } catch { $false } }

if (-not (Up)) {
  $env:PORT = "$Port"
  $env:HOSTNAME = "127.0.0.1"          # reachable from this computer only
  $env:NODE_ENV = "production"
  $env:NEXT_TELEMETRY_DISABLED = "1"
  Start-Process (Join-Path $Here "InsanServer.exe") -ArgumentList "server.js" -WorkingDirectory (Join-Path $Here "app") -WindowStyle Hidden
  for ($i = 0; $i -lt 80 -and -not (Up); $i++) { Start-Sleep -Milliseconds 250 }
}

# a browser in app mode gives Insan its own window, without tabs or an address bar
$browser = foreach ($name in "msedge.exe", "chrome.exe", "brave.exe") {
  foreach ($root in "HKCU:", "HKLM:") {
    $p = (Get-ItemProperty "$root\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\$name" -ErrorAction SilentlyContinue).'(default)'
    if ($p -and (Test-Path $p)) { $p }
  }
}
$browser = @($browser)[0]
if ($browser) {
  # its own browser profile keeps Insan's settings, key and history apart from your normal browsing
  $prof = Join-Path $Here "profile"
  Start-Process $browser -ArgumentList "--app=$Url", "--user-data-dir=`"$prof`"", "--no-first-run", "--no-default-browser-check"
} else {
  Start-Process $Url
}
