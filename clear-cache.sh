#!/bin/bash
# Clear OpenEgo caches on macOS

echo "🧹 Clearing OpenEgo caches..."

# Kill any running OpenEgo processes
pkill -f "OpenEgo" 2>/dev/null
pkill -f "openego" 2>/dev/null
pkill -f "electron" 2>/dev/null
sleep 1

# Clear macOS cache locations
rm -rf ~/Library/Caches/openego
rm -rf ~/Library/Caches/electron
rm -rf ~/Library/Application\ Support/openego/Cache
rm -rf ~/Library/Application\ Support/openego/GPUCache
rm -rf ~/Library/Application\ Support/openego/Code\ Cache
rm -rf ~/Library/Saved\ Application\ State/com.openego* 2>/dev/null

echo "✅ Caches cleared!"
echo ""
echo "Now run OpenEgo from the latest source."
