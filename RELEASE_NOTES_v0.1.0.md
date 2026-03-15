# OpenEgo v0.1.0 Release Notes

🎉 **OpenEgo v0.1.0 is now available!**

## What's New

### Core Features
- ✅ **5-Step Onboarding** - Account creation, permissions, AI model selection, learning, testing
- ✅ **Permission System** - Toggle switches for Gmail, Outlook, Telegram, Slack, Documents, Calendar
- ✅ **Auto-Pilot Mode** - 24-hour AI automation with full activity tracking
- ✅ **Local-First** - All data stays on your device, no cloud dependency

### Security & Audit
- 🔒 **Bot Fingerprinting** - Email headers and invisible watermarks prove AI origin
- 🔒 **Activity Logging** - Every bot action tracked with timestamps and signatures
- 🔒 **Dispute Resolution** - Generate certificates proving bot-generated content
- 🔒 **Auto-Pilot Sessions** - Track all actions during 24-hour automation periods

### Auto-Updater
- 🔄 **In-App Updates** - Get notified of new versions automatically
- 🔄 **One-Click Install** - Download and install without leaving the app
- 🔄 **Multi-Platform** - Linux, macOS (Intel & Apple Silicon), Windows

## Installation

### macOS (Apple Silicon)
```bash
curl -fsSL https://openego.ai/install.sh | bash
```

### Linux
```bash
curl -fsSL https://openego.ai/install.sh | bash
```

### Windows
Download from: https://github.com/carlv991/openego/releases/download/v0.1.0/openego-windows-x86_64.zip

## System Requirements

| Platform | Minimum | Recommended |
|----------|---------|-------------|
| macOS | 12.0+ (Monterey) | 14.0+ (Sonoma) |
| Linux | Ubuntu 20.04+ | Ubuntu 22.04+ |
| Windows | Windows 10 | Windows 11 |
| RAM | 8 GB | 16 GB |
| Storage | 2 GB | 10 GB (with AI models) |

## Quick Start

1. **Install** using the one-liner above
2. **Launch** OpenEgo from Applications menu
3. **Create Account** - Enter your name
4. **Set Permissions** - Toggle which platforms the bot can access
5. **Choose AI Model** - Llama 3 (recommended), Mistral, or Phi-3
6. **Start Learning** - Bot analyzes your communication style
7. **Test & Activate** - Review bot responses before going live

## Configuration

### Settings Menu
- **Permissions** - Enable/disable platform access
- **AI Model** - Switch between local LLMs
- **Auto-Pilot** - Configure 24-hour automation rules
- **Privacy** - Activity log retention, audit settings
- **Updates** - Check for updates, auto-update preferences

### Auto-Pilot Rules
```json
{
  "allowed_platforms": ["gmail", "telegram"],
  "max_confidence": 0.9,
  "require_approval_above": 0.7,
  "blocked_recipients": ["boss@company.com"],
  "working_hours_only": true
}
```

## Privacy & Security

### Data Storage
- ✅ All data stored locally in SQLite database
- ✅ No cloud servers, no data leakage
- ✅ Optional encryption at rest
- ✅ User controls all permissions

### Audit Trail
Every bot action is logged with:
- Timestamp and platform
- Content hash (SHA256)
- Bot cryptographic signature
- Confidence score
- Auto-pilot session ID

### Bot Fingerprinting
All bot communications include:
- **Email Headers**: `X-OpenEgo-*` headers with HMAC signature
- **Invisible Watermark**: Zero-width characters in text
- **Certificate Generation**: Provable evidence of AI origin

## Troubleshooting

### Build from Source
```bash
git clone https://github.com/carlv991/openego.git
cd openego/src-tauri
cargo build --release
```

### Common Issues

**macOS: "App is damaged"**
```bash
xattr -cr /Applications/OpenEgo.app
```

**Linux: "Permission denied"**
```bash
chmod +x ~/.local/bin/openego
```

**Windows: SmartScreen warning**
Click "More info" → "Run anyway"

### Logs Location
- **macOS**: `~/Library/Application Support/com.openego.dev/logs`
- **Linux**: `~/.local/share/openego/logs`
- **Windows**: `%APPDATA%\com.openego.dev\logs`

## Support

- 📚 **Documentation**: https://docs.openego.ai
- 💬 **Discord**: https://discord.gg/openego
- 🐛 **Issues**: https://github.com/carlv991/openego/issues
- 📧 **Email**: hello@openego.ai

## License

AGPL-3.0 - See [LICENSE](LICENSE) for details.

## Disclaimer

This is experimental software. Use at your own risk. The developers are not responsible for any damages, losses, or harms resulting from the use of this software.

---

Built with ❤️ for privacy-conscious users.
