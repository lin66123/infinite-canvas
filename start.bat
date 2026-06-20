@echo off
chcp 65001 >nul
title 无限画布 - 本地后端服务器

setlocal
cd /d "%~dp0api"

if not exist node_modules (
    echo 首次运行，正在安装依赖...
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo npm install 失败，请确保电脑已安装 Node.js
        echo 下载地址: https://nodejs.org
        echo.
        pause
        exit /b
    )
    echo.
)

if not exist data mkdir data
if not exist data\uploads mkdir data\uploads

echo ========================================
echo   无限画布 - 本地后端服务器
echo   本地访问: http://localhost:3001
echo   数据目录: %cd%\data\
echo   图片目录: %cd%\data\uploads\
echo ========================================
echo.
echo 服务器启动中... 要关闭请按 Ctrl+C 或关闭此窗口
echo.

node server.js
pause
