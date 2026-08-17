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

where npm >nul 2>&1
if errorlevel 1 (
  echo RevoMail requires npm. Install Node.js LTS, then double-click RevoMail.cmd again.
  pause
  exit /b 1
)

set "LOCK_HASH="
for /f "usebackq delims=" %%i in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "(Get-FileHash -LiteralPath 'package-lock.json' -Algorithm SHA256).Hash.ToLower()"`) do set "LOCK_HASH=%%i"
if "%LOCK_HASH%"=="" (
  echo Could not read package-lock.json. Restore the repository files, then try again.
  pause
  exit /b 1
)

set "NEED_INSTALL=1"
if exist "node_modules\electron\package.json" if exist "node_modules\.revomail-lock.sha256" set /p STAMP=<"node_modules\.revomail-lock.sha256"
if "%STAMP%"=="%LOCK_HASH%" set "NEED_INSTALL="

if defined NEED_INSTALL (
  echo Installing RevoMail application dependencies...
  call npm ci
  if errorlevel 1 (
    echo.
    echo RevoMail dependencies could not be installed. Review the error above, then try again.
    pause
    exit /b 1
  )
  >"node_modules\.revomail-lock.sha256" echo %LOCK_HASH%
)

echo Starting RevoMail Desktop...
call npm run desktop
if errorlevel 1 (
  echo.
  echo RevoMail could not start. Review the error above, then try again.
  pause
  exit /b 1
)
