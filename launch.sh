#!/bin/bash
# Launch OpenEgo from source on macOS

echo "🚀 Launching OpenEgo from source..."
echo ""

# Get the directory where this script is located
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "📍 Working directory: $DIR"
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

echo "📋 Current version:"
grep -o "v0\.[0-9]*\.[0-9]*" src/index.html | head -1
echo ""

# Launch
echo "🚀 Starting OpenEgo..."
npm start
