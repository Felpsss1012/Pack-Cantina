@echo off
rem caminho relativo ao venv do projeto - ajuste se necessário
set VENV_DIR=%~dp0venv
if exist "%VENV_DIR%\Scripts\activate.bat" (
  call "%VENV_DIR%\Scripts\activate.bat"
) else (
  rem tenta ativar sem venv, assume python já no PATH
  echo "Virtualenv nao encontrada em %VENV_DIR%. Usando python do PATH."
)

rem entra na pasta do script (garante caminhos relativos)
cd /d "%~dp0"

rem roda o launcher (que inicia app.py e abre o browser quando pronto)
python launcher.py

pause
