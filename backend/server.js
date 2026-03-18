const express = require('express');
const cors = require('cors');
require('dotenv').config();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../src')));

// Database setup (SQLite for simplicity)
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./openego.db');

// Initialize database
db.serialize(() => {
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    settings TEXT
  )`);

  // Connected accounts
  db.run(`CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    provider TEXT,
    account_email TEXT,
    access_token TEXT,
    refresh_token TEXT,
    connected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  // Messages/emails for training
  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    account_id TEXT,
    provider TEXT,
    from_address TEXT,
    subject TEXT,
    content TEXT,
    received_at DATETIME,
    processed BOOLEAN DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  // Training responses
  db.run(`CREATE TABLE IF NOT EXISTS training_data (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    scenario TEXT,
    user_response TEXT,
    approved BOOLEAN,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  // AI model preferences
  db.run(`CREATE TABLE IF NOT EXISTS ai_models (
    user_id TEXT PRIMARY KEY,
    provider TEXT,
    model TEXT,
    api_key_encrypted TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);
});

// ============ AUTH ROUTES ============

// Register/login user
app.post('/api/auth/user', (req, res) => {
  const { id, email, name } = req.body;
  
  db.get('SELECT * FROM users WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    
    if (row) {
      // User exists, return user data
      res.json({ user: row, exists: true });
    } else {
      // Create new user
      db.run('INSERT INTO users (id, email, name) VALUES (?, ?, ?)', 
        [id, email, name], 
        function(err) {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ user: { id, email, name }, exists: false });
        }
      );
    }
  });
});

// ============ ACCOUNT CONNECTION ROUTES ============

// Get connected accounts
app.get('/api/accounts/:userId', (req, res) => {
  const { userId } = req.params;
  db.all('SELECT id, provider, account_email, connected_at FROM accounts WHERE user_id = ?', 
    [userId], 
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ accounts: rows });
    }
  );
});

// Connect Gmail account
app.post('/api/connect/gmail', async (req, res) => {
  const { userId, code } = req.body;
  
  // TODO: Exchange code for tokens using Google OAuth
  // This requires setting up Google OAuth credentials
  
  res.json({ 
    success: true, 
    message: 'Gmail connection initiated',
    note: 'Full OAuth implementation requires Google API credentials'
  });
});

// Connect Telegram
app.post('/api/connect/telegram', (req, res) => {
  const { userId, botToken } = req.body;
  
  // Store bot token and initialize bot
  const accountId = require('uuid').v4();
  
  db.run('INSERT INTO accounts (id, user_id, provider, access_token) VALUES (?, ?, ?, ?)',
    [accountId, userId, 'telegram', botToken],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      
      // Initialize Telegram bot
      initTelegramBot(botToken, userId);
      
      res.json({ success: true, accountId });
    }
  );
});

// Initialize Telegram bot
function initTelegramBot(token, userId) {
  const TelegramBot = require('node-telegram-bot-api');
  const bot = new TelegramBot(token, { polling: true });
  
  bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const messageText = msg.text;
    const from = msg.from.username || msg.from.first_name;
    
    // Store message for training
    const msgId = require('uuid').v4();
    db.run('INSERT INTO messages (id, user_id, provider, from_address, content, received_at) VALUES (?, ?, ?, ?, ?, ?)',
      [msgId, userId, 'telegram', from, messageText, new Date().toISOString()]
    );
    
    // Simple auto-response for now
    bot.sendMessage(chatId, '👋 Message received! OpenEgo is learning from your conversations.');
  });
}

// ============ AI MODEL ROUTES ============

// Save AI model preference
app.post('/api/ai-model', (req, res) => {
  const { userId, provider, model, apiKey } = req.body;
  
  // Encrypt API key (simple base64 for now, use proper encryption in production)
  const encryptedKey = Buffer.from(apiKey).toString('base64');
  
  db.run(`INSERT OR REPLACE INTO ai_models (user_id, provider, model, api_key_encrypted) VALUES (?, ?, ?, ?)`,
    [userId, provider, model, encryptedKey],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

// Get AI model preference
app.get('/api/ai-model/:userId', (req, res) => {
  const { userId } = req.params;
  
  db.get('SELECT provider, model FROM ai_models WHERE user_id = ?', [userId], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ model: row || { provider: 'openai', model: 'gpt-4o' } });
  });
});

// Generate AI response
app.post('/api/generate-response', async (req, res) => {
  const { userId, message, context } = req.body;
  
  // Get user's AI model preference
  db.get('SELECT provider, model, api_key_encrypted FROM ai_models WHERE user_id = ?', 
    [userId], 
    async (err, row) => {
      if (err || !row) {
        return res.json({ 
          response: "I'm still learning your style. This is a placeholder response.",
          note: 'Add your API key in settings to enable AI responses'
        });
      }
      
      const apiKey = Buffer.from(row.api_key_encrypted, 'base64').toString();
      
      try {
        let response;
        
        if (row.provider === 'openai') {
          const OpenAI = require('openai');
          const openai = new OpenAI({ apiKey });
          
          const completion = await openai.chat.completions.create({
            model: row.model,
            messages: [
              { role: 'system', content: 'You are a helpful assistant drafting responses.' },
              { role: 'user', content: `Draft a response to: ${message}` }
            ]
          });
          
          response = completion.choices[0].message.content;
        } else if (row.provider === 'anthropic') {
          const Anthropic = require('@anthropic-ai/sdk');
          const anthropic = new Anthropic({ apiKey });
          
          const completion = await anthropic.messages.create({
            model: row.model,
            max_tokens: 1024,
            messages: [{ role: 'user', content: `Draft a response to: ${message}` }]
          });
          
          response = completion.content[0].text;
        }
        
        res.json({ response });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    }
  );
});

// ============ DATA SYNC ROUTES ============

// Sync emails from Gmail
app.post('/api/sync/gmail', async (req, res) => {
  const { userId } = req.body;
  
  // TODO: Implement Gmail API sync
  // This requires OAuth flow and Gmail API access
  
  res.json({ 
    success: true, 
    message: 'Gmail sync initiated',
    synced: 0,
    note: 'Full implementation requires Google API credentials'
  });
});

// Get messages for training
app.get('/api/messages/:userId', (req, res) => {
  const { userId } = req.params;
  const limit = req.query.limit || 100;
  
  db.all('SELECT * FROM messages WHERE user_id = ? ORDER BY received_at DESC LIMIT ?',
    [userId, limit],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ messages: rows });
    }
  );
});

// ============ TRAINING ROUTES ============

// Save training response
app.post('/api/training', (req, res) => {
  const { userId, scenario, userResponse, approved } = req.body;
  const id = require('uuid').v4();
  
  db.run('INSERT INTO training_data (id, user_id, scenario, user_response, approved) VALUES (?, ?, ?, ?, ?)',
    [id, userId, scenario, userResponse, approved],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, id });
    }
  );
});

// Get training accuracy
app.get('/api/training/accuracy/:userId', (req, res) => {
  const { userId } = req.params;
  
  db.all('SELECT approved FROM training_data WHERE user_id = ?', [userId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    
    if (rows.length === 0) {
      return res.json({ accuracy: 0, total: 0 });
    }
    
    const approved = rows.filter(r => r.approved).length;
    const accuracy = Math.round((approved / rows.length) * 100);
    
    res.json({ accuracy, total: rows.length, approved });
  });
});

// ============ ADMIN ROUTES ============

// Get admin stats
app.get('/api/admin/stats', (req, res) => {
  const stats = {
    totalUsers: 0,
    activeToday: 0,
    totalMessages: 0,
    mrr: 0
  };
  
  db.get('SELECT COUNT(*) as count FROM users', [], (err, row) => {
    if (row) stats.totalUsers = row.count;
    
    db.get('SELECT COUNT(*) as count FROM messages WHERE received_at > date("now")', [], (err, row) => {
      if (row) stats.activeToday = Math.floor(row.count / 10); // Estimate
      
      db.get('SELECT COUNT(*) as count FROM messages', [], (err, row) => {
        if (row) stats.totalMessages = row.count;
        
        res.json(stats);
      });
    });
  });
});

// Get all users for admin
app.get('/api/admin/users', (req, res) => {
  db.all(`
    SELECT u.id, u.email, u.name, u.created_at,
      (SELECT COUNT(*) FROM messages WHERE user_id = u.id) as message_count,
      (SELECT COUNT(*) FROM accounts WHERE user_id = u.id) as account_count
    FROM users u
    ORDER BY u.created_at DESC
  `, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ users: rows });
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 OpenEgo API server running on port ${PORT}`);
  console.log(`📊 Admin dashboard: http://localhost:${PORT}/admin.html`);
});

module.exports = app;
