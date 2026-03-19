#!/bin/bash
# Auto-publish release script - Run this to auto-create a release

set -e

echo "🚀 Auto-publishing OpenEgo release..."

# Navigate to project directory
cd /Users/vicf/Documents/openego || {
    echo "❌ Error: Could not find openego directory"
    exit 1
}

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "Current version: v$CURRENT_VERSION"

# Calculate next version (auto-increment patch)
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"
NEW_PATCH=$((PATCH + 1))
NEW_VERSION="$MAJOR.$MINOR.$NEW_PATCH"

echo "New version will be: v$NEW_VERSION"

# Update version in package.json
npm version $NEW_VERSION --no-git-tag-version --allow-same-version

# Update version in HTML
sed -i '' "s/v$CURRENT_VERSION/v$NEW_VERSION/g" src/index.html 2>/dev/null || true
sed -i '' "s/v$CURRENT_VERSION/v$NEW_VERSION/g" src/index.html

# Commit changes
git add -A
git commit -m "Auto-release v$NEW_VERSION" || {
    echo "⚠️  No changes to commit or commit failed"
}

# Push to main
git push origin main

# Create and push tag (triggers GitHub Actions)
git tag -a v$NEW_VERSION -m "Auto-release v$NEW_VERSION"
git push origin v$NEW_VERSION

echo ""
echo "✅ Auto-release v$NEW_VERSION triggered!"
echo ""
echo "GitHub Actions will now:"
echo "  - Build the app for macOS (ARM64 + x64)"
echo "  - Create a GitHub Release"
echo "  - Upload .dmg files"
echo ""
echo "⏱️  Build takes ~5 minutes"
echo "📊 Check progress: https://github.com/carlv991/openego/actions"
echo "📦 Release will be at: https://github.com/carlv991/openego/releases"
echo ""
echo "💡 Users will get auto-update notification when they restart the app!"
