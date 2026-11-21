# Opens Insan (installed by Insan-Setup.exe): starts the bundled server on this computer only if it isn't
# running yet, and opens the app in its own window (Edge, Chrome or Brave app mode) or the default browser.
# While the server starts, the window shows starting.html, which switches to the app once it answers.
# -ServerOnly (used after an in-app update): start the server and open no window; the open one reloads itself.
param([int]$Port = 3219, [switch]$ServerOnly)
$ProgressPreference = "SilentlyContinue"
$Here = $PSScriptRoot
# not "localhost": it can resolve to IPv6 first and hang, while the server listens on IPv4 only
$Url = "http://127.0.0.1:$Port/"

function Up { try { (Invoke-WebRequest $Url -UseBasicParsing -TimeoutSec 1).StatusCode -eq 200 } catch { $false } }

$running = Up
if (-not $running) {
  $env:PORT = "$Port"
  $env:HOSTNAME = "127.0.0.1"          # reachable from this computer only
  $env:NODE_ENV = "production"
  $env:NEXT_TELEMETRY_DISABLED = "1"
  Start-Process (Join-Path $Here "InsanServer.exe") -ArgumentList "server.js" -WorkingDirectory (Join-Path $Here "app") -WindowStyle Hidden
}
if ($ServerOnly) { return }

# a browser in app mode gives Insan its own window, without tabs or an address bar
$browser = foreach ($name in "msedge.exe", "chrome.exe", "brave.exe") {
  foreach ($root in "HKCU:", "HKLM:") {
    $p = (Get-ItemProperty "$root\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\$name" -ErrorAction SilentlyContinue).'(default)'
    if ($p -and (Test-Path $p)) { $p }
  }
}
$browser = @($browser)[0]

if ($browser) {
  $start = if ($running) { $Url } else { ([Uri](Join-Path $Here "starting.html")).AbsoluteUri + "#" + [Uri]::EscapeDataString($Url) }
  # its own browser profile keeps Insan's settings, key and history apart from your normal browsing
  $prof = Join-Path $Here "profile"
  Start-Process $browser -ArgumentList "--app=$start", "--user-data-dir=`"$prof`"", "--no-first-run", "--no-default-browser-check"
} else {
  for ($i = 0; $i -lt 300 -and -not (Up); $i++) { Start-Sleep -Milliseconds 200 }
  Start-Process $Url
}
