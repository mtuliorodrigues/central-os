@echo off
setlocal
cd /d "%~dp0"
title Central OS Integrada
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start.ps1"
set "RC=%ERRORLEVEL%"
echo.
if not "%RC%"=="0" (
  echo [FALHA] A inicializacao nao concluiu todos os healthchecks.
  echo Consulte logs\inicializador.
  pause
) else (
  echo [OK] Central OS Integrada pronta.
  echo Esta janela pode ser fechada.
)
exit /b %RC%
