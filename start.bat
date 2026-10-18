@echo off
rem ============================================================
rem  Course Selection System - one click launcher
rem  Double click this file to start the server and open browser.
rem  Requires: Node.js 20+  (https://nodejs.org)
rem ============================================================
chcp 65001 >nul
title Course Selection System
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   [ERROR] Node.js not found.
  echo.
  echo   Please install Node.js LTS from https://nodejs.org
  echo   then close this window and double click this file again.
  echo.
  pause
  exit /b 1
)

node "%~dp0start.js" %*

echo.
pause
exit /b 0
