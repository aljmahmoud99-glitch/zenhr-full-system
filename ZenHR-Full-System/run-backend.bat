@echo off
setlocal

set "ROOT=%~dp0"
set "API_DIR=%ROOT%artifacts\zenjo-api"

if not exist "%API_DIR%\zenjo-api.csproj" (
  echo Backend project file was not found at:
  echo %API_DIR%
  exit /b 1
)

call "%ROOT%run-mysql.bat"
if errorlevel 1 exit /b %errorlevel%

rem Update these defaults if your local MySQL setup is different.
if "%MYSQL_HOST%"=="" set "MYSQL_HOST=127.0.0.1"
if "%MYSQL_PORT%"=="" set "MYSQL_PORT=3306"
if "%MYSQL_DATABASE%"=="" set "MYSQL_DATABASE=zenjo"
if "%MYSQL_USER%"=="" set "MYSQL_USER=zenjo_user"
if "%MYSQL_PASSWORD%"=="" set "MYSQL_PASSWORD=ZenJO2024!"
if "%PORT%"=="" set "PORT=5000"

set "DOTNET_CLI_HOME=%ROOT%.dotnet"
set "DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1"
set "DOTNET_CLI_TELEMETRY_OPTOUT=1"
set "API_BUILD_DIR=%ROOT%build\zenjo-api-run"
if not exist "%DOTNET_CLI_HOME%" mkdir "%DOTNET_CLI_HOME%"
if not exist "%API_BUILD_DIR%" mkdir "%API_BUILD_DIR%"

set "ConnectionStrings__MySQL=Server=%MYSQL_HOST%;Port=%MYSQL_PORT%;Database=%MYSQL_DATABASE%;User=%MYSQL_USER%;Password=%MYSQL_PASSWORD%;CharSet=utf8mb4;SslMode=None;AllowPublicKeyRetrieval=True;"
set "ASPNETCORE_URLS=http://0.0.0.0:%PORT%"

cd /d "%API_DIR%"
echo Checking for an existing backend on port %PORT%...
set "API_PORT_PID="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do (
  set "API_PORT_PID=%%p"
  goto :found_port_pid
)
:found_port_pid
if defined API_PORT_PID (
  echo Stopping old backend process on port %PORT% ^(PID %API_PORT_PID%^)^...
  taskkill /PID %API_PORT_PID% /T /F >nul 2>&1
  for /L %%i in (1,1,10) do (
    timeout /t 1 /nobreak >nul
    netstat -ano | findstr /R /C:":%PORT% .*LISTENING" >nul 2>&1
    if errorlevel 1 goto :port_released
  )
  echo Port %PORT% is still busy after stopping the old process.
  echo Try again in a few seconds or set a different port, for example:
  echo set PORT=5001 ^&^& run-backend.bat
  exit /b 1
)
:port_released

echo Starting .NET API on http://localhost:%PORT%
echo Using MySQL: %MYSQL_HOST%:%MYSQL_PORT% / %MYSQL_DATABASE% / %MYSQL_USER%
echo Building backend...

call dotnet build ".\zenjo-api.csproj" --configuration Release --no-restore -o "%API_BUILD_DIR%" /p:UseAppHost=false
if errorlevel 1 exit /b %errorlevel%

echo Launching backend...
call dotnet "%API_BUILD_DIR%\ZenjoApi.dll"
exit /b %errorlevel%
