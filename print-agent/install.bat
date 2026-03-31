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

for /f "tokens=*" %%i in ('where node') do set NODE_PATH=%%i

set AGENT_DIR=%~dp0

if not exist "%AGENT_DIR%.env" (
    echo [ERRO] Arquivo .env nao encontrado em %AGENT_DIR%
    echo Copie .env.example para .env e preencha os valores.
    echo.
    pause
    exit /b 1
)

echo Node.js:    %NODE_PATH%
echo Pasta:      %AGENT_DIR%
echo.

schtasks /Create /TN "SafrasPrintAgent" /TR "\"%NODE_PATH%\" \"%AGENT_DIR%index.js\"" /SC ONLOGON /RL HIGHEST /F

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
