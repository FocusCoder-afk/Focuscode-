@echo off
setlocal
cd /d "%~dp0src"

where bun >nul 2>nul
if errorlevel 1 set "PATH=%USERPROFILE%\.bun\bin;%PATH%"
where bun >nul 2>nul
if errorlevel 1 (
  echo Bun is required. Install it from https://bun.sh
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

set "OUT=%~dp0build"
if exist "%OUT%" rmdir /s /q "%OUT%"
mkdir "%OUT%"
xcopy "dist\desktop\app\*" "%OUT%\" /E /I /H /Y >nul
if errorlevel 1 goto fail

echo.
echo Done. FocusCode is in "%OUT%":
for %%f in ("%OUT%\*.exe") do echo   %%~nxf
pause
exit /b 0

:fail
echo.
echo Build failed. Fix the error above and run build.bat again.
pause
exit /b 1
