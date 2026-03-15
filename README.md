# OpenEgo 🧠

Your Personal Digital Twin - Local-first AI that learns how you communicate.

## Overview

OpenEgo creates a local, privacy-first digital twin that learns your communication style across email, messaging, and documents. It can suggest or automate responses when you're busy - all while keeping your data strictly on your device.

## Features

### 🔒 Privacy-First
- **100% Local**: All data stays on your device
- **No Cloud**: No servers, no data leakage
- **Encrypted**: Your data is encrypted at rest

### 🧠 Smart Learning
- **Historical Analysis**: Scans years of emails, messages, and documents
- **Pattern Recognition**: Learns your writing style, timing, and preferences
- **Continuous Improvement**: Gets better as you use it

### 🎮 Three Modes
1. **Off**: Completely dormant
2. **Co-Pilot**: Observes and suggests (you approve everything)
3. **Auto-Pilot**: Handles routine responses automatically

### 📱 Cross-Platform
- **Desktop**: macOS, Windows, Linux
- **Mobile**: iOS, Android (companion app)
- **Sync**: P2P sync between your devices

## Onboarding Flow

The app features a modern 5-step onboarding:

1. **👋 Welcome**: Create your account
2. **🔐 Permissions**: Select data sources (email, messaging, documents)
3. **🧠 AI Model**: Choose your local LLM (Llama 3, Mistral, or Phi-3)
4. **📚 Learning**: Background processing of your data
5. **🧪 Testing**: Validate AI responses before going live

## Tech Stack

- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Desktop Framework**: Tauri (Rust + Web)
- **Local LLM**: Llama.cpp, Mistral, or Phi-3
- **Database**: SQLite + ChromaDB (vector embeddings)
- **Sync**: libp2p (P2P protocol)

## Project Structure

```
openego/
├── src/                    # Frontend code
│   ├── index.html         # Main onboarding UI
│   ├── styles.css         # Modern dark theme styles
│   └── main.js            # Onboarding logic
├── src-tauri/             # Rust backend
│   ├── src/               # Rust source code
│   ├── Cargo.toml         # Rust dependencies
│   └── tauri.conf.json    # App configuration
├── database/              # Database schemas
├── docs/                  # Documentation
└── README.md             # This file
```

## Development

### Prerequisites
- Rust (latest stable)
- Node.js 18+
- Tauri CLI

### Install Dependencies
```bash
npm install
cd src-tauri && cargo build
```

### Run Development Server
```bash
npm run tauri dev
```

### Build for Production
```bash
npm run tauri build
```

## Roadmap

### Phase 1: Foundation (Weeks 1-4)
- [x] Project setup & scaffolding
- [x] Onboarding UI
- [x] To-Do system with priority levels
- [ ] Gmail API integration
- [x] Local SQLite database
- [ ] Basic data ingestion

### Phase 2: Intelligence (Weeks 5-8)
- [ ] Email pattern detection
- [ ] Local LLM integration
- [ ] Vector embeddings (ChromaDB)
- [ ] Confidence scoring
- [ ] Response generation

### Phase 3: Automation (Weeks 9-12)
- [ ] Auto-pilot mode
- [ ] Multi-platform support
- [ ] Mobile app
- [ ] P2P sync

### Phase 4: Polish (Weeks 13-16)
- [ ] Security audit
- [ ] Performance optimization
- [ ] Documentation
- [ ] Public release

## License

AGPL-3.0

## Disclaimer

This is experimental software. Use at your own risk. The developers are not responsible for any damages, losses, or harms resulting from the use of this software.

---

Built with ❤️ for privacy-conscious users.
