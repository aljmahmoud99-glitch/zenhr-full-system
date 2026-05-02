@echo off
setlocal

set "ROOT=%~dp0"
set "MYSQL_BASE=%ROOT%.mysql"
set "MYSQL_DATA=%MYSQL_BASE%\data"
set "MYSQL_LOG=%MYSQL_BASE%\mysql.err.log"
set "MYSQLD_EXE=C:\Program Files\MySQL\MySQL Server 8.4\bin\mysqld.exe"
set "MYSQL_EXE=C:\Program Files\MySQL\MySQL Server 8.4\bin\mysql.exe"

if not exist "%MYSQLD_EXE%" (
  echo MySQL server executable was not found:
  echo %MYSQLD_EXE%
  exit /b 1
)

if not exist "%MYSQL_EXE%" (
  echo MySQL client executable was not found:
  echo %MYSQL_EXE%
  exit /b 1
)

if not exist "%MYSQL_BASE%" mkdir "%MYSQL_BASE%"

if not exist "%MYSQL_DATA%\mysql" (
  echo Initializing local MySQL data directory...
  mkdir "%MYSQL_DATA%" >nul 2>&1
  "%MYSQLD_EXE%" --initialize-insecure --console --datadir="%MYSQL_DATA%" > "%MYSQL_LOG%" 2>&1
  if errorlevel 1 (
    echo MySQL initialization failed. See log:
    echo %MYSQL_LOG%
    exit /b 1
  )
)

for /f %%p in ('powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort 3306 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess)"') do set "MYSQL_PORT_PID=%%p"
if not defined MYSQL_PORT_PID (
  echo Starting local MySQL on port 3306...
  start "ZenJO MySQL" /min "%MYSQLD_EXE%" --datadir="%MYSQL_DATA%" --port=3306 --bind-address=127.0.0.1 --mysqlx=0 --console
)

set "MYSQL_READY="
for /L %%i in (1,1,30) do (
  "%MYSQL_EXE%" --protocol=TCP -h 127.0.0.1 -P 3306 -u root -e "SELECT 1" >nul 2>&1
  if not errorlevel 1 (
    set "MYSQL_READY=1"
    goto :mysql_ready
  )
  timeout /t 1 /nobreak >nul
)

:mysql_ready
if not defined MYSQL_READY (
  echo MySQL did not become ready in time. See log:
  echo %MYSQL_LOG%
  exit /b 1
)

echo Ensuring ZenJO database and user exist...
"%MYSQL_EXE%" --protocol=TCP -h 127.0.0.1 -P 3306 -u root -e "CREATE DATABASE IF NOT EXISTS zenjo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; CREATE USER IF NOT EXISTS 'zenjo_user'@'localhost' IDENTIFIED BY 'ZenJO2024!'; CREATE USER IF NOT EXISTS 'zenjo_user'@'127.0.0.1' IDENTIFIED BY 'ZenJO2024!'; ALTER USER 'zenjo_user'@'localhost' IDENTIFIED BY 'ZenJO2024!'; ALTER USER 'zenjo_user'@'127.0.0.1' IDENTIFIED BY 'ZenJO2024!'; GRANT ALL PRIVILEGES ON zenjo.* TO 'zenjo_user'@'localhost'; GRANT ALL PRIVILEGES ON zenjo.* TO 'zenjo_user'@'127.0.0.1'; FLUSH PRIVILEGES;" >nul 2>&1
if errorlevel 1 (
  echo Failed to create ZenJO database/user.
  exit /b 1
)

echo MySQL is ready on localhost:3306
exit /b 0
