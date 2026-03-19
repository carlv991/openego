#!/bin/bash

# OpenEgo - Always Latest Version
# Save this as: update-openego.sh
# Run with: bash update-openego.sh

echo "🔄 OpenEgo Updater - Getting Latest Version"
echo "============================================"

# 1. Kill OpenEgo if running
echo "1. Stopping OpenEgo..."
pkill -9 -f "OpenEgo" 2>/dev/null || true
sleep 1

# 2. Go to project
cd /Users/vicf/Documents/openego

# 3. Get latest code
echo "2. Downloading latest version..."
git fetch origin
git reset --hard origin/main

# Show current version
echo "📦 Current version:"
grep -o 'v[0-9]\+\.[0-9]\+\.[0-9]\+' package.json | head -1

# 4. Clear ALL caches
echo "3. Clearing all caches..."
rm -rf dist-electron
rm -rf node_modules
rm -f package-lock.json
rm -rf ~/Library/Caches/openego 2>/dev/null
rm -rf ~/Library/Caches/electron 2>/dev/null
rm -rf ~/Library/Caches/electron-builder 2>/dev/null
npm cache clean --force 2>/dev/null

# 5. Install dependencies
echo "4. Installing dependencies..."
npm install

# 6. Build
echo "5. Building app..."
npm run build:mac

# 7. Check if build succeeded
if [ ! -d "dist-electron/mac-arm64/OpenEgo.app" ]; then
    echo "❌ Build failed!"
    exit 1
fi

# 8. Replace old app
echo "6. Installing new version..."
rm -rf /Applications/OpenEgo.app
cp -R dist-electron/mac-arm64/OpenEgo.app /Applications/

# 9. Launch
echo "7. Launching OpenEgo..."
open /Applications/OpenEgo.app

echo ""
echo "✅ Done! OpenEgo is now running with the latest version."
echo "💡 Tip: Run this script anytime to get the latest update!"
