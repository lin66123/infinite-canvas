@echo off
chcp 65001 >nul
title 无限画布 - 本地后端服务器
cd /d "%~dp0api"

if not exist node_modules (
    echo 正在安装依赖，请稍候...
    call npm install
    echo.
)

echo ========================================
echo   无限画布 - 本地后端服务器
echo   本地访问: http://localhost:3001
echo   数据目录: api\data\
echo   图片目录: api\data\uploads\
echo ========================================
echo.
echo 服务器启动中... 要关闭请按 Ctrl+C 或运行 stop.bat
echo.

node server.js
pause
