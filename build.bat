@echo off
setlocal EnableExtensions
title FocusCode Build

rem Run from the folder this script lives in, no matter where it was launched from.
cd /d "%~dp0"
if errorlevel 1 (
  echo Could not enter "%~dp0".
  pause
  exit /b 1
)

rem Bun comes from PATH first, then the default install location, and is installed
rem automatically if it is nowhere.
where bun >nul 2>nul
if errorlevel 1 if exist "%USERPROFILE%\.bun\bin\bun.exe" set "PATH=%USERPROFILE%\.bun\bin;%PATH%"
where bun >nul 2>nul
if errorlevel 1 (
  echo Bun is not installed. Installing it...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "irm bun.sh/install.ps1 | iex"
  if errorlevel 1 (
    echo Bun could not be installed automatically. Install it from https://bun.sh
    pause
    exit /b 1
  )
  set "PATH=%USERPROFILE%\.bun\bin;%PATH%"
)
where bun >nul 2>nul
if errorlevel 1 (
  echo Bun did not install correctly. Install it from https://bun.sh and run this again.
  pause
  exit /b 1
)

rem The src tree is the program itself. If the script was copied somewhere without it,
rem pull it back down from GitHub.
if not exist "%~dp0src\package.json" call :fetchsrc
if not exist "%~dp0src\package.json" (
  echo The src folder is missing and could not be restored. Download the whole project
  echo from https://github.com/FocusCoder-afk/Focuscode- and run this script from its build
  echo location, next to the src folder.
  pause
  exit /b 1
)

cd /d "%~dp0src"
if errorlevel 1 (
  echo Could not enter "%~dp0src".
  pause
  exit /b 1
)

rem The production channel is what names the app "FocusCode" and gives it the prod icon and id.
set "OPENCODE_CHANNEL=prod"

echo [1/4] Installing dependencies...
call bun install
if errorlevel 1 goto fail

echo [2/4] Building the bundled CLI...
rem The desktop bundles its own CLI, and a prod build refuses to package without it.
rem OPENCODE_TARGET keeps the CLI build to this machine's target instead of all twelve. The desktop
rem packaging resolves its own target name, so it is cleared again below.
rem
rem The version is stamped into the CLI (--version), the desktop shell, and the User-Agent of every
rem request the app makes, including Console. A build without OPENCODE_VERSION falls back to
rem 0.0.0-<channel>-<timestamp>, which Console reads as 0.0.0 and rejects for the free tier
rem ("opencode 1.18.0 or newer is required"). Stamp the package version instead.
if not defined OPENCODE_VERSION for /f "delims=" %%v in ('bun -e "console.log(require('./package.json').version)"') do set "OPENCODE_VERSION=%%v"
if not defined OPENCODE_VERSION (
  echo Could not read the version from package.json.
  goto fail
)
echo      version %OPENCODE_VERSION%
rem The CLI reports its channel in the User-Agent Console reads, and "prod" is this fork's packaging
rem channel, not a release channel. Build the engine as "latest" so it identifies itself exactly
rem like a stock release; the app is switched back to "prod" for packaging below.
set "OPENCODE_CHANNEL=latest"
set "OPENCODE_TARGET=windows-x64-baseline"
if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "OPENCODE_TARGET=windows-arm64"
echo      target %OPENCODE_TARGET%
call bun run --cwd packages/cli build --skip-install
if errorlevel 1 goto fail
set "OPENCODE_TARGET="
set "OPENCODE_CHANNEL=prod"

echo [3/4] Building the FocusCode app...
call bun run --cwd packages/desktop build
if errorlevel 1 goto fail

echo [4/4] Packaging...
call bun run --cwd packages/desktop pack
if errorlevel 1 goto fail

if not exist "dist\desktop\app" (
  echo Packaging finished without a build to copy. Run build.bat again.
  goto fail
)

set "OUT=%~dp0build"
if exist "%OUT%" rmdir /s /q "%OUT%" 2>nul
if exist "%OUT%" (
  echo Could not remove the old build folder. Close FocusCode if it is running and try again.
  goto fail
)
mkdir "%OUT%"
xcopy "dist\desktop\app\*" "%OUT%\" /E /I /H /Y >nul
if errorlevel 1 goto fail

echo.
echo Done. FocusCode is in "%OUT%":
for %%f in ("%OUT%\*.exe") do echo   %%~nxf
pause
exit /b 0

:fetchsrc
echo The src folder is missing. Fetching the project source...
where git >nul 2>nul
if errorlevel 1 goto zipball
git clone --depth 1 https://github.com/FocusCoder-afk/Focuscode-.git "%TEMP%\focuscode-src"
if errorlevel 1 goto zipball
if not exist "%TEMP%\focuscode-src\src\package.json" goto zipball
robocopy "%TEMP%\focuscode-src\src" "%~dp0src" /E /MOVE /NFL /NDL /NJH /NJS >nul
rmdir /s /q "%TEMP%\focuscode-src" 2>nul
goto :eof
:zipball
rem No git installed: download the repository as a zip and pull the src folder out of it.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$z = Join-Path $env:TEMP 'focuscode-src.zip'; $d = Join-Path $env:TEMP 'focuscode-unzip'; Remove-Item $z,$d -Recurse -Force -ErrorAction SilentlyContinue; Invoke-WebRequest 'https://api.github.com/repos/FocusCoder-afk/Focuscode-/zipball' -OutFile $z -UseBasicParsing; Expand-Archive $z $d -Force; $root = (Get-ChildItem $d -Directory | Select-Object -First 1).FullName; robocopy (Join-Path $root 'src') 'src' /E /NFL /NDL /NJH /NJS; Remove-Item $z,$d -Recurse -Force"
goto :eof

:fail
echo.
echo Build failed. Fix the error above and run build.bat again.
pause
exit /b 1
