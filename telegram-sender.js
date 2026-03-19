const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Telegram Sender
 * Uses Telegram Bot API to send messages
 */

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
      
      const body = {
        chat_id: chatId,
        text: text,
        parse_mode: options.parseMode || 'HTML',
        disable_notification: options.silent || false
      };
      
      console.log('[Telegram] Sending message to:', chatId);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      
      const data = await response.json();
      
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
      const response = await fetch(url);
      const data = await response.json();
      
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
  
  async getChatInfo(chatId) {
    if (!this.botToken) {
      return { success: false, error: 'Bot not configured' };
    }
    
    try {
      const url = `https://api.telegram.org/bot${this.botToken}/getChat?chat_id=${chatId}`;
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.ok) {
        return {
          success: true,
          chat: data.result
        };
      } else {
        throw new Error(data.description);
      }
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
  
  async replyToMessage(chatId, messageId, text) {
    // Reply to a specific message
    if (!this.botToken) {
      return { success: false, error: 'Bot not configured' };
    }
    
    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
      
      const body = {
        chat_id: chatId,
        text: text,
        reply_to_message_id: messageId,
        parse_mode: 'HTML'
      };
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      const data = await response.json();
      
      if (data.ok) {
        return {
          success: true,
          messageId: data.result.message_id
        };
      } else {
        throw new Error(data.description);
      }
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
}

// Setup IPC handlers
function setupTelegramSenderHandlers() {
  const sender = new TelegramSender();
  
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
