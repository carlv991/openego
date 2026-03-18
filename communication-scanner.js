const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

// sqlite3 is optional (only for backend API)
let sqlite3;
try {
  sqlite3 = require('sqlite3').verbose();
} catch (e) {
  console.log('sqlite3 not available - Messages scanning limited');
}

// Generic Communication Scanner - handles ALL channels
class CommunicationScanner {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.results = {
      emails: [],
      messages: [],
      telegram: [],
      whatsapp: [],
      totalCount: 0
    };
  }

  async scanAll(sources) {
    const promises = [];
    
    if (sources.mail) {
      promises.push(this.scanMail());
    }
    
    if (sources.messages) {
      promises.push(this.scanMessages());
    }
    
    if (sources.telegram) {
      promises.push(this.scanTelegram());
    }
    
    if (sources.whatsapp) {
      promises.push(this.scanWhatsApp());
    }
    
    if (sources.documents) {
      promises.push(this.scanDocuments());
    }
    
    // Wait for all scans to complete
    await Promise.all(promises);
    
    return this.results;
  }

  // Scan Apple Mail
  async scanMail() {
    const mailPath = path.join(os.homedir(), 'Library/Mail');
    const emails = [];
    let processedCount = 0;
    
    try {
      if (!fs.existsSync(mailPath)) {
        this.sendProgress('mail', 0, 0, 'Mail folder not found');
        return;
      }
      
      // Collect all email files
      const allFiles = [];
      this.collectFiles(mailPath, allFiles, ['.emlx', '.eml']);
      const totalFiles = allFiles.length;
      
      // Process in batches
      for (let i = 0; i < allFiles.length; i++) {
        const filePath = allFiles[i];
        
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          const email = this.parseEmail(content);
          
          if (email) {
            emails.push(email);
            this.results.emails.push(email);
            this.results.totalCount++;
          }
          
          processedCount++;
          
          // Send progress every 50 files
          if (processedCount % 50 === 0) {
            this.sendProgress('mail', processedCount, totalFiles, null, emails.length);
            await this.delay(10);
          }
        } catch (e) {
          // Skip problematic files
        }
      }
      
      this.sendProgress('mail', processedCount, totalFiles, null, emails.length, true);
      
    } catch (e) {
      this.sendProgress('mail', processedCount, 0, e.message);
    }
  }

  // Scan Messages app
  async scanMessages() {
    const messagesPath = path.join(os.homedir(), 'Library/Messages');
    const messages = [];
    
    try {
      if (!fs.existsSync(messagesPath)) {
        this.sendProgress('messages', 0, 0, 'Messages folder not found');
        return;
      }
      
      // Try to read chat.db (SQLite)
      const dbPath = path.join(messagesPath, 'chat.db');
      
      if (fs.existsSync(dbPath)) {
        // Note: In production, this needs proper decryption/access
        // For now, we'll note that it's found
        messages.push({
          type: 'messages_app',
          note: 'Messages database found - requires access permissions',
          path: dbPath
        });
        
        this.sendProgress('messages', 1, 1, null, 1, true);
      } else {
        this.sendProgress('messages', 0, 0, 'Messages database not accessible');
      }
      
      this.results.messages = messages;
      
    } catch (e) {
      this.sendProgress('messages', 0, 0, e.message);
    }
  }

  // Scan Telegram (if desktop app data exists)
  async scanTelegram() {
    const telegramPaths = [
      path.join(os.homedir(), 'Library/Application Support/Telegram Desktop'),
      path.join(os.homedir(), '.local/share/TelegramDesktop')
    ];
    
    const telegram = [];
    
    for (const tgPath of telegramPaths) {
      try {
        if (fs.existsSync(tgPath)) {
          telegram.push({
            type: 'telegram',
            note: 'Telegram Desktop data found',
            path: tgPath
          });
          
          this.sendProgress('telegram', 1, 1, null, 1, true);
          break;
        }
      } catch (e) {
        // Continue to next path
      }
    }
    
    if (telegram.length === 0) {
      this.sendProgress('telegram', 0, 0, 'Telegram Desktop not found');
    }
    
    this.results.telegram = telegram;
  }

  // Scan WhatsApp (if desktop app exists)
  async scanWhatsApp() {
    const whatsappPaths = [
      path.join(os.homedir(), 'Library/Application Support/WhatsApp'),
      path.join(os.homedir(), '.local/share/WhatsApp')
    ];
    
    const whatsapp = [];
    
    for (const waPath of whatsappPaths) {
      try {
        if (fs.existsSync(waPath)) {
          whatsapp.push({
            type: 'whatsapp',
            note: 'WhatsApp Desktop data found',
            path: waPath
          });
          
          this.sendProgress('whatsapp', 1, 1, null, 1, true);
          break;
        }
      } catch (e) {
        // Continue to next path
      }
    }
    
    if (whatsapp.length === 0) {
      this.sendProgress('whatsapp', 0, 0, 'WhatsApp Desktop not found');
    }
    
    this.results.whatsapp = whatsapp;
  }

  // Scan Documents
  async scanDocuments() {
    const docsPath = path.join(os.homedir(), 'Documents');
    const documents = [];
    
    try {
      if (!fs.existsSync(docsPath)) {
        this.sendProgress('documents', 0, 0, 'Documents folder not found');
        return;
      }
      
      this.scanDocumentsRecursive(docsPath, documents, 0);
      
      this.sendProgress('documents', documents.length, documents.length, null, documents.length, true);
      
    } catch (e) {
      this.sendProgress('documents', 0, 0, e.message);
    }
  }

  scanDocumentsRecursive(dir, documents, depth) {
    if (depth > 2) return;
    
    try {
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        if (item.startsWith('.')) continue;
        
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          this.scanDocumentsRecursive(fullPath, documents, depth + 1);
        } else if (
          item.endsWith('.txt') ||
          item.endsWith('.md') ||
          item.endsWith('.docx') ||
          item.endsWith('.pdf') ||
          item.endsWith('.rtf')
        ) {
          documents.push({
            type: 'document',
            name: item,
            path: fullPath,
            size: stat.size,
            modified: stat.mtime
          });
        }
      }
    } catch (e) {
      // Skip directories we can't read
    }
  }

  // Parse email content
  parseEmail(content) {
    try {
      const from = content.match(/From: (.+)/i)?.[1] || 'Unknown';
      const to = content.match(/To: (.+)/i)?.[1] || '';
      const subject = content.match(/Subject: (.+)/i)?.[1] || 'No Subject';
      const date = content.match(/Date: (.+)/i)?.[1] || '';
      
      // Extract body (simplified)
      let body = '';
      const bodyMatch = content.match(/\r?\n\r?\n([\s\S]+)$/);
      if (bodyMatch) {
        body = bodyMatch[1].substring(0, 2000); // Limit body size
      }
      
      return {
        type: 'email',
        from,
        to,
        subject,
        date,
        preview: body.substring(0, 500),
        fullContent: body,
        timestamp: new Date(date).getTime() || 0
      };
    } catch (e) {
      return null;
    }
  }

  // Collect files recursively
  collectFiles(dir, files, extensions) {
    try {
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          this.collectFiles(fullPath, files, extensions);
        } else if (extensions.some(ext => item.endsWith(ext))) {
          files.push(fullPath);
        }
      }
    } catch (e) {
      // Skip directories we can't read
    }
  }

  // Send progress update to renderer
  sendProgress(source, processed, total, error, count = 0, complete = false) {
    if (this.mainWindow && this.mainWindow.webContents) {
      this.mainWindow.webContents.send('scan-progress', {
        type: source,
        processed,
        total,
        count,
        percent: total > 0 ? Math.round((processed / total) * 100) : 0,
        error,
        complete
      });
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Setup IPC handlers
function setupCommunicationScanner(mainWindow) {
  ipcMain.handle('scan-communications', async (event, sources) => {
    const scanner = new CommunicationScanner(mainWindow);
    return await scanner.scanAll(sources);
  });
}

module.exports = { setupCommunicationScanner, CommunicationScanner };
