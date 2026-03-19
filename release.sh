#!/bin/bash
# Release script for OpenEgo

echo "🚀 Creating new OpenEgo release..."

# Get current version from package.json
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "Current version: v$CURRENT_VERSION"

# Ask for new version
read -p "Enter new version (e.g., 0.1.2): " NEW_VERSION

# Update package.json
npm version $NEW_VERSION --no-git-tag-version

# Update version in HTML
sed -i '' "s/v$CURRENT_VERSION/v$NEW_VERSION/g" src/index.html

# Commit changes
git add -A
git commit -m "Bump version to v$NEW_VERSION"

# Create and push tag
git tag -a v$NEW_VERSION -m "Release v$NEW_VERSION"
git push origin main
git push origin v$NEW_VERSION

echo ""
echo "✅ Release v$NEW_VERSION triggered!"
echo ""
echo "GitHub Actions will now:"
echo "  1. Build the app for macOS"
echo "  2. Create a GitHub Release"
echo "  3. Upload the .dmg files"
echo ""
echo "Check progress at: https://github.com/carlv991/openego/actions"
echo "Release will appear at: https://github.com/carlv991/openego/releases"
