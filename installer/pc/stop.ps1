# Stops the Insan background server started by launch.ps1 (only Insan's own bundled runtime).
# -Windows also closes Insan's app windows (the browser processes using Insan's own profile); the uninstaller uses it.
param([switch]$Windows)
Get-Process InsanServer -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
if ($Windows) {
  $prof = Join-Path $PSScriptRoot "profile"
  Get-CimInstance Win32_Process -Filter "name='msedge.exe' or name='chrome.exe' or name='brave.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine.Contains($prof) } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 2   # let the browser release its profile files
}
