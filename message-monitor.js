const { ipcMain } = require('electron');
const fs = require('fs').promises; // Use async fs
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

/**
 * Message Monitor - Background service for detecting new messages
 * PROPERLY IMPLEMENTED: Non-blocking async operations only
 */

class MessageMonitor {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.isRunning = false;
    this.lastCheckTime = new Date();
    this.knownEmails = new Set();
    this.knownTelegram = new Set();
    this.checkInterval = null;
    this.isChecking = false; // Prevent overlapping checks
    
    // Load previously seen messages
    this.loadKnownMessages();
  }
  
  async loadKnownMessages() {
    try {
      const knownPath = path.join(os.homedir(), '.openego_known_messages.json');
      const data = await fs.readFile(knownPath, 'utf8').catch(() => null);
      if (data) {
        const parsed = JSON.parse(data);
        this.knownEmails = new Set(parsed.emails || []);
        this.knownTelegram = new Set(parsed.telegram || []);
        console.log(`[Monitor] Loaded ${this.knownEmails.size} known emails`);
      }
    } catch (e) {
      console.log('[Monitor] No known messages file yet');
    }
  }
  
  async saveKnownMessages() {
    try {
      const knownPath = path.join(os.homedir(), '.openego_known_messages.json');
      await fs.writeFile(knownPath, JSON.stringify({
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
    
    // First check after 5 seconds (let app finish loading)
    setTimeout(() => this.checkForNewMessages(), 5000);
    
    // Check every 60 seconds (increased from 30 to reduce load)
    this.checkInterval = setInterval(() => {
      this.checkForNewMessages();
    }, 60000);
    
    console.log('[Monitor] Message monitor active (checking every 60s)');
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
    // Prevent overlapping checks
    if (this.isChecking || !this.isRunning) return;
    this.isChecking = true;
    
    console.log('[Monitor] Checking for new messages...');
    
    try {
      // Check Mail using AppleScript (non-blocking)
      const newEmails = await this.checkMailAppleScript();
      
      // Process emails in background without blocking
      if (newEmails.length > 0) {
        setImmediate(() => {
          this.notifyNewMessages(newEmails, []);
        });
      }
      
    } catch (e) {
      console.error('[Monitor] Error checking messages:', e);
    } finally {
      this.isChecking = false;
    }
  }
  
  async checkMailAppleScript() {
    const newEmails = [];
    
    try {
      // AppleScript to get recent unread emails from Mail app
      const script = `
        tell application "Mail"
          set unreadEmails to {}
          try
            repeat with acct in accounts
              try
                set mb to mailbox "INBOX" of acct
                set msgs to messages of mb whose read status is false
                
                repeat with msg in msgs
                  try
                    set msgSubject to subject of msg
                    set msgSender to sender of msg
                    set msgContent to content of msg
                    set msgId to id of msg as string
                    
                    set emailData to "ID:" & msgId & "|SUBJECT:" & msgSubject & "|FROM:" & msgSender & "|CONTENT:" & (text 1 thru 200 of msgContent) & "\\n---END---\\n"
                    set end of unreadEmails to emailData
                    
                    if length of unreadEmails >= 5 then exit repeat
                  on error
                    -- Skip problematic emails
                  end try
                end repeat
                
                if length of unreadEmails >= 5 then exit repeat
              on error
                -- Skip problematic accounts
              end try
            end repeat
          on error
            -- Mail app might not be running
          end try
          
          return unreadEmails as string
        end tell
      `;
      
      // Execute AppleScript asynchronously (NON-BLOCKING)
      const { stdout, stderr } = await execAsync(`osascript -e '${script}'`, {
        timeout: 15000, // 15 second timeout
        maxBuffer: 1024 * 1024 // 1MB buffer
      }).catch(err => {
        console.log('[Monitor] AppleScript error (expected if Mail not running):', err.message);
        return { stdout: '', stderr: '' };
      });
      
      if (stderr) {
        console.log('[Monitor] AppleScript stderr:', stderr);
      }
      
      // Parse the output
      if (stdout) {
        const emailBlocks = stdout.split('---END---').filter(b => b.trim());
        
        for (const block of emailBlocks) {
          const idMatch = block.match(/ID:(.+?)\|/);
          const subjectMatch = block.match(/\|SUBJECT:(.+?)\|FROM:/);
          const fromMatch = block.match(/\|FROM:(.+?)\|CONTENT:/);
          const contentMatch = block.match(/\|CONTENT:(.+)$/);
          
          if (idMatch) {
            const emailId = idMatch[1].trim();
            
            // Only process if we haven't seen this email
            if (!this.knownEmails.has(emailId)) {
              this.knownEmails.add(emailId);
              
              newEmails.push({
                id: emailId,
                subject: subjectMatch ? subjectMatch[1].trim() : 'No subject',
                from: fromMatch ? fromMatch[1].trim() : 'Unknown',
                content: contentMatch ? contentMatch[1].trim() : '',
                source: 'mail',
                timestamp: new Date().toISOString()
              });
            }
          }
        }
      }
      
      // Save known emails periodically
      if (newEmails.length > 0) {
        await this.saveKnownMessages();
      }
      
    } catch (e) {
      console.error('[Monitor] Error in checkMailAppleScript:', e);
    }
    
    return newEmails;
  }
  
  notifyNewMessages(emails, telegram) {
    const totalNew = emails.length + telegram.length;
    if (totalNew === 0) return;
    
    console.log(`[Monitor] Found ${totalNew} new messages`);
    
    // Send to renderer process
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('new-messages', {
        emails,
        telegram,
        timestamp: new Date().toISOString()
      });
    }
    
    // Show native notification
    const { Notification } = require('electron');
    if (Notification.isSupported()) {
      new Notification({
        title: 'OpenEgo',
        body: `${totalNew} new message${totalNew > 1 ? 's' : ''} to respond to`,
        silent: false
      }).show();
    }
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
    const emails = await monitor.checkMailAppleScript();
    return { emails, count: emails.length };
  });
  
  ipcMain.handle('get-monitor-status', () => {
    return { 
      isRunning: monitor.isRunning,
      knownEmails: monitor.knownEmails.size,
      lastCheck: monitor.lastCheckTime
    };
  });
  
  // Auto-start if user has enabled it in settings
  // This will be controlled by a setting in the UI
  const autoStart = false; // User must enable this in settings
  if (autoStart) {
    monitor.start();
  }
  
  console.log('[Monitor] Setup complete. Call start-message-monitor to enable auto-reply.');
}

module.exports = { setupMessageMonitor, MessageMonitor };
