@echo off
echo ============================================
echo   Safras Print Agent - Desinstalacao
echo ============================================
echo.

REM Remove tarefa agendada (se existir de versoes anteriores)
schtasks /Delete /TN "SafrasPrintAgent" /F >nul 2>&1

REM Remove atalho da pasta Inicializar
set SHORTCUT=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\SafrasPrintAgent.lnk
if exist "%SHORTCUT%" (
    del "%SHORTCUT%"
    echo [OK] Atalho removido da pasta Inicializar.
) else (
    echo Nenhum atalho encontrado.
)

REM Remove start.bat
set AGENT_DIR=%~dp0
if exist "%AGENT_DIR%start.bat" (
    del "%AGENT_DIR%start.bat"
)

echo.
pause
