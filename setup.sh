#!/bin/bash

# Blue Catfish Presentation - Quick Setup Script

echo "🐟 Blue Catfish AI Presentation Setup"
echo "======================================"
echo ""

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed!"
    echo "   Please install Node.js 18+ from https://nodejs.org"
    exit 1
fi

echo "✅ Node.js found: $(node --version)"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -eq 0 ]; then
    echo "✅ Dependencies installed successfully!"
else
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo ""
echo "🚀 Starting development server..."
echo ""
echo "📱 Open your browser and go to:"
echo "   http://localhost:3000/presentation"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Start the server
npm run dev
