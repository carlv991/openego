const { ipcMain, dialog, systemPreferences } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Full Disk Access check and request
function setupFullDiskAccessHandlers() {
  ipcMain.handle('check-full-disk-access', async () => {
    if (process.platform !== 'darwin') {
      return { granted: true, platform: process.platform };
    }
    
    // On macOS, check if we can access Mail folder
    const testPath = path.join(os.homedir(), 'Library/Mail');
    try {
      fs.accessSync(testPath, fs.constants.R_OK);
      return { granted: true };
    } catch (e) {
      return { granted: false };
    }
  });
  
  // Check if OpenEgo is already in the Full Disk Access list (even if not checked)
  ipcMain.handle('check-openego-in-list', async () => {
    if (process.platform !== 'darwin') {
      return { inList: false, platform: process.platform };
    }
    
    try {
      // Read the TCC database (requires Full Disk Access itself, so this may fail)
      const tccPath = path.join(os.homedir(), 'Library/Application Support/com.apple.TCC/TCC.db');
      
      // Try to check if we can at least see if OpenEgo is in the database
      // This is a simplified check - in reality, we'd need SQLite access
      return { 
        inList: false, 
        note: 'Cannot check without Full Disk Access. If you previously added OpenEgo, just check the box next to it.'
      };
    } catch (e) {
      return { inList: false, error: e.message };
    }
  });
  
  ipcMain.handle('request-full-disk-access', async () => {
    if (process.platform !== 'darwin') {
      return { granted: true };
    }
    
    // Open System Preferences to Full Disk Access
    const { shell } = require('electron');
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles');
    
    // Show instructions dialog
    dialog.showMessageBox({
      type: 'info',
      title: 'Grant Full Disk Access',
      message: 'Please grant Full Disk Access to OpenEgo',
      detail: '1. Click the lock icon to make changes\n2. Click the + button\n3. Select OpenEgo from Applications\n4. Check the box next to OpenEgo\n5. Restart OpenEgo',
      buttons: ['Done', 'Cancel'],
      defaultId: 0
    });
    
    return { requested: true };
  });
}

// Scan Mail app data - ALL emails with progress
async function scanAllMailData(window) {
  const mailPath = path.join(os.homedir(), 'Library/Mail');
  const emails = [];
  let processedCount = 0;
  
  try {
    if (!fs.existsSync(mailPath)) {
      return { error: 'Mail folder not found', emails: [] };
    }
    
    // Get all email files first
    const allFiles = [];
    
    function collectFiles(dir) {
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          collectFiles(fullPath);
        } else if (item.endsWith('.emlx') || item.endsWith('.eml')) {
          allFiles.push(fullPath);
        }
      }
    }
    
    collectFiles(mailPath);
    const totalFiles = allFiles.length;
    
    // Process in batches to avoid blocking
    for (let i = 0; i < allFiles.length; i++) {
      const filePath = allFiles[i];
      
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const from = content.match(/From: (.+)/)?.[1] || 'Unknown';
        const subject = content.match(/Subject: (.+)/)?.[1] || 'No Subject';
        const date = content.match(/Date: (.+)/)?.[1] || '';
        const to = content.match(/To: (.+)/)?.[1] || '';
        
        emails.push({
          from,
          to,
          subject,
          date,
          preview: content.substring(0, 1000),
          path: filePath
        });
        
        processedCount++;
        
        // Send progress update every 50 files
        if (processedCount % 50 === 0 && window) {
          window.webContents.send('scan-progress', {
            type: 'mail',
            processed: processedCount,
            total: totalFiles,
            percent: Math.round((processedCount / totalFiles) * 100)
          });
        }
        
        // Small delay to prevent UI freezing
        if (processedCount % 100 === 0) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      } catch (e) {
        // Skip files we can't read
      }
    }
    
    return {
      count: emails.length,
      emails: emails,
      complete: true
    };
  } catch (e) {
    return { error: e.message, emails: emails };
  }
}

// Legacy function for quick scan
function scanMailData() {
  const mailPath = path.join(os.homedir(), 'Library/Mail');
  const emails = [];
  
  try {
    if (!fs.existsSync(mailPath)) {
      return { error: 'Mail folder not found' };
    }
    
    // Quick scan - first 100 only
    function scanDirectory(dir) {
      if (emails.length >= 100) return;
      
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        if (emails.length >= 100) return;
        
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          scanDirectory(fullPath);
        } else if (item.endsWith('.emlx') || item.endsWith('.eml')) {
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            const from = content.match(/From: (.+)/)?.[1] || 'Unknown';
            const subject = content.match(/Subject: (.+)/)?.[1] || 'No Subject';
            const date = content.match(/Date: (.+)/)?.[1] || '';
            
            emails.push({
              from,
              subject,
              date,
              preview: content.substring(0, 500)
            });
          } catch (e) {
            // Skip files we can't read
          }
        }
      }
    }
    
    scanDirectory(mailPath);
    
    return {
      count: emails.length,
      emails: emails
    };
  } catch (e) {
    return { error: e.message };
  }
}

// Scan Messages app
function scanMessagesData() {
  const messagesPath = path.join(os.homedir(), 'Library/Messages');
  const messages = [];
  
  try {
    if (!fs.existsSync(messagesPath)) {
      return { error: 'Messages folder not found' };
    }
    
    // Note: Actual Messages database is encrypted/complex
    // This is a simplified version
    const chatPath = path.join(messagesPath, 'chat.db');
    
    if (fs.existsSync(chatPath)) {
      // In real implementation, we'd use sqlite3 to read the database
      return {
        found: true,
        path: chatPath,
        note: 'Messages database found - requires parsing'
      };
    }
    
    return { error: 'Messages database not accessible' };
  } catch (e) {
    return { error: e.message };
  }
}

// Scan Documents folder
function scanDocuments() {
  const docsPath = path.join(os.homedir(), 'Documents');
  const documents = [];
  
  try {
    if (!fs.existsSync(docsPath)) {
      return { error: 'Documents folder not found' };
    }
    
    function scanDirectory(dir, depth = 0) {
      if (depth > 2) return; // Limit depth
      
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        if (item.startsWith('.')) continue; // Skip hidden
        
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          scanDirectory(fullPath, depth + 1);
        } else if (
          item.endsWith('.txt') ||
          item.endsWith('.md') ||
          item.endsWith('.docx') ||
          item.endsWith('.pdf')
        ) {
          documents.push({
            name: item,
            path: fullPath,
            size: stat.size,
            modified: stat.mtime
          });
        }
      }
    }
    
    scanDirectory(docsPath);
    
    return {
      count: documents.length,
      documents: documents.slice(0, 50) // Limit
    };
  } catch (e) {
    return { error: e.message };
  }
}

// IPC handlers for scanning
function setupScanningHandlers(mainWindow) {
  // Quick scan for initial check
  ipcMain.handle('scan-mail', async () => {
    return scanMailData();
  });
  
  // Full background scan with progress
  ipcMain.handle('scan-all-mail', async () => {
    return scanAllMailData(mainWindow);
  });
  
  ipcMain.handle('scan-messages', async () => {
    return scanMessagesData();
  });
  
  ipcMain.handle('scan-documents', async () => {
    return scanDocuments();
  });
  
  ipcMain.handle('get-home-directory', async () => {
    return os.homedir();
  });
}

// Local AI via Ollama
async function queryLocalAI(prompt, model = 'llama3.1') {
  try {
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        prompt: prompt,
        stream: false
      })
    });
    
    const data = await response.json();
    return data.response;
  } catch (e) {
    return { error: 'Ollama not running', message: e.message };
  }
}

function setupLocalAIHandlers() {
  ipcMain.handle('query-local-ai', async (event, prompt, model) => {
    return queryLocalAI(prompt, model);
  });
  
  ipcMain.handle('check-ollama', async () => {
    try {
      const response = await fetch('http://localhost:11434/api/tags');
      const data = await response.json();
      return { running: true, models: data.models || [] };
    } catch (e) {
      return { running: false };
    }
  });
}

module.exports = {
  setupFullDiskAccessHandlers,
  setupScanningHandlers,
  setupLocalAIHandlers,
  scanMailData,
  scanMessagesData,
  scanDocuments,
  scanAllMailData
};
