@echo off
rem Starts Maison and opens it in your web browser. Double-click this file to run it.
title Maison
cd /d "%~dp0"

rem Already running (from another window)? Then just open it.
curl.exe -s -o NUL --max-time 2 http://localhost:5173/ 2>NUL
if %errorlevel%==0 (
  echo Maison is already running. Opening it in your browser...
  start "" "http://localhost:5173/"
  exit /b 0
)

where npm >NUL 2>NUL
if errorlevel 1 (
  echo Maison needs Node.js, which does not seem to be installed.
  echo Download it from https://nodejs.org, install it, then double-click this file again.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Setting Maison up for the first time. This takes a minute or two...
  call npm install
  if errorlevel 1 (
    echo Setup failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

echo.
echo Starting Maison. It will open in your browser in a moment.
echo Keep this window open while you use Maison. Close it to stop Maison.
echo.
call npm start
if errorlevel 1 pause
