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

// Scan Mail app data
function scanMailData() {
  const mailPath = path.join(os.homedir(), 'Library/Mail');
  const emails = [];
  
  try {
    if (!fs.existsSync(mailPath)) {
      return { error: 'Mail folder not found' };
    }
    
    // Recursively find .emlx files (Apple Mail format)
    function scanDirectory(dir) {
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          scanDirectory(fullPath);
        } else if (item.endsWith('.emlx') || item.endsWith('.eml')) {
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            // Extract basic email data (simplified parsing)
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
      emails: emails.slice(0, 100) // Limit to first 100
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
function setupScanningHandlers() {
  ipcMain.handle('scan-mail', async () => {
    return scanMailData();
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
  scanDocuments
};
