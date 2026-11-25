@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto python_server
start "" http://127.0.0.1:8000/
node tools/serve.mjs
goto done
:python_server
start "" http://127.0.0.1:8000/
python -m http.server 8000 --bind 127.0.0.1
:done
pause
