@echo off
chcp 65001 >nul
title 无限画布 - 内网穿透 (cloudflared)
cd /d "%~dp0"

echo ========================================
echo   无限画布 - 内网穿透启动脚本
echo ========================================
echo.
echo 请确保 start.bat 已经在运行！
echo 本脚本会将你电脑的 3001 端口暴露到公网
echo.

if not exist cloudflared.exe (
    echo 未检测到 cloudflared.exe
    echo.
    echo 正在下载 cloudflared...
    echo 如果下载失败，请手动下载: https://github.com/cloudflare/cloudflared/releases
    echo.
    
    where curl >nul 2>&1
    if %errorlevel%==0 (
        curl -L -o cloudflared.exe https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
    ) else (
        echo 请手动下载 cloudflared.exe 放到本目录
        pause
        exit /b
    )
    
    if not exist cloudflared.exe (
        echo 下载失败，请手动下载
        pause
        exit /b
    )
    
    echo 下载完成！
    echo.
)

echo 正在启动内网穿透...
echo 启动后会显示一个类似 https://xxxxx.trycloudflare.com 的地址
echo 这就是你的公网地址，把它告诉前端的 API_URL 改成这个地址
echo.
echo 注意：免费模式每次启动地址都会变
echo 要永久地址需要注册 Cloudflare Zero Trust (免费)
echo.
echo ========================================
echo.

cloudflared.exe tunnel --url http://localhost:3001 --no-autoupdate

pause
