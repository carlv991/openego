const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

/**
 * Telegram Sender
 * Uses Telegram Bot API to send messages
 * Compatible with Node.js (no external fetch dependency)
 */

// Simple HTTPS request helper (Node.js native)
function httpsRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : require('http');
    const req = client.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

class TelegramSender {
  constructor() {
    this.botToken = null;
    this.loadToken();
  }

  loadToken() {
    try {
      // Load from file (main process)
      const tokenPath = path.join(os.homedir(), '.openego_telegram_token');
      if (fs.existsSync(tokenPath)) {
        this.botToken = fs.readFileSync(tokenPath, 'utf8').trim();
      }
    } catch (e) {
      console.log('[Telegram] No token found');
    }
  }

  async sendMessage(chatId, text, options = {}) {
    if (!this.botToken) {
      return {
        success: false,
        error: 'Telegram bot not configured. Please set up in Settings.'
      };
    }

    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;

      const body = JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: options.parseMode || 'HTML',
        disable_notification: options.silent || false
      });

      console.log('[Telegram] Sending message to:', chatId);

      const response = await httpsRequest(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        },
        body: body
      });

      const data = JSON.parse(response.body);

      if (data.ok) {
        console.log('[Telegram] Message sent successfully');
        return {
          success: true,
          messageId: data.result.message_id,
          chatId: data.result.chat.id,
          timestamp: new Date().toISOString()
        };
      } else {
        throw new Error(data.description || 'Unknown error');
      }

    } catch (e) {
      console.error('[Telegram] Error sending message:', e);
      return {
        success: false,
        error: e.message,
        suggestion: 'Check your bot token and ensure the bot is added to the chat.'
      };
    }
  }

  async getUpdates(limit = 10) {
    if (!this.botToken) {
      return { success: false, error: 'Bot not configured' };
    }

    try {
      const url = `https://api.telegram.org/bot${this.botToken}/getUpdates?limit=${limit}`;
      const response = await httpsRequest(url, { method: 'GET' });
      const data = JSON.parse(response.body);

      if (data.ok) {
        return {
          success: true,
          updates: data.result
        };
      } else {
        throw new Error(data.description);
      }
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async replyToMessage(chatId, messageId, text) {
    if (!this.botToken) {
      return {
        success: false,
        error: 'Telegram bot not configured'
      };
    }

    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;

      const body = JSON.stringify({
        chat_id: chatId,
        text: text,
        reply_to_message_id: messageId,
        parse_mode: 'HTML'
      });

      const response = await httpsRequest(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        },
        body: body
      });

      const data = JSON.parse(response.body);

      if (data.ok) {
        return {
          success: true,
          messageId: data.result.message_id
        };
      } else {
        throw new Error(data.description);
      }
    } catch (e) {
      return {
        success: false,
        error: e.message
      };
    }
  }
}

// Setup IPC handlers
function setupTelegramSenderHandlers() {
  const sender = new TelegramSender();

  // Save Telegram token from renderer to file
  ipcMain.handle('save-telegram-token', async (event, token) => {
    try {
      const tokenPath = path.join(os.homedir(), '.openego_telegram_token');
      fs.writeFileSync(tokenPath, token);
      sender.botToken = token; // Update in-memory token
      console.log('[Telegram] Token saved to file');
      return { success: true };
    } catch (e) {
      console.error('[Telegram] Error saving token:', e);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('send-telegram-message', async (event, chatId, text, options = {}) => {
    console.log('[Telegram] Send request:', { chatId, text: text.substring(0, 50) + '...' });
    return sender.sendMessage(chatId, text, options);
  });

  ipcMain.handle('reply-telegram-message', async (event, chatId, messageId, text) => {
    return sender.replyToMessage(chatId, messageId, text);
  });

  ipcMain.handle('get-telegram-updates', async () => {
    return sender.getUpdates();
  });

  ipcMain.handle('test-telegram-connection', async () => {
    const updates = await sender.getUpdates(1);
    if (updates.success) {
      return { success: true, message: 'Telegram bot is connected' };
    } else {
      return { success: false, error: updates.error };
    }
  });
}

module.exports = { setupTelegramSenderHandlers, TelegramSender };
