@echo off
chcp 65001 >nul
echo 正在停止本地服务器...
echo.

for /f "delims=" %%i in ('tasklist /fi "imagename eq node.exe" /fo list 2^>nul ^| find "PID:"') do (
    for /f "tokens=2" %%p in ("%%i") do (
        echo 关闭进程 PID: %%p
        taskkill /F /PID %%p >nul 2>&1
    )
)

for /f "tokens=2 delims=:" %%i in ('tasklist /fi "imagename eq node.exe" /fo csv /nh 2^>nul') do (
    echo 关闭进程 PID: %%~i
    taskkill /F /PID %%~i >nul 2>&1
)

echo.
echo 完成。如果仍有问题，请打开任务管理器手动结束 node.exe
echo.
pause
