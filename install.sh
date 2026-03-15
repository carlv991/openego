#!/bin/bash
set -e

# OpenEgo Installer Script
# Usage: curl -fsSL https://openego.ai/install.sh | bash

VERSION="0.1.0"
INSTALL_DIR=""
REPO_URL="https://github.com/carlv991/openego/releases/download"
APP_NAME="openego"

echo "🧠 OpenEgo Installer"
echo "===================="
echo ""

# Detect OS
detect_os() {
    case "$(uname -s)" in
        Linux*)     OS=Linux;;
        Darwin*)    OS=Mac;;
        CYGWIN*|MINGW*|MSYS*) OS=Windows;;
        *)          OS="UNKNOWN";;
    esac
    echo "📦 Detected OS: $OS"
}

# Detect architecture
detect_arch() {
    case "$(uname -m)" in
        x86_64)     ARCH="x86_64";;
        arm64|aarch64) ARCH="aarch64";;
        *)          ARCH="x86_64";;
    esac
    echo "🔧 Architecture: $ARCH"
}

# Set install directory
set_install_dir() {
    if [ -n "$INSTALL_DIR" ]; then
        return
    fi
    
    # Check if ~/.local/bin exists and is writable
    if [ -d "$HOME/.local/bin" ] && [ -w "$HOME/.local/bin" ]; then
        INSTALL_DIR="$HOME/.local/bin"
    elif [ -w "/usr/local/bin" ]; then
        INSTALL_DIR="/usr/local/bin"
    else
        INSTALL_DIR="$HOME/.local/bin"
        mkdir -p "$INSTALL_DIR"
    fi
    
    echo "📁 Install directory: $INSTALL_DIR"
}

# Download binary
download_binary() {
    local binary_name=""
    local download_url=""
    
    case "$OS" in
        Linux)
            binary_name="${APP_NAME}-linux-${ARCH}"
            download_url="${REPO_URL}/v${VERSION}/${binary_name}.tar.gz"
            ;;
        Mac)
            binary_name="${APP_NAME}-macos-${ARCH}"
            download_url="${REPO_URL}/v${VERSION}/${binary_name}.tar.gz"
            ;;
        Windows)
            binary_name="${APP_NAME}-windows-${ARCH}.exe"
            download_url="${REPO_URL}/v${VERSION}/${binary_name}"
            echo "❌ Windows automatic installation not yet supported."
            echo "   Please download manually from: https://github.com/carlv991/openego/releases"
            exit 1
            ;;
        *)
            echo "❌ Unknown operating system. Please download manually."
            exit 1
            ;;
    esac
    
    echo ""
    echo "⬇️  Downloading OpenEgo v${VERSION}..."
    echo "   URL: $download_url"
    
    # Create temp directory
    TEMP_DIR=$(mktemp -d)
    cd "$TEMP_DIR"
    
    # Download
    if command -v curl &> /dev/null; then
        curl -fsSL "$download_url" -o "${APP_NAME}.download" || {
            echo "❌ Download failed. Trying alternative..."
            # Try to build from source if download fails
            echo "   You can build from source: cargo build --release"
            exit 1
        }
    elif command -v wget &> /dev/null; then
        wget -q "$download_url" -O "${APP_NAME}.download" || {
            echo "❌ Download failed."
            exit 1
        }
    else
        echo "❌ Neither curl nor wget found. Please install one of them."
        exit 1
    fi
    
    echo "✅ Download complete"
    
    # Extract if it's a tarball
    if [[ "$download_url" == *.tar.gz ]]; then
        tar -xzf "${APP_NAME}.download"
        binary_path="./${APP_NAME}"
    else
        binary_path="./${APP_NAME}.download"
    fi
    
    # Install binary
    echo ""
    echo "📦 Installing to $INSTALL_DIR..."
    
    if [ -f "$binary_path" ]; then
        chmod +x "$binary_path"
        mv "$binary_path" "$INSTALL_DIR/${APP_NAME}"
    else
        echo "❌ Binary not found in archive"
        exit 1
    fi
    
    # Cleanup
    cd -
    rm -rf "$TEMP_DIR"
    
    echo "✅ OpenEgo installed to $INSTALL_DIR/${APP_NAME}"
}

# Create desktop entry (Linux)
create_desktop_entry() {
    if [ "$OS" != "Linux" ]; then
        return
    fi
    
    echo ""
    echo "🖥️  Creating desktop shortcut..."
    
    DESKTOP_DIR="$HOME/.local/share/applications"
    mkdir -p "$DESKTOP_DIR"
    
    cat > "$DESKTOP_DIR/${APP_NAME}.desktop" << EOF
[Desktop Entry]
Name=OpenEgo
Comment=Your Personal Digital Twin - Local-first AI
Exec=$INSTALL_DIR/${APP_NAME}
Type=Application
Terminal=false
Categories=Utility;Productivity;
Keywords=AI;Assistant;Email;Productivity;
StartupNotify=true
EOF
    
    # Update desktop database
    if command -v update-desktop-database &> /dev/null; then
        update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
    fi
    
    echo "✅ Desktop entry created"
}

# Add to PATH if needed
add_to_path() {
    if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
        echo ""
        echo "⚠️  $INSTALL_DIR is not in your PATH"
        echo ""
        echo "   Add the following to your shell profile (~/.bashrc, ~/.zshrc, etc.):"
        echo "   export PATH=\"\$PATH:$INSTALL_DIR\""
        echo ""
        
        # Try to add automatically
        SHELL_CONFIG=""
        if [ -n "$BASH_VERSION" ]; then
            SHELL_CONFIG="$HOME/.bashrc"
        elif [ -n "$ZSH_VERSION" ]; then
            SHELL_CONFIG="$HOME/.zshrc"
        fi
        
        if [ -n "$SHELL_CONFIG" ] && [ -f "$SHELL_CONFIG" ]; then
            if ! grep -q "$INSTALL_DIR" "$SHELL_CONFIG"; then
                echo "export PATH=\"\$PATH:$INSTALL_DIR\"" >> "$SHELL_CONFIG"
                echo "✅ Added to $SHELL_CONFIG"
                echo "   Run 'source $SHELL_CONFIG' to update your current session"
            fi
        fi
    fi
}

# macOS specific setup
macos_setup() {
    if [ "$OS" != "Mac" ]; then
        return
    fi
    
    echo ""
    echo "🍎 macOS Setup"
    echo "   If macOS blocks the app, run:"
    echo "   xattr -cr $INSTALL_DIR/${APP_NAME}"
    echo ""
    echo "   Or go to System Preferences > Security & Privacy > General"
    echo "   and click 'Open Anyway'"
}

# Main installation
main() {
    detect_os
    detect_arch
    set_install_dir
    download_binary
    create_desktop_entry
    add_to_path
    macos_setup
    
    echo ""
    echo "🎉 OpenEgo v${VERSION} installation complete!"
    echo ""
    echo "   Run: ${APP_NAME}"
    echo "   Or look for 'OpenEgo' in your applications menu"
    echo ""
    echo "   First time? Run: ${APP_NAME} --help"
    echo ""
    echo "   🧠 Welcome to your Personal Digital Twin!"
    echo ""
}

# Run main function
main
