@echo off
start "NotiCode Serve" cmd /k "cd /d %~dp0 && node dist/index.js serve"
timeout /t 2 >nul
start "NotiCode Tunnel" cmd /k "ngrok http 4319"