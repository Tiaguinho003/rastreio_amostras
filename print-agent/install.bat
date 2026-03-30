@echo off
echo ============================================
echo   Safras Print Agent - Instalacao
echo ============================================
echo.

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] Node.js nao encontrado.
    echo Instale em: https://nodejs.org
    pause
    exit /b 1
)

set AGENT_DIR=%~dp0

schtasks /Create /TN "SafrasPrintAgent" /TR "node \"%AGENT_DIR%index.js\"" /SC ONLOGON /RL HIGHEST /F

if %errorlevel% equ 0 (
    echo.
    echo [OK] Tarefa agendada criada com sucesso.
    echo O agente iniciara automaticamente quando voce fizer login no Windows.
    echo.
    echo Para iniciar agora, abra o Prompt de Comando nesta pasta e execute:
    echo   node index.js
) else (
    echo.
    echo [ERRO] Falha ao criar tarefa. Execute este script como Administrador.
)

echo.
pause
