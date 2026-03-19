const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Message Monitor - Background service for detecting new messages
 * Scans Mail, Telegram Desktop, and other sources for new messages
 */

class MessageMonitor {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.isRunning = false;
    this.lastCheckTime = new Date();
    this.knownEmails = new Set();
    this.knownTelegram = new Set();
    this.checkInterval = null;
    
    // Load previously seen messages
    this.loadKnownMessages();
  }
  
  loadKnownMessages() {
    try {
      const knownPath = path.join(os.homedir(), '.openego_known_messages.json');
      if (fs.existsSync(knownPath)) {
        const data = JSON.parse(fs.readFileSync(knownPath, 'utf8'));
        this.knownEmails = new Set(data.emails || []);
        this.knownTelegram = new Set(data.telegram || []);
        console.log(`[Monitor] Loaded ${this.knownEmails.size} known emails, ${this.knownTelegram.size} known Telegram messages`);
      }
    } catch (e) {
      console.log('[Monitor] No known messages file yet');
    }
  }
  
  saveKnownMessages() {
    try {
      const knownPath = path.join(os.homedir(), '.openego_known_messages.json');
      fs.writeFileSync(knownPath, JSON.stringify({
        emails: Array.from(this.knownEmails),
        telegram: Array.from(this.knownTelegram),
        lastUpdated: new Date().toISOString()
      }));
    } catch (e) {
      console.error('[Monitor] Error saving known messages:', e);
    }
  }
  
  start() {
    if (this.isRunning) return;
    
    console.log('[Monitor] Starting message monitor...');
    this.isRunning = true;
    
    // Check immediately
    this.checkForNewMessages();
    
    // Check every 30 seconds
    this.checkInterval = setInterval(() => {
      this.checkForNewMessages();
    }, 30000);
    
    console.log('[Monitor] Message monitor active (checking every 30s)');
  }
  
  stop() {
    if (!this.isRunning) return;
    
    console.log('[Monitor] Stopping message monitor...');
    this.isRunning = false;
    
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
  
  async checkForNewMessages() {
    if (!this.isRunning) return;
    
    console.log('[Monitor] Checking for new messages...');
    
    try {
      // Check Mail
      const newEmails = await this.checkMail();
      
      // Check Telegram Desktop
      const newTelegram = await this.checkTelegram();
      
      // Notify renderer if new messages found
      if (newEmails.length > 0 || newTelegram.length > 0) {
        this.notifyNewMessages(newEmails, newTelegram);
      }
      
    } catch (e) {
      console.error('[Monitor] Error checking messages:', e);
    }
  }
  
  async checkMail() {
    const newEmails = [];
    const mailPath = path.join(os.homedir(), 'Library/Mail');
    
    try {
      if (!fs.existsSync(mailPath)) {
        return newEmails;
      }
      
      // Get all .emlx files modified in last hour
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      const emailFiles = [];
      
      this.collectRecentEmails(mailPath, emailFiles, oneHourAgo);
      
      console.log(`[Monitor] Found ${emailFiles.length} recent email files`);
      
      for (const filePath of emailFiles) {
        try {
          // Create unique ID from path + mtime
          const stats = fs.statSync(filePath);
          const msgId = `${filePath}:${stats.mtime.getTime()}`;
          
          if (this.knownEmails.has(msgId)) {
            continue; // Already seen
          }
          
          // Read and parse email
          const content = fs.readFileSync(filePath, 'utf8');
          const email = this.parseEmail(content);
          
          if (email && email.from && email.subject) {
            // Only include if it looks like an incoming email (not sent)
            if (!this.isSentEmail(content)) {
              newEmails.push({
                id: msgId,
                source: 'email',
                from: email.from,
                subject: email.subject,
                preview: email.preview || '',
                date: stats.mtime.toISOString(),
                fullContent: email.content
              });
              
              this.knownEmails.add(msgId);
            }
          }
        } catch (e) {
          // Skip problematic files
        }
      }
      
      console.log(`[Monitor] ${newEmails.length} new emails found`);
      
      // Save known messages periodically
      this.saveKnownMessages();
      
    } catch (e) {
      console.error('[Monitor] Error checking mail:', e);
    }
    
    return newEmails;
  }
  
  collectRecentEmails(dir, files, sinceTime) {
    try {
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          // Limit recursion depth
          if (files.length < 500) {
            this.collectRecentEmails(fullPath, files, sinceTime);
          }
        } else if (item.endsWith('.emlx') || item.endsWith('.eml')) {
          // Only include if modified recently
          if (stat.mtime.getTime() > sinceTime) {
            files.push(fullPath);
          }
          
          // Stop if we have too many
          if (files.length >= 500) break;
        }
      }
    } catch (e) {
      // Skip directories we can't access
    }
  }
  
  isSentEmail(content) {
    // Simple heuristic - sent emails often have different headers
    return content.includes('X-Mailer:') || content.includes('Message-Id: <') && content.includes('References:');
  }
  
  parseEmail(content) {
    try {
      const lines = content.split('\n');
      const email = {
        subject: '',
        from: '',
        content: '',
        preview: ''
      };
      
      let inContent = false;
      const contentLines = [];
      
      for (const line of lines) {
        if (line.startsWith('Subject:')) {
          email.subject = line.substring(8).trim();
        } else if (line.startsWith('From:')) {
          email.from = line.substring(5).trim();
          // Extract email from "Name <email@domain.com>" format
          const match = email.from.match(/<([^>]+)>/);
          if (match) email.from = match[1];
        } else if (line === '' && !inContent) {
          inContent = true;
        } else if (inContent) {
          contentLines.push(line);
        }
      }
      
      email.content = contentLines.join('\n').trim();
      email.preview = email.content.substring(0, 200).replace(/\n/g, ' ');
      
      return email;
    } catch (e) {
      return null;
    }
  }
  
  async checkTelegram() {
    const newMessages = [];
    
    // Check Telegram Desktop local storage
    const telegramPath = path.join(os.homedir(), 'Library/Application Support/Telegram Desktop/tdata');
    
    try {
      // Telegram stores data in encrypted format, but we can check for new notifications
      // For now, this is a placeholder for actual Telegram Desktop integration
      // Would need to use Telegram MTProto API or read from the desktop app's database
      
      // Check if user has connected Telegram bot
      const botToken = this.getTelegramBotToken();
      if (botToken) {
        // Use Telegram Bot API to check for messages
        const updates = await this.getTelegramUpdates(botToken);
        
        for (const update of updates) {
          const msgId = `telegram:${update.message_id}`;
          
          if (this.knownTelegram.has(msgId)) continue;
          
          newMessages.push({
            id: msgId,
            source: 'telegram',
            from: update.from || 'Unknown',
            subject: '',
            preview: update.text || '',
            date: new Date().toISOString(),
            fullContent: update.text
          });
          
          this.knownTelegram.add(msgId);
        }
      }
    } catch (e) {
      console.error('[Monitor] Error checking Telegram:', e);
    }
    
    return newMessages;
  }
  
  getTelegramBotToken() {
    try {
      // Read from file storage
      // For now, check if token file exists
      const tokenPath = path.join(os.homedir(), '.openego_telegram_token');
      if (fs.existsSync(tokenPath)) {
        return fs.readFileSync(tokenPath, 'utf8').trim();
      }
    } catch (e) {}
    return null;
  }
  
  async getTelegramUpdates(botToken) {
    try {
      const response = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?limit=10`);
      const data = await response.json();
      
      if (data.ok && data.result) {
        return data.result.map(update => ({
          message_id: update.message?.message_id,
          from: update.message?.from?.first_name || update.message?.from?.username,
          text: update.message?.text,
          chat_id: update.message?.chat?.id
        })).filter(m => m.message_id);
      }
    } catch (e) {
      console.error('[Monitor] Error getting Telegram updates:', e);
    }
    return [];
  }
  
  notifyNewMessages(emails, telegram) {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    
    const totalNew = emails.length + telegram.length;
    console.log(`[Monitor] Notifying ${totalNew} new messages`);
    
    // Send to renderer process
    this.mainWindow.webContents.send('new-messages', {
      emails,
      telegram,
      timestamp: new Date().toISOString()
    });
    
    // Show notification
    if (totalNew > 0) {
      const { Notification } = require('electron');
      
      if (Notification.isSupported()) {
        new Notification({
          title: 'OpenEgo',
          body: `${totalNew} new message${totalNew > 1 ? 's' : ''} detected`,
          silent: false
        }).show();
      }
    }
  }
}

// Setup IPC handlers
function setupMessageMonitor(mainWindow) {
  const monitor = new MessageMonitor(mainWindow);
  
  ipcMain.handle('start-message-monitor', () => {
    monitor.start();
    return { success: true };
  });
  
  ipcMain.handle('stop-message-monitor', () => {
    monitor.stop();
    return { success: true };
  });
  
  ipcMain.handle('check-messages-now', async () => {
    const emails = await monitor.checkMail();
    const telegram = await monitor.checkTelegram();
    return { emails, telegram };
  });
  
  // Auto-start if in auto-pilot mode
  const mode = 'copilot'; // Would read from settings
  if (mode === 'autopilot' || mode === 'copilot') {
    monitor.start();
  }
}

module.exports = { setupMessageMonitor, MessageMonitor };
