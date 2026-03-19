#!/bin/bash

# OpenEgo Complete Clean Rebuild Script
# This clears ALL caches to ensure fresh build

echo "🧹 OpenEgo Complete Clean Rebuild"
echo "=================================="

# Kill any running OpenEgo processes
echo "1. Killing OpenEgo processes..."
pkill -9 -f "OpenEgo" 2>/dev/null || true

# Navigate to project
echo "2. Navigating to project..."
cd /Users/vicf/Documents/openego

# Pull latest code
echo "3. Pulling latest code..."
git fetch origin
git reset --hard origin/main

# Clear ALL build artifacts
echo "4. Clearing build artifacts..."
rm -rf dist-electron
rm -rf node_modules
rm -f package-lock.json

# Clear system caches
echo "5. Clearing system caches..."
rm -rf ~/Library/Caches/openego 2>/dev/null || true
rm -rf ~/Library/Caches/electron 2>/dev/null || true
rm -rf ~/Library/Caches/electron-builder 2>/dev/null || true
rm -rf ~/.cache/electron 2>/dev/null || true
rm -rf ~/.cache/electron-builder 2>/dev/null || true

# Clear npm cache
echo "6. Clearing npm cache..."
npm cache clean --force

# Reinstall dependencies
echo "7. Installing dependencies..."
npm install

# Build the app
echo "8. Building app..."
npm run build:mac

# Verify build
echo "9. Verifying build..."
if [ -d "dist-electron/mac-arm64/OpenEgo.app" ]; then
    echo "✅ Build successful!"
    
    # Check version in built app
    BUILT_VERSION=$(cat dist-electron/mac-arm64/OpenEgo.app/Contents/Resources/app/package.json 2>/dev/null | grep '"version"' | cut -d'"' -f4)
    echo "📦 Built version: $BUILT_VERSION"
else
    echo "❌ Build failed!"
    exit 1
fi

# Remove old app from Applications
echo "10. Removing old app..."
rm -rf /Applications/OpenEgo.app

# Copy new app
echo "11. Installing new app..."
cp -R dist-electron/mac-arm64/OpenEgo.app /Applications/

# Launch
echo "12. Launching OpenEgo..."
open /Applications/OpenEgo.app

echo ""
echo "✨ Done! OpenEgo should now be running with the latest version."
