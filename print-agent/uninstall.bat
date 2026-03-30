@echo off
echo ============================================
echo   Safras Print Agent - Desinstalacao
echo ============================================
echo.

schtasks /Delete /TN "SafrasPrintAgent" /F

if %errorlevel% equ 0 (
    echo [OK] Tarefa agendada removida.
) else (
    echo [ERRO] Falha ao remover. Execute como Administrador.
)

echo.
pause
