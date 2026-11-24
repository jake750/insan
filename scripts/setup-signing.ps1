# One-time Android signing setup. Run it yourself in PowerShell from the project folder:
#   powershell -ExecutionPolicy Bypass -File scripts\setup-signing.ps1
#
# It asks you for a password (typed hidden, never shown or saved anywhere but your own files), then:
#   1. creates the release key android\insan-release.jks (alias "insan", RSA 2048, valid ~27 years)
#   2. writes android\keystore.properties so local release builds are signed
#   3. uploads ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD and ANDROID_KEY_PASSWORD to GitHub
#      with the gh CLI, through stdin (nothing on the command line)
# Both files are git-ignored. It never overwrites an existing key: every APK must be signed with the
# same key, or Android refuses to update over it.
$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$Jks = Join-Path $Root "android\insan-release.jks"
$Props = Join-Path $Root "android\keystore.properties"

function Fail($msg) { Write-Host "`n$msg" -ForegroundColor Red; exit 1 }

if (Test-Path $Jks) { Fail "android\insan-release.jks already exists. Keep using it; this script will not replace a signing key." }

# keytool: JAVA_HOME, then a JDK in ~/.jdks, then PATH
$keytool = @(
  $(if ($env:JAVA_HOME) { Join-Path $env:JAVA_HOME "bin\keytool.exe" })
  Get-ChildItem (Join-Path $HOME ".jdks") -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | ForEach-Object { Join-Path $_.FullName "bin\keytool.exe" }
  (Get-Command keytool.exe -ErrorAction SilentlyContinue).Source
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $keytool) { Fail "keytool was not found. Install a JDK (21 or newer) or set JAVA_HOME." }

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { Fail "The GitHub CLI (gh) is not installed: https://cli.github.com" }
gh auth status *> $null
if ($LASTEXITCODE -ne 0) { Fail "Sign in to GitHub first: gh auth login" }

function Read-Plain($prompt) {
  $s = Read-Host $prompt -AsSecureString
  [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
}

Write-Host "Choose a password for the Android signing key (at least 8 characters)."
Write-Host "Store it in your password manager: losing it means Insan can never be updated on phones again.`n"
$pw = Read-Plain "Password"
if ($pw.Length -lt 8) { Fail "The password needs at least 8 characters." }
if ($pw -ne (Read-Plain "Repeat the password")) { Fail "The two passwords don't match." }
# Java reads keystore.properties as Latin-1 and treats "\" as an escape, so keep to plain ASCII without "\"
if ($pw -notmatch '^[\x21-\x5B\x5D-\x7E]+$') { Fail "Use English letters, digits and symbols only (no spaces, no backslash, no Arabic letters)." }

Write-Host "`nCreating android\insan-release.jks…"
# keytool reads the password from an environment variable set only for this call (never on the command line).
# PKCS12 key stores use one password for both the store and the key.
$env:INSAN_PW = $pw
try {
  & $keytool -genkeypair -keystore $Jks -storetype PKCS12 -alias insan -keyalg RSA -keysize 2048 -validity 10000 `
    -dname "CN=Insan, O=Insan" -storepass:env INSAN_PW -keypass:env INSAN_PW
} finally { Remove-Item Env:INSAN_PW -ErrorAction SilentlyContinue }
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $Jks)) { Fail "keytool could not create the key." }

Set-Content -LiteralPath $Props -Encoding ascii -Value @(
  "storeFile=insan-release.jks"
  "storePassword=$pw"
  "keyAlias=insan"
  "keyPassword=$pw"
)
Write-Host "Wrote android\keystore.properties"

Write-Host "Uploading the GitHub secrets…"
Push-Location $Root
try {
  # Each value goes to gh through stdin from a temporary file holding exactly the value (no line break that
  # PowerShell's pipe would add), deleted right after.
  function Set-Secret($name, $value) {
    $f = [IO.Path]::GetTempFileName()
    try {
      [IO.File]::WriteAllText($f, $value, [Text.Encoding]::ASCII)
      cmd /c "gh secret set $name < `"$f`""
      return $LASTEXITCODE -eq 0
    } finally { Remove-Item -LiteralPath $f -Force -ErrorAction SilentlyContinue }
  }
  $ok = (Set-Secret ANDROID_KEYSTORE_BASE64 ([Convert]::ToBase64String([IO.File]::ReadAllBytes($Jks)))) -and
        (Set-Secret ANDROID_KEYSTORE_PASSWORD $pw) -and
        (Set-Secret ANDROID_KEY_PASSWORD $pw)
} finally { Pop-Location }
if (-not $ok) { Fail "Uploading the secrets failed. The key files are created; run this part again with the README commands (Releases → Signing in CI)." }

Write-Host "`nDone. Next releases attach a signed APK (and an AAB for Google Play)." -ForegroundColor Green
Write-Host "Back up android\insan-release.jks and the password somewhere safe (not in the repository)."
Write-Host "Phones that have a debug APK installed must uninstall it once and install the next signed release by hand."
