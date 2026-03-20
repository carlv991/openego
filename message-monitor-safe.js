const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { MessageTracker } = require('./message-tracker');

/**
 * Message Monitor - Background service for detecting new messages
 * Scans Mail, Telegram Desktop, and other sources for new messages
 * SAFETY FEATURE: Only processes messages that haven't been seen before
 */

class MessageMonitor {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.isRunning = false;
    this.lastCheckTime = new Date();
    this.tracker = new MessageTracker();
    this.checkInterval = null;
    
    console.log('[Monitor] Message tracker initialized');
    console.log('[Monitor] Stats:', this.tracker.getStats());
  }
  
  start() {
    if (this.isRunning) return;
    
    console.log('[Monitor] Starting message monitor...');
    this.isRunning = true;
    
    // First check after 5 seconds (let app finish loading)
    setTimeout(() => this.checkForNewMessages(), 5000);
    
    // Check every 60 seconds (increased from 30 to reduce load)
    this.checkInterval = setInterval(() => {
      this.checkForNewMessages();
    }, 60000);
    
    console.log('[Monitor] Message monitor active (checking every 60s)');
    console.log('[Monitor] Safety: Only NEW messages will be processed');
  }
  
  stop() {
    if (!this.isRunning) return;
    
    console.log('[Monitor] Stopping message monitor...');
    this.isRunning = false;
    
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    
    // Save tracker state
    this.tracker.saveSeenMessages();
  }
  
  async checkForNewMessages() {
    if (!this.isRunning) return;
    
    console.log('[Monitor] Checking for new messages...');
    
    try {
      // Check Mail for NEW emails only
      const newEmails = await this.checkMailNewOnly();
      
      // Process only new emails
      if (newEmails.length > 0) {
        console.log(`[Monitor] Found ${newEmails.length} NEW emails to process`);
        this.notifyNewMessages(newEmails, []);
      } else {
        console.log('[Monitor] No new emails found');
      }
      
    } catch (e) {
      console.error('[Monitor] Error checking messages:', e);
    }
  }
  
  async checkMailNewOnly() {
    const newEmails = [];
    
    try {
      if (process.platform !== 'darwin') {
        return newEmails; // Only works on macOS
      }
      
      const { exec } = require('child_process');
      const util = require('util');
      const execAsync = util.promisify(exec);
      
      // AppleScript to get recent unread emails
      const script = `
        tell application "Mail"
          set recentEmails to {}
          try
            repeat with acct in accounts
              try
                set mb to mailbox "INBOX" of acct
                set msgs to messages 1 thru 10 of mb
                
                repeat with msg in msgs
                  try
                    set msgSubject to subject of msg
                    set msgSender to sender of msg
                    set msgContent to content of msg
                    set msgId to id of msg as string
                    set msgDate to date received of msg
                    set isRead to read status of msg
                    
                    set emailData to "ID:" & msgId & "|SUBJECT:" & msgSubject & "|FROM:" & msgSender & "|DATE:" & msgDate & "|READ:" & isRead & "|CONTENT:" & (text 1 thru 200 of msgContent) & "\\n---END---\\n"
                    set end of recentEmails to emailData
                  on error
                    -- Skip problematic emails
                  end try
                end repeat
              on error
                -- Skip problematic accounts
              end try
            end repeat
          on error
            -- Mail app might not be running
          end try
          
          return recentEmails as string
        end tell
      `;
      
      const { stdout } = await execAsync(`osascript -e '${script}'`, {
        timeout: 15000
      }).catch(() => ({ stdout: '' }));
      
      if (stdout) {
        const emailBlocks = stdout.split('---END---').filter(b => b.trim());
        
        for (const block of emailBlocks) {
          const idMatch = block.match(/ID:(.+?)\|/);
          const subjectMatch = block.match(/\|SUBJECT:(.+?)\|FROM:/);
          const fromMatch = block.match(/\|FROM:(.+?)\|DATE:/);
          const dateMatch = block.match(/\|DATE:(.+?)\|READ:/);
          const readMatch = block.match(/\|READ:(.+?)\|CONTENT:/);
          
          if (idMatch && fromMatch) {
            const messageId = idMatch[1].trim();
            const sender = fromMatch[1].trim();
            const subject = subjectMatch ? subjectMatch[1].trim() : 'No subject';
            const date = dateMatch ? dateMatch[1].trim() : new Date().toISOString();
            const isRead = readMatch ? readMatch[1].trim() === 'true' : false;
            
            // SAFETY CHECK: Only process if NEW (never seen before)
            if (this.tracker.isNewMessage(messageId)) {
              // Only process unread emails as "new"
              if (!isRead) {
                newEmails.push({
                  id: messageId,
                  sender: sender,
                  subject: subject,
                  date: date,
                  source: 'mail'
                });
                
                // Mark as seen immediately
                this.tracker.markAsSeen(messageId);
                console.log(`[Monitor] New email detected: ${subject} from ${sender}`);
              } else {
                // Mark read emails as seen but don't process
                this.tracker.markAsSeen(messageId);
              }
            }
          }
        }
      }
      
    } catch (e) {
      console.error('[Monitor] Error checking mail:', e);
    }
    
    return newEmails;
  }
  
  notifyNewMessages(emails, telegram) {
    const totalNew = emails.length + telegram.length;
    if (totalNew === 0) return;
    
    console.log(`[Monitor] Notifying about ${totalNew} new messages`);
    
    // Send to renderer
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('new-messages', {
        emails,
        telegram,
        timestamp: new Date().toISOString(),
        safetyNote: 'Only new messages shown - historical messages filtered'
      });
    }
    
    // Show notification
    const { Notification } = require('electron');
    if (Notification.isSupported()) {
      new Notification({
        title: 'OpenEgo',
        body: `${totalNew} new message${totalNew > 1 ? 's' : ''} to respond to`,
        silent: false
      }).show();
    }
  }
  
  getSafetyStats() {
    return this.tracker.getStats();
  }
}

// Setup IPC handlers
function setupMessageMonitor(mainWindow) {
  const monitor = new MessageMonitor(mainWindow);
  
  ipcMain.handle('start-message-monitor', () => {
    monitor.start();
    return { success: true, status: 'started' };
  });
  
  ipcMain.handle('stop-message-monitor', () => {
    monitor.stop();
    return { success: true, status: 'stopped' };
  });
  
  ipcMain.handle('check-messages-now', async () => {
    const emails = await monitor.checkMailNewOnly();
    return { emails, count: emails.length };
  });
  
  ipcMain.handle('get-message-tracker-stats', () => {
    return monitor.getSafetyStats();
  });
  
  ipcMain.handle('clear-message-tracker', () => {
    monitor.tracker.clearAll();
    return { success: true };
  });
  
  // Auto-start if user has enabled it in settings
  // This will be controlled by UI toggle
  console.log('[Monitor] Setup complete. Call start-message-monitor to enable.');
}

module.exports = { setupMessageMonitor, MessageMonitor };
