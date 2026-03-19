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

  // Scan Apple Mail with crash protection
  async scanMail() {
    const mailPath = path.join(os.homedir(), 'Library/Mail');
    let processedCount = 0;
    let successCount = 0;
    const MAX_EMAILS = 500; // Limit to prevent memory issues
    const BATCH_SIZE = 25; // Process in smaller batches
    
    try {
      if (!fs.existsSync(mailPath)) {
        this.sendProgress('mail', 0, 0, 'Mail folder not found');
        return;
      }
      
      // Collect all email files (limit to prevent crash)
      const allFiles = [];
      this.collectFiles(mailPath, allFiles, ['.emlx', '.eml']);
      
      // Limit total files to prevent crash
      const totalFiles = Math.min(allFiles.length, MAX_EMAILS);
      const filesToProcess = allFiles.slice(0, MAX_EMAILS);
      
      console.log(`[Scanner] Processing ${totalFiles} emails (limited from ${allFiles.length})`);
      
      // Process in small batches with frequent breaks
      for (let i = 0; i < filesToProcess.length; i++) {
        const filePath = filesToProcess[i];
        
        try {
          // Check file size before reading (skip files > 1MB)
          const stats = fs.statSync(filePath);
          if (stats.size > 1024 * 1024) {
            console.log(`[Scanner] Skipping large file: ${filePath}`);
            processedCount++;
            continue;
          }
          
          const content = fs.readFileSync(filePath, 'utf8');
          const email = this.parseEmail(content);
          
          if (email) {
            // Store limited email data
            const limitedEmail = {
              subject: email.subject?.substring(0, 200) || 'No subject',
              from: email.from?.substring(0, 100) || 'Unknown',
              date: email.date,
              content: email.content?.substring(0, 500) || '', // Limit content
              preview: email.content?.substring(0, 100) || ''
            };
            
            this.results.emails.push(limitedEmail);
            this.results.totalCount++;
            successCount++;
          }
          
          processedCount++;
          
          // Send progress and save every BATCH_SIZE files
          if (processedCount % BATCH_SIZE === 0) {
            this.sendProgress('mail', processedCount, totalFiles, null, successCount);
            this.saveProgress();
            
            // Small delay to prevent blocking
            await this.delay(50);
            
            // Clear some memory every 100 emails
            if (processedCount % 100 === 0) {
              global.gc && global.gc(); // Force garbage collection if available
            }
          }
        } catch (e) {
          console.log(`[Scanner] Error processing file: ${e.message}`);
          processedCount++;
          // Continue with next file
        }
      }
      
      this.sendProgress('mail', processedCount, totalFiles, null, successCount, true);
      console.log(`[Scanner] Mail scan complete: ${successCount} emails processed`);
      
    } catch (e) {
      console.error('[Scanner] Fatal error in scanMail:', e);
      this.sendProgress('mail', processedCount, 0, e.message);
    }
  }
  
  // Save progress to disk to prevent data loss on crash
  saveProgress() {
    try {
      const progressPath = path.join(os.homedir(), '.openego_scan_progress.json');
      fs.writeFileSync(progressPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        emails: this.results.emails.slice(-50), // Only save last 50 to keep file small
        totalCount: this.results.totalCount,
        lastIndex: this.results.emails.length
      }));
    } catch (e) {
      console.log('[Scanner] Could not save progress:', e.message);
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
    const documentsPath = path.join(os.homedir(), 'Documents');
    const documents = [];
    
    try {
      if (fs.existsSync(documentsPath)) {
        // Just note that documents folder exists
        documents.push({
          type: 'documents',
          note: 'Documents folder found',
          path: documentsPath
        });
        
        this.sendProgress('documents', 1, 1, null, 1, true);
      } else {
        this.sendProgress('documents', 0, 0, 'Documents folder not found');
      }
    } catch (e) {
      this.sendProgress('documents', 0, 0, e.message);
    }
    
    this.results.documents = documents;
  }

  // Helper: Recursively collect files
  collectFiles(dir, files, extensions) {
    try {
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          this.collectFiles(fullPath, files, extensions);
        } else if (stat.isFile()) {
          const ext = path.extname(item).toLowerCase();
          if (extensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    } catch (e) {
      // Skip directories we can't access
    }
  }

  // Helper: Parse email content
  parseEmail(content) {
    try {
      // Simple email parsing
      const lines = content.split('\n');
      const email = {
        subject: '',
        from: '',
        date: '',
        content: ''
      };
      
      let inContent = false;
      const contentLines = [];
      
      for (const line of lines) {
        if (line.startsWith('Subject:')) {
          email.subject = line.substring(8).trim();
        } else if (line.startsWith('From:')) {
          email.from = line.substring(5).trim();
        } else if (line.startsWith('Date:')) {
          email.date = line.substring(5).trim();
        } else if (line === '' && !inContent) {
          inContent = true;
        } else if (inContent) {
          contentLines.push(line);
        }
      }
      
      email.content = contentLines.join('\n').trim();
      
      return email;
    } catch (e) {
      return null;
    }
  }

  // Helper: Send progress to renderer
  sendProgress(type, processed, total, error = null, count = 0, complete = false) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('scan-progress', {
        type,
        processed,
        total,
        error,
        count,
        complete
      });
    }
  }

  // Helper: Delay
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // Clear all scan progress data
  clearProgress() {
    try {
      const progressFile = path.join(os.homedir(), '.openego_scan_progress.json');
      const emailCache = path.join(os.homedir(), '.openego_emails_cache.json');
      
      if (fs.existsSync(progressFile)) {
        fs.unlinkSync(progressFile);
        console.log('[Scanner] Progress file cleared');
      }
      
      if (fs.existsSync(emailCache)) {
        fs.unlinkSync(emailCache);
        console.log('[Scanner] Email cache cleared');
      }
      
      return { success: true, message: 'Progress data cleared' };
    } catch (e) {
      console.error('[Scanner] Error clearing progress:', e);
      return { success: false, error: e.message };
    }
  }
}

// Setup IPC handlers
function setupCommunicationScanner(mainWindow) {
  const scanner = new CommunicationScanner(mainWindow);
  
  ipcMain.handle('scan-communications', async (event, sources, options = {}) => {
    try {
      // Handle options like timeRange
      if (options.timeRange) {
        console.log(`[Scanner] Time range: ${options.timeRange}`);
        scanner.timeRange = options.timeRange;
      }
      
      const results = await scanner.scanAll(sources);
      return { success: true, ...results };
    } catch (error) {
      console.error('Scan error:', error);
      return { success: false, error: error.message };
    }
  });
  
  // Clear scan progress (for "start from scratch")
  ipcMain.handle('clear-scan-progress', async () => {
    return scanner.clearProgress();
  });
  
  console.log('[Scanner] Communication scanner initialized');
}

module.exports = { setupCommunicationScanner };
