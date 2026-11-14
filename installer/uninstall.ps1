# Removes Insan: stops the server, deletes the shortcuts and the install folder.
# Your keys, settings and history live in the browser, not here: use "Panic wipe" in the app's
# Settings before uninstalling if you want those gone too.
$App = Split-Path -Parent $PSScriptRoot
$ans = Read-Host "Remove Insan from $App ? (y/N)"
if ($ans -notmatch "^(y|yes)$") { exit 0 }

& (Join-Path $PSScriptRoot "stop.ps1")
Remove-Item (Join-Path ([Environment]::GetFolderPath("Desktop")) "Insan.lnk") -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path ([Environment]::GetFolderPath("Programs")) "Insan") -Recurse -Force -ErrorAction SilentlyContinue
Set-Location $env:TEMP
Start-Sleep -Seconds 1
Remove-Item $App -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "Insan was removed."
Start-Sleep -Seconds 2
