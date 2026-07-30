@echo off
title Cloud Extract
echo Starting Cloud Extract server...
start "Cloud Extract Server" /MIN powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
timeout /t 2 /nobreak >nul
start http://localhost:8080
echo.
echo  Browser opened to http://localhost:8080
echo  Server is running in a minimized window.
echo  Close the "Cloud Extract Server" window to stop.
echo.
pause
