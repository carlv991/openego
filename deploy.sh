#!/bin/bash
# Deploy OpenEgo to Website

echo "🚀 Deploying OpenEgo..."

# Build Electron app
echo "Building Electron app..."
npm run build:mac

# Deploy admin dashboard to website
echo "Deploying admin dashboard..."
# Replace with your actual server details:
# scp admin.html user@your-server:/var/www/openego/
# scp -r backend user@your-server:/opt/openego/

echo "✅ Build complete!"
echo ""
echo "📦 Files ready:"
echo "  - Electron App: dist-electron/OpenEgo-0.1.0-arm64.dmg"
echo "  - Admin Dashboard: admin.html"
echo "  - Backend API: backend/"
echo ""
echo "🚀 To deploy to your server:"
echo "  1. Upload admin.html to your web server"
echo "  2. Upload backend/ to your API server"
echo "  3. Run 'npm install && npm start' in backend/"
