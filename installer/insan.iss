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

[InstallDelete]
; on an update, replace the app files cleanly (the running server is stopped first, see PrepareToInstall)
Type: filesandordirs; Name: "{app}\app"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{autoprograms}\Insan"; Filename: "{#PS}"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\launch.ps1"""; WorkingDir: "{app}"; IconFilename: "{app}\insan.ico"; Comment: "Open Insan"
Name: "{autodesktop}\Insan"; Filename: "{#PS}"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\launch.ps1"""; WorkingDir: "{app}"; IconFilename: "{app}\insan.ico"; Comment: "Open Insan"; Tasks: desktopicon

[Run]
Filename: "{#PS}"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\launch.ps1"""; Description: "{cm:LaunchProgram,Insan}"; Flags: postinstall nowait skipifsilent runhidden

[UninstallRun]
; stop the server and close Insan's own app windows so their files can be removed
Filename: "{#PS}"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\stop.ps1"" -Windows"; Flags: runhidden waituntilterminated; RunOnceId: "StopInsan"

[UninstallDelete]
; files the app writes while running: the server's cache and the app window's own browser profile
; (settings, key, history). Only these two folders, never the whole install folder.
Type: filesandordirs; Name: "{app}\app"
Type: filesandordirs; Name: "{app}\profile"
Type: dirifempty; Name: "{app}"

[Code]
// stop a running copy before files are replaced on an update
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Code: Integer;
begin
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM InsanServer.exe', '', SW_HIDE, ewWaitUntilTerminated, Code);
  Result := '';
end;

// second pass at the very end: the browser can keep writing to its profile for a few seconds after
// it is stopped, so retry for up to 10 s
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  I: Integer;
begin
  if CurUninstallStep = usPostUninstall then
  begin
    for I := 1 to 10 do
    begin
      DelTree(ExpandConstant('{app}\profile'), True, True, True);
      DelTree(ExpandConstant('{app}\app'), True, True, True);
      if not DirExists(ExpandConstant('{app}\profile')) and not DirExists(ExpandConstant('{app}\app')) then Break;
      Sleep(1000);
    end;
    RemoveDir(ExpandConstant('{app}'));
  end;
end;
