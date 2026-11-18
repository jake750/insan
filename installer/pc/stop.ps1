# Stops the Insan background server started by launch.ps1 (only Insan's own bundled runtime).
Get-Process InsanServer -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
