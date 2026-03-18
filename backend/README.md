# OpenEgo Backend API

## Setup

1. Install dependencies:
```bash
cd backend
npm install
```

2. Copy environment file:
```bash
cp .env.example .env
# Edit .env with your API keys
```

3. Start server:
```bash
npm start
# or for development:
npm run dev
```

## API Endpoints

### Auth
- `POST /api/auth/user` - Register/login user

### Accounts
- `GET /api/accounts/:userId` - List connected accounts
- `POST /api/connect/telegram` - Connect Telegram bot
- `POST /api/connect/gmail` - Connect Gmail (requires OAuth)

### AI Models
- `GET /api/ai-model/:userId` - Get AI model preference
- `POST /api/ai-model` - Save AI model & API key
- `POST /api/generate-response` - Generate AI response

### Data
- `POST /api/sync/gmail` - Sync Gmail messages
- `GET /api/messages/:userId` - Get messages for training

### Training
- `POST /api/training` - Save training response
- `GET /api/training/accuracy/:userId` - Get training accuracy

### Admin
- `GET /api/admin/stats` - Get admin dashboard stats
- `GET /api/admin/users` - List all users

## Environment Variables

Required:
- `PORT` - Server port (default: 3000)
- `JWT_SECRET` - Secret for JWT tokens

Optional (for full functionality):
- `GOOGLE_CLIENT_ID` & `GOOGLE_CLIENT_SECRET` - For Gmail OAuth
- `OPENAI_API_KEY` - For OpenAI integration
- `ANTHROPIC_API_KEY` - For Claude integration

## Database

SQLite database (`openego.db`) is created automatically with tables:
- `users` - User accounts
- `accounts` - Connected service accounts
- `messages` - Emails/messages for training
- `training_data` - Training responses
- `ai_models` - AI model preferences

## Deployment

### Local Development
```bash
npm run dev
```

### Production
```bash
npm start
```

Use PM2 for production:
```bash
npm install -g pm2
pm2 start server.js --name openego-api
```
