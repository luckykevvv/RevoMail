@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo RevoMail requires Node.js LTS for a source checkout.
  echo Install Node.js, then double-click RevoMail.cmd again.
  pause
  exit /b 1
)

node scripts\launch-desktop.mjs
if errorlevel 1 (
  echo.
  echo RevoMail could not start. Review the error above, then try again.
  pause
  exit /b 1
)
