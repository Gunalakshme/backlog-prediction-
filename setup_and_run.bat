@echo off
title Arrear Predictor App Launcher
echo ===================================================
echo   Arrear Predictor and Exam Study Planner Launcher
echo ===================================================
echo.

:: Check Node.js installation
echo Checking for Node.js installation...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed on this system!
    echo.
    echo Node.js is required to run the development server.
    echo Opening Node.js download page in your browser...
    start https://nodejs.org/
    echo.
    echo Please install Node.js LTS version recommended, restart your command prompt,
    echo and run this file again.
    pause
    exit /b 1
)

:: Node.js is installed, print version
for /f "tokens=*" %%i in ('node -v') do set NODE_VER=%%i
echo Found Node.js: %NODE_VER%
echo.

:: Check if node_modules folder exists
if not exist "node_modules\" (
    echo [INFO] node_modules directory not found. Installing dependencies...
    echo Running: npm install
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install failed. Please check your internet connection.
        pause
        exit /b 1
    )
) else (
    echo [INFO] node_modules directory found. Skipping dependency installation.
)

echo.
echo ===================================================
echo   Starting Vite Development Server...
echo ===================================================
echo.
call npm run dev

pause
