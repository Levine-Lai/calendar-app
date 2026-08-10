@echo off
setlocal

set "PET_SOURCE=%~dp0runner"
if defined CODEX_HOME (
  set "PET_TARGET=%CODEX_HOME%\pets\runner"
) else (
  set "PET_TARGET=%USERPROFILE%\.codex\pets\runner"
)

if not exist "%PET_SOURCE%\pet.json" (
  echo Runner pet manifest was not found.
  pause
  exit /b 1
)

if not exist "%PET_SOURCE%\spritesheet.png" (
  echo Runner pet spritesheet was not found.
  pause
  exit /b 1
)

mkdir "%PET_TARGET%" 2>nul
copy /y "%PET_SOURCE%\pet.json" "%PET_TARGET%\pet.json" >nul
copy /y "%PET_SOURCE%\spritesheet.png" "%PET_TARGET%\spritesheet.png" >nul

if errorlevel 1 (
  echo Installation failed. Please run this file directly from File Explorer.
  pause
  exit /b 1
)

echo Runner pet installed to:
echo %PET_TARGET%
echo.
echo Open Codex Settings ^> Pets, click Refresh, then select Runner.
pause
