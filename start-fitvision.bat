@echo off
rem FitVision AI - one-click start on Windows: checks the tools, starts the system in Docker
rem and opens an HTTPS link for the phone. Double-click this file. Close the window to stop the link.
set "PATH=%SystemRoot%\System32;%SystemRoot%;%SystemRoot%\System32\WindowsPowerShell\v1.0;%PATH%"
chcp 65001 > nul
cd /d "%~dp0"
title FitVision AI

echo.
echo === FitVision AI ===
echo.

where docker > nul 2>&1
if errorlevel 1 (
  echo Docker Desktop is not installed. Installing it now - approve the Windows prompt ^(Yes^).
  winget install -e --id Docker.DockerDesktop --accept-package-agreements --accept-source-agreements
  echo.
  echo Docker Desktop was installed. Restart the computer, open Docker Desktop once,
  echo wait for "Engine running", and then double-click this file again.
  pause
  exit /b
)

docker info > nul 2>&1
if errorlevel 1 (
  echo Starting Docker Desktop...
  start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
  for /l %%i in (1,1,60) do (
    docker info > nul 2>&1 && goto docker_ok
    timeout /t 5 > nul
  )
  echo Docker Desktop did not start. Open it manually, wait for "Engine running", and run this file again.
  pause
  exit /b
)
:docker_ok

set "PATH=%PATH%;%ProgramFiles(x86)%\cloudflared;%ProgramFiles%\cloudflared"
where cloudflared > nul 2>&1
if not errorlevel 1 goto cf_ok
echo Installing cloudflared ^(HTTPS link for the phone^)...
winget install -e --id Cloudflare.cloudflared --accept-package-agreements --accept-source-agreements
:cf_ok

if not exist .env copy .env.example .env > nul

echo Starting the system ^(the first time takes 5-10 minutes^)...
docker compose up -d --build
if errorlevel 1 (
  echo.
  echo docker compose failed. Send the lines above to Claude.
  pause
  exit /b
)

echo Waiting for the server...
for /l %%i in (1,1,60) do (
  powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing http://localhost:8080/api/health).StatusCode } catch { exit 1 }" > nul 2>&1 && goto up
  timeout /t 5 > nul
)
echo The server did not come up. Logs:
docker compose logs --tail=40 api
pause
exit /b

:up
echo.
echo The system is running: http://localhost:8080
echo   trainee: trainee@fitvision.app / Demo1234!
echo   trainer: trainer@fitvision.app / Demo1234!
echo.
start "" http://localhost:8080
echo Creating the HTTPS link for the phone. Look below for a line with https://....trycloudflare.com
echo and open that address on the phone. Keep this window open during the test.
echo.
cloudflared tunnel --url http://localhost:8080
pause
