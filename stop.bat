@echo off
echo Stopping Cloud Extract server...
powershell -NoProfile -Command "Get-Process -Name powershell | Where-Object { $_.CommandLine -like '*server.ps1*' } | Stop-Process -Force" 2>nul
echo Server stopped.
timeout /t 2 /nobreak >nul