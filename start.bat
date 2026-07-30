@echo off
title Cloud Extract
echo Starting Cloud Extract server...
start /min "" powershell -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
timeout /t 2 /nobreak >nul
start http://localhost:8080
echo.
echo  Browser opened to http://localhost:8080
echo  Server is running in the background.
echo  Double-click start.vbs next time for zero windows.
echo.
timeout /t 2 /nobreak >nul
exit