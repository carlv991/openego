const { ipcMain } = require('electron');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

/**
 * Apple Mail Sender
 * Uses AppleScript to compose and send emails through Apple Mail
 */

class AppleMailSender {
  constructor() {
    this.isAvailable = false;
    this.checkAvailability();
  }
  
  async checkAvailability() {
    try {
      // Check if Apple Mail is installed and accessible
      const { stdout } = await execPromise('osascript -e \'tell application "System Events" to exists application "Mail"\'');
      this.isAvailable = stdout.trim() === 'true';
      console.log('[Apple Mail] Available:', this.isAvailable);
    } catch (e) {
      console.log('[Apple Mail] Not available:', e.message);
      this.isAvailable = false;
    }
  }
  
  async sendEmail(to, subject, body, options = {}) {
    if (!this.isAvailable) {
      return { 
        success: false, 
        error: 'Apple Mail is not available or not accessible' 
      };
    }
    
    try {
      // Escape special characters for AppleScript
      const escapedTo = this.escapeAppleScript(to);
      const escapedSubject = this.escapeAppleScript(subject);
      const escapedBody = this.escapeAppleScript(body);
      
      // Build AppleScript
      const script = `
        tell application "Mail"
          set newMessage to make new outgoing message with properties {subject:"${escapedSubject}", content:"${escapedBody}"}
          tell newMessage
            make new to recipient at end of to recipients with properties {address:"${escapedTo}"}
            send
          end tell
        end tell
      `;
      
      console.log('[Apple Mail] Sending email to:', to);
      
      // Execute AppleScript
      const { stdout, stderr } = await execPromise(`osascript -e '${script}'`);
      
      if (stderr) {
        console.error('[Apple Mail] stderr:', stderr);
        // Some stderr might not be fatal, check if email was sent
      }
      
      console.log('[Apple Mail] Email sent successfully');
      
      return {
        success: true,
        message: 'Email sent via Apple Mail',
        recipient: to,
        timestamp: new Date().toISOString()
      };
      
    } catch (e) {
      console.error('[Apple Mail] Error sending email:', e);
      return {
        success: false,
        error: e.message,
        suggestion: 'Make sure Apple Mail is configured and you have granted OpenEgo permission to control it.'
      };
    }
  }
  
  async composeEmail(to, subject, body) {
    // Opens Apple Mail with pre-filled fields but doesn't send
    // User must manually click send
    
    if (!this.isAvailable) {
      return { 
        success: false, 
        error: 'Apple Mail is not available' 
      };
    }
    
    try {
      const escapedTo = this.escapeAppleScript(to);
      const escapedSubject = this.escapeAppleScript(subject);
      const escapedBody = this.escapeAppleScript(body);
      
      const script = `
        tell application "Mail"
          set newMessage to make new outgoing message with properties {subject:"${escapedSubject}", content:"${escapedBody}"}
          tell newMessage
            make new to recipient at end of to recipients with properties {address:"${escapedTo}"}
            set visible to true
          end tell
          activate
        end tell
      `;
      
      await execPromise(`osascript -e '${script}'`);
      
      return {
        success: true,
        message: 'Apple Mail opened with composed email',
        action: 'user_must_send'
      };
      
    } catch (e) {
      console.error('[Apple Mail] Error composing email:', e);
      return { success: false, error: e.message };
    }
  }
  
  escapeAppleScript(str) {
    if (!str) return '';
    // Escape quotes and backslashes for AppleScript
    return str
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/'/g, "\\'")
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r');
  }
  
  async getMailAccounts() {
    try {
      const script = `
        tell application "Mail"
          set accountList to {}
          repeat with acct in accounts
            set end of accountList to name of acct
          end repeat
          return accountList
        end tell
      `;
      
      const { stdout } = await execPromise(`osascript -e '${script}'`);
      const accounts = stdout.trim().split(', ').filter(a => a);
      
      return { success: true, accounts };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
}

// Setup IPC handlers
function setupAppleMailHandlers() {
  const sender = new AppleMailSender();
  
  ipcMain.handle('send-email-apple', async (event, to, subject, body, autoSend = false) => {
    console.log('[Apple Mail] Send request:', { to, subject, autoSend });
    
    if (autoSend) {
      // Try to auto-send
      return sender.sendEmail(to, subject, body);
    } else {
      // Just open compose window
      return sender.composeEmail(to, subject, body);
    }
  });
  
  ipcMain.handle('check-apple-mail', async () => {
    await sender.checkAvailability();
    return { 
      available: sender.isAvailable,
      message: sender.isAvailable ? 'Apple Mail is ready' : 'Apple Mail not accessible'
    };
  });
  
  ipcMain.handle('get-mail-accounts', async () => {
    return sender.getMailAccounts();
  });
}

module.exports = { setupAppleMailHandlers, AppleMailSender };
