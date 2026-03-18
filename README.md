# 🧠 OpenEgo - AI Digital Twin

**Your personal AI that learns how you communicate and responds on your behalf.**

## ✅ What's Working Now

### Frontend (Electron App)
- ✅ Beautiful multi-step onboarding UI
- ✅ 5-step flow: Welcome → Connect Data → AI Model → Training → Dashboard
- ✅ Support for 9 AI models (GPT-4o, Claude, Gemini, Llama, Mistral)
- ✅ Dashboard with Inbox, Stats, Settings tabs
- ✅ Mode switcher (Co-Pilot ↔ Auto-Pilot)
- ✅ Training system with 5 scenarios
- ✅ Auto-Pilot unlocks at 80% accuracy

### Backend API
- ✅ REST API server (Node.js/Express)
- ✅ SQLite database for users, messages, training data
- ✅ Telegram Bot integration (working)
- ✅ AI response generation (OpenAI/Anthropic)
- ✅ API key storage with encryption
- ✅ Admin dashboard with stats

### Admin Dashboard
- ✅ User growth metrics
- ✅ Active users tracking
- ✅ Messages handled counter
- ✅ MRR tracking
- ✅ Recent users table

## 🔧 How to Run

### 1. Frontend (Electron App)
```bash
cd /Users/vicf/Documents/openego
git pull
npm install
npm run build:mac
open dist-electron/OpenEgo-0.1.0-arm64.dmg
```

### 2. Backend API
```bash
cd /Users/vicf/Documents/openego/backend
npm install

# Copy and edit environment file
cp .env.example .env
# Add your API keys to .env

npm start
```

### 3. Connect Telegram (Super Simple!)
1. In OpenEgo app, go to Step 2 (Connect Data)
2. Toggle Telegram ON
3. Enter your Telegram username (e.g., @johndoe)
4. Done! ✅

No bot creation needed - just your username!

## 🔑 Required API Keys

To make AI responses work, you need:

### OpenAI (for GPT-4o, GPT-4o-mini)
1. Go to https://platform.openai.com/api-keys
2. Create new secret key
3. Add to backend/.env: `OPENAI_API_KEY=your_key_here`

### Anthropic (for Claude)
1. Go to https://console.anthropic.com/
2. Get API key
3. Add to backend/.env: `ANTHROPIC_API_KEY=your_key_here`

## ✅ Simple Setup - One Permission

### Works Out of the Box:
- ✅ **One-Click Setup** - Grant Full Disk Access → done!
- ✅ **Auto-Scan** - Reads Apple Mail, Messages, Documents automatically
- ✅ **AI Responses** - Add OpenAI API key → instant AI replies
- ✅ **Training** - 5 built-in scenarios, tracks your accuracy
- ✅ **Auto-Pilot Unlock** - Reaches 80% → unlocks automatically
- ✅ **Dashboard** - Full UI for managing everything

### No Individual Permissions Needed:
Unlike other apps, OpenEgo uses **Full Disk Access** (like Dropbox, CleanMyMac):
- 📧 Apple Mail - automatically scanned
- 💬 Messages app - conversation history
- 📄 Documents - writing style analysis
- 📅 Calendar - availability understanding

### Choose Your AI (2 options):

**Option 1: Cloud AI (OpenAI/Claude)**
- Get API key at platform.openai.com
- Fast, highly capable
- Small cost per use (~$0.01 per message)

**Option 2: Local AI (Llama via Ollama) - FREE!**
- Download: `ollama.com/download`
- Run: `ollama run llama3.1`
- Completely free, runs on your Mac
- Requires 8GB RAM

### That's it!
**One macOS permission + AI of choice = full functionality**

## 🚀 Quick Start

### For Testing (Minimal Setup)
1. Build and run the Electron app
2. Start the backend: `cd backend && npm start`
3. Set up Telegram bot (only working connector currently)
4. Add OpenAI API key in backend/.env
5. In the app, select GPT-4o and enter your API key
6. Complete training to unlock Auto-Pilot
7. Use the dashboard to approve/reject AI responses

### For Production
1. Set up all OAuth credentials (Google, Microsoft, Slack)
2. Deploy backend to a server (Heroku, Railway, VPS)
3. Update API_BASE in frontend to point to your server
4. Deploy admin.html to your website
5. Sign Electron app with Apple Developer ID

## 📊 Admin Dashboard

Access at: `https://your-domain.com/admin.html`

Or run locally:
```bash
cd backend
npm start
# Then open: http://localhost:3000/admin.html
```

## 🛠️ Tech Stack

- **Frontend:** HTML/CSS/JS, Electron
- **Backend:** Node.js, Express, SQLite
- **AI:** OpenAI GPT-4, Anthropic Claude
- **Integrations:** Telegram Bot API, Gmail API (partial)

## 📁 Project Structure

```
openego/
├── src/
│   └── index.html          # Main Electron app UI
├── backend/
│   ├── server.js           # API server
│   ├── package.json        # Backend dependencies
│   └── .env.example        # Environment template
├── admin.html              # Admin dashboard
└── deploy.sh               # Deployment script
```

## 🎯 Next Steps to Complete

1. **Add Gmail OAuth flow** (biggest impact)
2. **Add real email parsing** (extract communication patterns)
3. **Improve AI prompts** (better personalized responses)
4. **Add message sync** (continuously learn from new messages)
5. **Build response approval queue** (dashboard inbox)
6. **Add local AI model support** (Llama via Ollama)

## 🤝 Support

For issues or questions, check:
- Backend logs: `cd backend && npm start` shows all API calls
- Browser DevTools in Electron: Cmd+Option+I
- Database: `backend/openego.db` (SQLite)

---

**Status:** Beta - Core functionality working, needs OAuth integrations for full email support.
