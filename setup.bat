@echo off
REM Blue Catfish Presentation - Windows Setup Script

echo 🐟 Blue Catfish AI Presentation Setup
echo ======================================
echo.

REM Check for Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed!
    echo    Please install Node.js 18+ from https://nodejs.org
    pause
    exit /b 1
)

echo ✅ Node.js found: 
node --version
echo.

REM Install dependencies
echo 📦 Installing dependencies...
call npm install

if %errorlevel% equ 0 (
    echo ✅ Dependencies installed successfully!
) else (
    echo ❌ Failed to install dependencies
    pause
    exit /b 1
)

echo.
echo 🚀 Starting development server...
echo.
echo 📱 Open your browser and go to:
echo    http://localhost:3000/presentation
echo.
echo Press Ctrl+C to stop the server
echo.

REM Start the server
npm run dev

pause
