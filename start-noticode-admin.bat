@echo off
:: Проверяем права администратора
net session >nul 2>&1
if %errorLevel% neq 0 (
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

:: Этот блок выполнится уже с правами Администратора
cd /d "%~dp0"
start "NotiCode Serve" cmd /k "node dist/index.js serve"
timeout /t 2 >nul
start "NotiCode Tunnel" cmd /k "ngrok http 4319"