@echo off
REM Chay may chu tinh de fetch JSON/HTML hoat dong (khong dung file://)
REM Yeu cau: Python 3, hoac dung VS Code Live Server
cd /d "%~dp0"
start "" http://localhost:8000/
python -m http.server 8000