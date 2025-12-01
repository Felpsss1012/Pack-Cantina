@echo off
rem run_client.bat - abre html\painel.html sem iniciar app.py
rem Local: coloque este .bat na raiz do projeto (mesma pasta de app.py, launcher.py, html\painel.html)

rem modos:
rem   run_client.bat        -> abre arquivo local html\painel.html (file://)
rem   run_client.bat serve  -> inicia python -m http.server :8000 e abre http://127.0.0.1:8000/html/painel.html
rem   run_client.bat both   -> abre painel e index localmente (file://)

setlocal
set "BASEDIR=%~dp0"
cd /d "%BASEDIR%"

if "%1"=="serve" (
    echo Iniciando servidor estatico na porta 8000 e abrindo painel...
    rem abre uma nova janela cmd que roda o servidor (Ctrl+C para parar nessa janela)
    start "" cmd /k "python -m http.server 8000 --directory \"%BASEDIR%\""
    timeout /t 1 >nul
    start "" "http://127.0.0.1:5000/html/painel.html"
    goto :eof
)

if "%1"=="both" (
    echo Abrindo painel e index localmente...
    if exist "%BASEDIR%html\painel.html" (
        start "" "%BASEDIR%html\painel.html"
    ) else (
        echo [ERRO] html\painel.html nao encontrado em %BASEDIR%
    )
    if exist "%BASEDIR%html\index.html" (
        start "" "%BASEDIR%html\index.html"
    )
    goto :eof
)

rem modo padrao: abre painel localmente
echo Abrindo painel local: %BASEDIR%html\painel.html
if exist "%BASEDIR%html\painel.html" (
    start "" "%BASEDIR%html\painel.html"
) else (
    echo [ERRO] html\painel.html nao encontrado em %BASEDIR%
)

endlocal
pause
