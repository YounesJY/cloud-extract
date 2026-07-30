' Cloud Extract Launcher — runs silently with no visible windows
Dim shell, fso
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

Dim scriptDir
scriptDir = fso.GetAbsolutePathName(".")

' Start the PowerShell server in a hidden window
shell.Run "powershell -NoProfile -ExecutionPolicy Bypass -File """ & scriptDir & "\server.ps1""", 0, False

' Wait for server to start, then open browser
WScript.Sleep 2000
shell.Run "http://localhost:8080"
