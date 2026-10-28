@echo off
setlocal
set "NODE_DIR=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
set "PNPM_DIR=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback"
if exist "%NODE_DIR%\node.exe" set "PATH=%NODE_DIR%;%PNPM_DIR%;%PATH%"
cd /d "%~dp0"
if not exist "node_modules\next\package.json" (
  echo Installing PronaX dependencies. This requires an internet connection on first run.
  call "%PNPM_DIR%\pnpm.cmd" install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
call "%PNPM_DIR%\pnpm.cmd" dev
if errorlevel 1 pause
