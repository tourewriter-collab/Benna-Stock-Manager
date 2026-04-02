#!/bin/bash

echo "=========================================="
echo "Benna Stock Manager - Desktop Build"
echo "=========================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "⚠️  Warning: Node.js version is less than 18"
    echo "Current version: $(node -v)"
    echo "Recommended: v18 or higher"
fi

echo "✓ Node.js version: $(node -v)"
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found"
    echo "Please ensure the .env file exists in the project root"
    exit 1
fi

echo "✓ Environment file found"
echo ""

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install dependencies"
        exit 1
    fi
    echo ""
fi

echo "✓ Dependencies ready"
echo ""

# Build the application
echo "🔨 Building application..."
npm run build

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ Build failed"
    exit 1
fi

echo ""
echo "✓ Build completed successfully"
echo ""

# Detect platform
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    PLATFORM="Windows"
    BUILD_CMD="npm run electron:build:win"
elif [[ "$OSTYPE" == "darwin"* ]]; then
    PLATFORM="macOS"
    BUILD_CMD="npm run electron:build:mac"
else
    PLATFORM="Linux"
    BUILD_CMD="npm run electron:build:linux"
fi

echo "📱 Detected platform: $PLATFORM"
echo "🚀 Building desktop application..."
echo ""

$BUILD_CMD

if [ $? -eq 0 ]; then
    echo ""
    echo "=========================================="
    echo "✅ Desktop app built successfully!"
    echo "=========================================="
    echo ""
    echo "📁 Output location: ./release/"
    echo ""
    echo "You can now distribute the installer to users."
else
    echo ""
    echo "❌ Desktop build failed"
    exit 1
fi
