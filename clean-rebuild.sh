#!/bin/bash
# OpenEgo Complete Clean Rebuild Script
# Run this to fix code display issues

echo "🧹 OpenEgo Complete Cleanup & Rebuild"
echo "======================================"

# Kill any running OpenEgo processes
echo "1. Stopping any running OpenEgo processes..."
pkill -f OpenEgo 2>/dev/null || true
sleep 2

# Clear ALL macOS caches
echo "2. Clearing macOS caches..."
rm -rf ~/Library/Caches/openego
rm -rf ~/Library/Caches/openego-updater
rm -rf ~/Library/Caches/electron
rm -rf ~/Library/Caches/electron-builder
rm -rf ~/Library/Application\ Support/openego
rm -rf ~/Library/Application\ Support/openego-updater
rm -rf ~/Library/Logs/openego
rm -rf ~/Library/Saved\ Application\ State/com.openego.app.savedState

# Remove old app
echo "3. Removing old OpenEgo app..."
rm -rf /Applications/OpenEgo.app

# Go to project directory
cd ~/openego

# Clean build directories
echo "4. Cleaning build directories..."
rm -rf dist-electron
rm -rf node_modules/.cache
rm -rf .electron-gyp

# Pull latest code
echo "5. Pulling latest code..."
git reset --hard HEAD
git clean -fd
git pull origin main

# Rebuild
echo "6. Building OpenEgo (this may take a few minutes)..."
npm run build:mac

# Install fresh
echo "7. Installing to Applications..."
cp -R dist-electron/mac/OpenEgo.app /Applications/

echo ""
echo "✅ Done! OpenEgo has been rebuilt and installed."
echo ""
echo "🚀 Launch with: open /Applications/OpenEgo.app"
