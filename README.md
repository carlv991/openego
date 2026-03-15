# OpenEgo 🧠

Your Personal Digital Twin - Local-first AI that learns how you communicate.

[![Version](https://img.shields.io/badge/version-0.1.0-coral)](https://github.com/carlv991/openego/releases)
[![License](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey)]()

## 🌐 Website
https://openego.ai

## 📦 Installation

### One-Liner Install (macOS & Linux)
```bash
curl -fsSL https://openego.ai/install.sh | bash
```

### Windows
Download from [GitHub Releases](https://github.com/carlv991/openego/releases)

## ✨ Features

### 🔒 Privacy-First
- **100% Local**: All data stays on your device
- **No Cloud**: No servers, no data leakage
- **Encrypted**: Your data is encrypted at rest
- **Open Source**: Full transparency, AGPL-3.0 license

### 🧠 Smart Learning
- **Historical Analysis**: Scans emails, messages, documents
- **Pattern Recognition**: Learns your writing style
- **Continuous Improvement**: Gets better as you use it

### 🎮 Three Modes
1. **Off**: Completely dormant
2. **Co-Pilot**: Observes and suggests
3. **Auto-Pilot**: Handles routine responses (with full audit trail)

### 🔄 Auto-Updater
- **In-App Updates**: Get notified of new versions
- **One-Click Install**: Seamless updates
- **Multi-Platform**: Linux, macOS, Windows

### 🕵️ Audit Trail & Bot Fingerprinting
- **Activity Logging**: Every bot action tracked
- **Bot Certificates**: Prove content was AI-generated
- **Email Headers**: `X-OpenEgo-*` headers for verification
- **Invisible Watermarks**: Hidden markers in text

## 🚀 Quick Start

1. **Install**: `curl -fsSL https://openego.ai/install.sh | bash`
2. **Launch**: OpenEgo from Applications menu
3. **Onboard**: 5-step setup process
4. **Activate**: Start with Co-Pilot mode
5. **Go Auto**: Enable Auto-Pilot when confident

## 📸 Screenshots

### Onboarding
Modern 5-step onboarding with toggle switches for permissions

### Activity Log
Track every bot action with timestamps and signatures

### Settings
Easy-to-navigate settings with real-time toggle feedback

## 🛠️ Tech Stack

- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Desktop**: Tauri (Rust + Web)
- **Database**: SQLite
- **Local LLM**: Llama 3, Mistral, or Phi-3
- **CI/CD**: GitHub Actions

## 📁 Project Structure

```
openego/
├── src/                    # Frontend code
│   ├── index.html         # Onboarding UI
│   ├── styles.css         # Coral theme styles
│   ├── main.js            # App logic
│   └── updater.js         # Auto-updater
├── src-tauri/             # Rust backend
│   ├── src/
│   │   ├── commands/      # API handlers
│   │   ├── database/      # SQLite layer
│   │   ├── bot_tracking.rs # Audit/fingerprinting
│   │   └── updater.rs     # Update system
│   └── Cargo.toml
├── .github/workflows/      # CI/CD
├── docs/                   # Documentation
└── README.md
```

## 🏗️ Development

### Prerequisites
- Rust (latest stable)
- Node.js 18+
- Tauri CLI

### Setup
```bash
git clone https://github.com/carlv991/openego.git
cd openego
npm install
npm run tauri dev
```

### Build
```bash
npm run tauri build
```

## 📊 Roadmap Status

### Phase 1: Foundation ✅ COMPLETE
- [x] Project setup & scaffolding
- [x] Onboarding UI with 5 steps
- [x] To-Do system with priority levels
- [x] Toggle switch permissions
- [x] Local SQLite database
- [x] Activity logging
- [x] Bot fingerprinting
- [x] Auto-updater

### Phase 2: Intelligence 🔄 IN PROGRESS
- [ ] Gmail OAuth integration
- [ ] Local LLM integration
- [ ] Vector embeddings
- [ ] Confidence scoring
- [ ] Response generation

### Phase 3: Automation 📋 PLANNED
- [ ] Full Auto-Pilot mode
- [ ] Multi-platform support
- [ ] Mobile companion app
- [ ] P2P sync

### Phase 4: Polish 📋 PLANNED
- [ ] Security audit
- [ ] Performance optimization
- [ ] Documentation
- [ ] v1.0 Release

## 🔐 Security & Privacy

### Bot Fingerprinting
All bot-generated content includes:
- **Email Headers**: Cryptographically signed `X-OpenEgo-*` headers
- **Invisible Watermarks**: Zero-width character encoding
- **Activity Certificates**: Provable evidence of AI origin

### Data Storage
- ✅ Local SQLite database only
- ✅ Optional encryption at rest
- ✅ User controls all permissions
- ✅ Configurable retention policies

## 🐛 Troubleshooting

### macOS: "App is damaged"
```bash
xattr -cr /Applications/OpenEgo.app
```

### Linux: Permission denied
```bash
chmod +x ~/.local/bin/openego
```

### Windows: SmartScreen
Click "More info" → "Run anyway"

## 📞 Support

- 📚 **Docs**: https://docs.openego.ai
- 💬 **Discord**: https://discord.gg/openego
- 🐛 **Issues**: [GitHub Issues](https://github.com/carlv991/openego/issues)
- 📧 **Email**: hello@openego.ai

## 📜 License

AGPL-3.0 - See [LICENSE](LICENSE) for details.

## ⚠️ Disclaimer

This is experimental software. Use at your own risk. The developers are not responsible for any damages, losses, or harms resulting from the use of this software.

---

Built with ❤️ for privacy-conscious users.

**Color Scheme**: Coral (#DE6D51) | Cream (#EEEBE3) | Charcoal (#141414)
