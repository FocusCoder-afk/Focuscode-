@echo off
setlocal
set "APP="
for %%f in ("%~dp0build\*.exe") do set "APP=%%~ff"

set "PATH=%USERPROFILE%\.bun\bin;%PATH%"

if defined APP (
  rem Keep the engine current: when the release feed has a newer build than the one stamped in
  rem build\resources, it is downloaded in the background and used on the next launch.
  if exist "%~dp0update.ts" (
    where bun >nul 2>nul && start "" /b bun "%~dp0update.ts" --if-due --quiet
  )
  echo Starting %APP%
  start "" "%APP%"
  exit /b 0
)

cd /d "%~dp0src"
where bun >nul 2>nul
if errorlevel 1 (
  echo Nothing built yet and Bun is not installed.
  echo Run build.bat first, or install Bun from https://bun.sh
  pause
  exit /b 1
)

echo No build found. Starting the dev app...
call bun run dev:desktop
