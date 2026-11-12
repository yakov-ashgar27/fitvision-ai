@echo off
rem FitVision AI without Docker: SQLite + one Python process serving the API and the built app.
rem Needs no virtualization and little memory. Double-click this file; keep the window open during the test.
set "PATH=%SystemRoot%\System32;%SystemRoot%;%SystemRoot%\System32\WindowsPowerShell\v1.0;%PATH%;%ProgramFiles%\nodejs;%ProgramFiles(x86)%\cloudflared;%ProgramFiles%\cloudflared"
chcp 65001 > nul
cd /d "%~dp0"
title FitVision AI (light)
echo.
echo === FitVision AI - light mode (no Docker) ===
echo.

where node > nul 2>&1
if not errorlevel 1 goto node_ok
echo Installing Node.js...
winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
echo Node.js installed. Close this window and double-click the file again.
pause
exit /b
:node_ok

set "PY="
where py > nul 2>&1
if not errorlevel 1 set "PY=py -3"
if defined PY goto py_ok
where python > nul 2>&1
if not errorlevel 1 set "PY=python"
if defined PY goto py_ok
echo Installing Python...
winget install -e --id Python.Python.3.12 --accept-package-agreements --accept-source-agreements
echo Python installed. Close this window and double-click the file again.
pause
exit /b
:py_ok

where cloudflared > nul 2>&1
if not errorlevel 1 goto cf_ok
echo Installing cloudflared (HTTPS link for the phone)...
winget install -e --id Cloudflare.cloudflared --accept-package-agreements --accept-source-agreements
:cf_ok

echo [1/4] Building the phone app (first time: a few minutes)...
pushd client
if exist node_modules\.package-lock.json goto deps_ok
call npm ci || call npm install
if errorlevel 1 goto fail
:deps_ok
rem always rebuild, so a "git pull" is picked up (takes about 30 seconds)
call npm run build
if errorlevel 1 goto fail
popd

echo [2/4] Preparing the server (first time: a few minutes)...
pushd server
if not exist .venv\Scripts\python.exe %PY% -m venv .venv
if errorlevel 1 goto fail
.venv\Scripts\python.exe -m pip install -q -r requirements.txt
if errorlevel 1 goto fail
set "PDF_ENGINE=chromium"
.venv\Scripts\python.exe -m playwright install chromium > nul 2>&1 || set "PDF_ENGINE=none"

echo [3/4] Database and demo data...
set "DATABASE_URL=sqlite:///./fitvision.db"
set "SEED_DEMO=1"
set "STATIC_DIR=..\client\dist"
set "JWT_SECRET=local-demo-secret-change-me-0123456789"
set "CORS_ORIGINS=http://localhost:8000"
.venv\Scripts\python.exe -m alembic upgrade head
if errorlevel 1 goto fail
.venv\Scripts\python.exe -m app.seed
if errorlevel 1 goto fail

echo [4/4] Starting the server...
rem stop a server left over from an earlier run on port 8000
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8000 " ^| findstr LISTENING') do taskkill /pid %%p /f > nul 2>&1
start "FitVision server" /min .venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
popd
for /l %%i in (1,1,30) do (
  powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8000/api/health).StatusCode } catch { exit 1 }" > nul 2>&1 && goto up
  timeout /t 2 > nul
)
echo The server did not start. Look at the "FitVision server" window.
pause
exit /b

:up
echo.
echo The system is running: http://localhost:8000
echo   trainee: trainee@fitvision.app / Demo1234!
echo   trainer: trainer@fitvision.app / Demo1234!
echo.
start "" http://localhost:8000
echo Creating the HTTPS link for the phone. Look below for a line with https://....trycloudflare.com
echo and open that address on the phone. Keep this window open during the test.
echo.
cloudflared tunnel --url http://127.0.0.1:8000
pause
exit /b

:fail
echo.
echo Something failed - send the lines above to Claude.
pause
