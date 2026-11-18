; Inno Setup 6 script for the Windows setup. Built by scripts/build-pc.mjs, which passes
;   /DAppVersion=X.Y.Z /DSourceDir=<dist-pc\Insan> /DOutputDir=<dist-pc>
; Installs per user (no admin rights) into %LOCALAPPDATA%\Programs\Insan, with Start-menu and
; optional Desktop shortcuts and a normal uninstaller (Settings > Apps).

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#ifndef SourceDir
  #define SourceDir "..\dist-pc\Insan"
#endif
#ifndef OutputDir
  #define OutputDir "..\dist-pc"
#endif
#define PS "{sys}\WindowsPowerShell\v1.0\powershell.exe"
#define LangDir AddBackslash(CompilerPath) + "Languages\"

[Setup]
AppId={{6E3C9A52-41D7-4C1B-9B7E-1A5F2C8D7E31}
AppName=Insan
AppVersion={#AppVersion}
AppVerName=Insan {#AppVersion}
AppPublisher=Insan
AppComments=Rewrites AI-sounding text so it reads like a person wrote it.
DefaultDirName={localappdata}\Programs\Insan
DefaultGroupName=Insan
DisableProgramGroupPage=yes
DisableDirPage=auto
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir={#OutputDir}
OutputBaseFilename=Insan-Setup-{#AppVersion}
SetupIconFile={#SourceDir}\insan.ico
UninstallDisplayIcon={app}\insan.ico
UninstallDisplayName=Insan
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
ShowLanguageDialog=auto

[Languages]
Name: "en"; MessagesFile: "compiler:Default.isl"
#if FileExists(LangDir + "Arabic.isl")
Name: "ar"; MessagesFile: "compiler:Languages\Arabic.isl"
#endif
#if FileExists(LangDir + "French.isl")
Name: "fr"; MessagesFile: "compiler:Languages\French.isl"
#endif

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{autoprograms}\Insan"; Filename: "{#PS}"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\launch.ps1"""; WorkingDir: "{app}"; IconFilename: "{app}\insan.ico"; Comment: "Open Insan"
Name: "{autodesktop}\Insan"; Filename: "{#PS}"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\launch.ps1"""; WorkingDir: "{app}"; IconFilename: "{app}\insan.ico"; Comment: "Open Insan"; Tasks: desktopicon

[Run]
Filename: "{#PS}"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\launch.ps1"""; Description: "{cm:LaunchProgram,Insan}"; Flags: postinstall nowait skipifsilent runhidden

[UninstallRun]
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM InsanServer.exe"; Flags: runhidden; RunOnceId: "StopInsan"

[UninstallDelete]
; the app window's own browser profile (settings, key and history)
Type: filesandordirs; Name: "{app}\profile"

[Code]
// stop a running copy before files are replaced on an update
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Code: Integer;
begin
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM InsanServer.exe', '', SW_HIDE, ewWaitUntilTerminated, Code);
  Result := '';
end;
