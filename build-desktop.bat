@echo off
echo ==========================================
echo Benna Stock Manager - Desktop Build
echo ==========================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo Node.js version:
node -v
echo.

REM Check if .env file exists
if not exist .env (
    echo Error: .env file not found
    echo Please ensure the .env file exists in the project root
    pause
    exit /b 1
)

echo Environment file found
echo.

REM Install dependencies if node_modules doesn't exist
if not exist node_modules (
    echo Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo Failed to install dependencies
        pause
        exit /b 1
    )
    echo.
)

echo Dependencies ready
echo.

REM Build the application
echo Building application...
call npm run build

if %errorlevel% neq 0 (
    echo.
    echo Build failed
    pause
    exit /b 1
)

echo.
echo Build completed successfully
echo.

REM Build desktop application for Windows
echo Building Windows desktop application...
echo.

call npm run electron:build:win

if %errorlevel% equ 0 (
    echo.
    echo ==========================================
    echo Desktop app built successfully!
    echo ==========================================
    echo.
    echo Output location: .\release\
    echo.
    echo You can now distribute the installer to users.
) else (
    echo.
    echo Desktop build failed
)

pause
