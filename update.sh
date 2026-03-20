#!/bin/bash
# OpenEgo One-Command Update
# Usage: ./update.sh
# This script: clears cache → pulls latest → launches OpenEgo

echo "🔄 OpenEgo Update"
echo "================="
echo ""

# Get the directory where this script is located
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "📍 Location: $DIR"
echo ""

# Step 1: Kill any running OpenEgo processes
echo "🛑 Stopping any running OpenEgo processes..."
pkill -f "OpenEgo" 2>/dev/null
pkill -f "openego" 2>/dev/null
pkill -f "electron" 2>/dev/null
sleep 1
echo "✅ Processes stopped"
echo ""

# Step 2: Clear ALL caches
echo "🧹 Clearing all caches..."
# macOS locations
rm -rf ~/Library/Caches/openego 2>/dev/null
rm -rf ~/Library/Caches/electron 2>/dev/null
rm -rf ~/Library/Application\ Support/openego/Cache 2>/dev/null
rm -rf ~/Library/Application\ Support/openego/GPUCache 2>/dev/null
rm -rf ~/Library/Application\ Support/openego/Code\ Cache 2>/dev/null
rm -rf ~/Library/Saved\ Application\ State/com.openego* 2>/dev/null

# Project cache
rm -rf node_modules/.cache 2>/dev/null
rm -rf dist 2>/dev/null

# Remove any old Tauri builds that might be conflicting
if [ -f "src-tauri/target/release/openego" ]; then
    mv src-tauri/target/release/openego src-tauri/target/release/openego-old-backup 2>/dev/null
    echo "   (Renamed old Tauri build)"
fi

echo "✅ Cache cleared"
echo ""

# Step 3: Pull latest changes from git
echo "📦 Checking for updates..."
git pull origin main 2>/dev/null || git pull 2>/dev/null || echo "   (Git pull skipped - no remote or offline)"

echo ""
echo "📋 Current version:"
grep -o "v0\.[0-9]*\.[0-9]*" src/index.html 2>/dev/null | head -1 || echo "   (version not found)"
echo ""

# Step 4: Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies (first run)..."
    npm install
    echo ""
fi

# Step 5: Launch OpenEgo
echo "🚀 Starting OpenEgo..."
echo ""
npm start
