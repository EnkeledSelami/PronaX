@echo off
setlocal
set "APP=%~dp0dist\win-unpacked\PronaX.exe"
if not exist "%APP%" (
  echo PronaX desktop files were not found. Rebuild the project with pnpm dist:win.
  pause
  exit /b 1
)
start "" "%APP%"
