@echo off
setlocal

set "ROOT=%~dp0"
set "APP_DIR=%ROOT%artifacts\zenjo-ng"

if not exist "%APP_DIR%\package.json" (
  echo Frontend package.json was not found at:
  echo %APP_DIR%
  exit /b 1
)

cd /d "%APP_DIR%"
echo Starting Angular frontend on http://localhost:4200
call npm.cmd install
if errorlevel 1 exit /b %errorlevel%

call npm.cmd start
exit /b %errorlevel%
