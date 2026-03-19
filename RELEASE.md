# Release Process

## How to Create a New Release

### Method 1: Using Git Tags (Recommended - Triggers Auto-Build)

```bash
# 1. Make sure you're on main branch and everything is committed
git checkout main
git pull origin main

# 2. Update version in package.json (e.g., 0.1.1 -> 0.1.2)
npm version patch  # or "minor" or "major"

# 3. Update version display in src/index.html
# Find: v0.1.1 Beta (Build ...)
# Replace with: v0.1.2 Beta (Build ...)

# 4. Commit version bump
git add -A
git commit -m "Bump version to v0.1.2"

# 5. Create and push tag
git tag -a v0.1.2 -m "Release v0.1.2"
git push origin main
git push origin v0.1.2
```

**That's it!** GitHub Actions will automatically:
- Build the app for macOS (ARM64 and x64)
- Create a GitHub Release
- Upload the .dmg files

### Method 2: Manual GitHub Release

1. Go to https://github.com/carlv991/openego/releases
2. Click "Draft a new release"
3. Click "Choose a tag" and type new version (e.g., v0.1.2)
4. Click "Create new tag"
5. Add release title: "OpenEgo v0.1.2"
6. Add description of changes
7. Click "Publish release"
8. GitHub Actions will build and attach the .dmg automatically

## What Happens After Release

Once a release is published:
- Users with auto-updater enabled will see "Update Available" notification
- They can download and install with one click
- Or check manually in Settings → About → Check for Updates

## Version Numbering

- **v0.1.0** → **v0.1.1**: Patch (bug fixes)
- **v0.1.0** → **v0.2.0**: Minor (new features)
- **v0.1.0** → **v1.0.0**: Major (breaking changes / production ready)

## Build Outputs

The workflow creates:
- `OpenEgo-0.1.1.dmg` - Standard DMG for macOS
- `OpenEgo-0.1.1-arm64.dmg` - Apple Silicon (M1/M2/M3)
- `OpenEgo-0.1.1-x64.dmg` - Intel Macs
