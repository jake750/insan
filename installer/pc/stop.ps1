# Stops the Insan background server started by launch.ps1 (only Insan's own bundled runtime).
# -Windows also closes Insan's app windows (the browser processes using Insan's own profile); the uninstaller uses it.
param([switch]$Windows)
Get-Process InsanServer -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
if ($Windows) {
  # every process using Insan's profile: the browser window and its helpers (e.g. the crash reporter)
  $prof = Join-Path $PSScriptRoot "profile"
  $users = { @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($prof) }) }
  for ($i = 0; $i -lt 20; $i++) {
    $p = & $users
    if (-not $p.Count) { break }
    $p | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Milliseconds 500
  }
  Start-Sleep -Seconds 1   # let the file handles close
}
