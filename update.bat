@echo off
setlocal
cd /d "%~dp0"

where bun >nul 2>nul
if errorlevel 1 set "PATH=%USERPROFILE%\.bun\bin;%PATH%"
where bun >nul 2>nul
if errorlevel 1 (
  echo Bun is required. Install it from https://bun.sh
  pause
  exit /b 1
)

call bun "%~dp0update.ts" %*
if errorlevel 1 (
  pause
  exit /b 1
)

rem Double-clicked without arguments: keep the window up so the result is readable.
if "%~1"=="" pause
exit /b 0
