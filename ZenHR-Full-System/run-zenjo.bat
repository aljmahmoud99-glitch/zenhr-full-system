@echo off
setlocal

set "ROOT=%~dp0"

start "ZenJO Backend" cmd /k ""%ROOT%run-backend.bat""
start "ZenJO Frontend" cmd /k ""%ROOT%run-frontend.bat""
