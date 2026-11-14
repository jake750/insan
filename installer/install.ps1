# Insan installer for Windows.
# Installs the app into %LOCALAPPDATA%\Insan, builds it, and adds Desktop + Start Menu shortcuts.
# Nothing here needs admin rights. The app runs only on this computer (http://localhost:3210).
param(
  [string]$InstallDir = (Join-Path $env:LOCALAPPDATA "Insan"),
  [int]$Port = 3210,
  [switch]$NoShortcuts,   # used for testing
  [switch]$Quiet          # don't wait for a key press at the end
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$env:NEXT_TELEMETRY_DISABLED = "1"   # no usage data sent to Vercel during the build
$Source = Split-Path -Parent $PSScriptRoot

function Step($n, $text) { Write-Host ""; Write-Host "[$n/5] $text" -ForegroundColor Cyan }
function Fail($text) {
  Write-Host ""; Write-Host "Install failed: $text" -ForegroundColor Red
  if (-not $Quiet) { Read-Host "Press Enter to close" | Out-Null }
  exit 1
}
function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
}
function Node-Ok {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) { return $false }
  $v = (& node -v) -replace "^v", ""
  return ([version]($v -replace "[^0-9.].*$", "")) -ge [version]"20.9.0"
}

Write-Host "Insan installer" -ForegroundColor Green
Write-Host "Install folder: $InstallDir"

# 1 - Node.js
Step 1 "Checking Node.js (20.9 or newer)"
if (-not (Node-Ok)) {
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if ($winget) {
    $ans = if ($Quiet) { "y" } else { Read-Host "Node.js is missing or too old. Install Node.js LTS now with winget? (Y/n)" }
    if ($ans -match "^(n|no)$") { Fail "Node.js 20.9+ is required. Get it from https://nodejs.org and run this installer again." }
    & winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
    Refresh-Path
  }
  if (-not (Node-Ok)) {
    Start-Process "https://nodejs.org/en/download"
    Fail "Install Node.js LTS from the page that just opened, then run this installer again."
  }
}
Write-Host ("Node.js " + (& node -v) + " found")

# 2 - Copy files
Step 2 "Copying the app"
Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }   # stop an older copy that is running
if ((Resolve-Path $Source).Path -ne [IO.Path]::GetFullPath($InstallDir)) {
  New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
  & robocopy $Source $InstallDir /MIR /NFL /NDL /NJH /NJS /NP /XD node_modules .next .git .claude | Out-Null
  if ($LASTEXITCODE -ge 8) { Fail "could not copy files to $InstallDir" }
}
Set-Location $InstallDir

# 3 - Dependencies
Step 3 "Downloading dependencies (one time, needs internet, a few minutes)"
& npm ci --no-audit --no-fund --loglevel=error
if ($LASTEXITCODE -ne 0) { Fail "npm could not install the dependencies. Check your internet connection and try again." }
& node scripts/copy-pdf-worker.mjs | Out-Null

# 4 - Build
Step 4 "Building the app"
& npm run build --silent
if ($LASTEXITCODE -ne 0) { Fail "the build did not finish. Scroll up for the error." }

# 5 - Check it starts, grab the icon, add shortcuts
Step 5 "Checking that it starts"
$server = Start-Process node -ArgumentList "node_modules/next/dist/bin/next", "start", "-p", "$Port" -WorkingDirectory $InstallDir -WindowStyle Hidden -PassThru
$ok = $false
for ($i = 0; $i -lt 60 -and -not $ok; $i++) {
  Start-Sleep -Milliseconds 500
  try { $ok = (Invoke-WebRequest "http://localhost:$Port/" -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200 } catch {}
}
if (-not $ok) { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue; Fail "the app did not start on port $Port. Is another program using it?" }

# Windows icons: an .ico file may hold a PNG directly, so wrap the app's 192px PNG in an ICO header
$ico = Join-Path $InstallDir "installer\insan.ico"
try {
  $png = (Invoke-WebRequest "http://localhost:$Port/icons/192" -UseBasicParsing).Content
  $ms = New-Object IO.MemoryStream; $w = New-Object IO.BinaryWriter($ms)
  $w.Write([uint16]0); $w.Write([uint16]1); $w.Write([uint16]1)          # header: icon, 1 image
  $w.Write([byte]192); $w.Write([byte]192); $w.Write([byte]0); $w.Write([byte]0)
  $w.Write([uint16]1); $w.Write([uint16]32); $w.Write([uint32]$png.Length); $w.Write([uint32]22)
  $w.Write($png); $w.Flush(); [IO.File]::WriteAllBytes($ico, $ms.ToArray())
} catch { $ico = $null }
Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue

if (-not $NoShortcuts) {
  $shell = New-Object -ComObject WScript.Shell
  $ps = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
  function Make-Shortcut($path, $script, $desc) {
    $s = $shell.CreateShortcut($path)
    $s.TargetPath = $ps
    $s.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$InstallDir\installer\$script`""
    $s.WorkingDirectory = $InstallDir
    $s.Description = $desc
    if ($ico) { $s.IconLocation = $ico }
    $s.Save()
  }
  $menu = Join-Path ([Environment]::GetFolderPath("Programs")) "Insan"
  New-Item -ItemType Directory -Force -Path $menu | Out-Null
  Make-Shortcut (Join-Path ([Environment]::GetFolderPath("Desktop")) "Insan.lnk") "start.ps1" "Open Insan"
  Make-Shortcut (Join-Path $menu "Insan.lnk") "start.ps1" "Open Insan"
  Make-Shortcut (Join-Path $menu "Stop Insan.lnk") "stop.ps1" "Stop the Insan background server"
  $u = $shell.CreateShortcut((Join-Path $menu "Uninstall Insan.lnk"))
  $u.TargetPath = $ps
  $u.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$InstallDir\installer\uninstall.ps1`""
  $u.Save()
}

Write-Host ""
Write-Host "Insan is installed." -ForegroundColor Green
if (-not $NoShortcuts) {
  Write-Host "Open it from the 'Insan' icon on your Desktop or in the Start Menu."
  & $ps -NoProfile -ExecutionPolicy Bypass -File "$InstallDir\installer\start.ps1"
}
if (-not $Quiet) { Read-Host "Press Enter to close" | Out-Null }
