@echo off
chcp 65001 >nul
title 无限画布 - 本地服务器

setlocal
cd /d "%~dp0"

REM 构建前端（首次运行需要）
if not exist client\dist\index.html (
    echo 首次运行，正在构建前端页面...
    cd client
    if not exist node_modules (
        echo 正在安装前端依赖...
        call npm install
    )
    call npm run build
    cd ..
    echo.
)

REM 启动后端
cd api
if not exist node_modules (
    echo 正在安装后端依赖...
    call npm install
    echo.
)

if not exist data mkdir data
if not exist data\uploads mkdir data\uploads

echo ========================================
echo   无限画布 - 本地服务器
echo   本地访问: http://localhost:3001
echo   数据目录: %cd%\data\
echo   图片目录: %cd%\data\uploads\
echo ========================================
echo.
echo 服务器启动中... 要关闭请按 Ctrl+C 或关闭此窗口
echo.

node server.js
pause
