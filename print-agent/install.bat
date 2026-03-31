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

REM Remove tarefa agendada antiga se existir
schtasks /Delete /TN "SafrasPrintAgent" /F >nul 2>&1

REM Cria script de inicializacao
echo @echo off > "%AGENT_DIR%start.bat"
echo title Safras Print Agent >> "%AGENT_DIR%start.bat"
echo cd /d "%AGENT_DIR%" >> "%AGENT_DIR%start.bat"
echo "%NODE_PATH%" index.js >> "%AGENT_DIR%start.bat"
echo pause >> "%AGENT_DIR%start.bat"

REM Cria atalho na pasta Inicializar do Windows
set STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set SHORTCUT=%STARTUP_DIR%\SafrasPrintAgent.lnk

powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT%'); $s.TargetPath = '%AGENT_DIR%start.bat'; $s.WorkingDirectory = '%AGENT_DIR%'; $s.WindowStyle = 7; $s.Description = 'Safras Print Agent'; $s.Save()"

if exist "%SHORTCUT%" (
    echo.
    echo [OK] Atalho criado na pasta Inicializar.
    echo O agente iniciara automaticamente com janela visivel no login.
    echo.
    echo Para iniciar agora, execute:
    echo   "%AGENT_DIR%start.bat"
) else (
    echo.
    echo [ERRO] Falha ao criar atalho. Tente executar como Administrador.
)

echo.
pause
