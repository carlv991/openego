/**
 * OpenEgo V2.0.0 - Clean Architecture
 * API-first approach with universal paste support
 */

const { app, BrowserWindow, ipcMain, clipboard, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { autoUpdater } = require('electron-updater');

let mainWindow;

// Persona data storage
const PERSONA_PATH = path.join(os.homedir(), '.openego_persona_v2.json');
const SETTINGS_PATH = path.join(os.homedir(), '.openego_settings_v2.json');

function loadPersona() {
  try {
    if (fs.existsSync(PERSONA_PATH)) {
      return JSON.parse(fs.readFileSync(PERSONA_PATH, 'utf8'));
    }
  } catch (e) {
    console.error('[Main] Error loading persona:', e);
  }
  return null;
}

function savePersona(persona) {
  try {
    fs.writeFileSync(PERSONA_PATH, JSON.stringify(persona, null, 2));
    return true;
  } catch (e) {
    console.error('[Main] Error saving persona:', e);
    return false;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'OpenEgo V2.0',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('src/index.html');
  
  // Open DevTools in development
  // mainWindow.webContents.openDevTools();
}

// ==================== IPC HANDLERS ====================

// Get persona data
ipcMain.handle('get-persona', async () => {
  return { success: true, persona: loadPersona() };
});

// Save persona data
ipcMain.handle('save-persona', async (event, persona) => {
  return { success: savePersona(persona) };
});

// Copy text to clipboard
ipcMain.handle('copy-to-clipboard', async (event, text) => {
  try {
    clipboard.writeText(text);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Get clipboard text
ipcMain.handle('get-clipboard', async () => {
  try {
    return { success: true, text: clipboard.readText() };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Open external URL
ipcMain.handle('open-external', async (event, url) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ==================== GMAIL OAUTH (Phase 1) ====================
// Placeholder for Gmail integration
ipcMain.handle('gmail-connect', async () => {
  return { 
    success: false, 
    message: 'Gmail integration coming in next update. Use manual paste for now.' 
  };
});

// Settings storage
const SETTINGS_PATH = path.join(os.homedir(), '.openego_settings_v2.json');

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    }
  } catch (e) {
    console.error('[Main] Error loading settings:', e);
  }
  return {};
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
    return true;
  } catch (e) {
    console.error('[Main] Error saving settings:', e);
    return false;
  }
}

// ==================== SETTINGS IPC ====================
ipcMain.handle('get-settings', async () => {
  return { success: true, settings: loadSettings() };
});

ipcMain.handle('save-settings', async (event, settings) => {
  return { success: saveSettings(settings) };
});

// ==================== AI RESPONSE GENERATION ====================
ipcMain.handle('generate-response', async (event, { message, context, style }) => {
  const settings = loadSettings();
  
  if (!settings.apiKey) {
    return {
      success: false,
      error: 'Please configure AI settings first (Settings → AI Model)'
    };
  }
  
  const provider = settings.aiProvider || 'openai';
  
  try {
    let responseText = '';
    
    if (provider === 'openai') {
      // Call OpenAI API
      const https = require('https');
      
      const postData = JSON.stringify({
        model: settings.model || 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a helpful assistant that writes email and message replies. Be concise, professional, and match the tone of the incoming message. Style: ${style || 'professional'}`
          },
          {
            role: 'user',
            content: `Write a reply to this message:\n\n${message}`
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      });
      
      const result = await new Promise((resolve, reject) => {
        const req = https.request({
          hostname: 'api.openai.com',
          path: '/v1/chat/completions',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${settings.apiKey}`
          }
        }, (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              if (parsed.error) {
                reject(new Error(parsed.error.message));
              } else if (parsed.choices && parsed.choices[0]) {
                resolve(parsed.choices[0].message.content);
              } else {
                reject(new Error('Invalid response from OpenAI'));
              }
            } catch (e) {
              reject(e);
            }
          });
        });
        
        req.on('error', reject);
        req.write(postData);
        req.end();
      });
      
      responseText = result;
      
    } else if (provider === 'anthropic') {
      // Call Anthropic Claude API
      const https = require('https');
      
      const postData = JSON.stringify({
        model: settings.model || 'claude-3-haiku-20240307',
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: `Write a professional reply to this message:\n\n${message}`
          }
        ]
      });
      
      const result = await new Promise((resolve, reject) => {
        const req = https.request({
          hostname: 'api.anthropic.com',
          path: '/v1/messages',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': settings.apiKey,
            'anthropic-version': '2023-06-01'
          }
        }, (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              if (parsed.error) {
                reject(new Error(parsed.error.message));
              } else if (parsed.content && parsed.content[0]) {
                resolve(parsed.content[0].text);
              } else {
                reject(new Error('Invalid response from Anthropic'));
              }
            } catch (e) {
              reject(e);
            }
          });
        });
        
        req.on('error', reject);
        req.write(postData);
        req.end();
      });
      
      responseText = result;
      
    } else {
      return {
        success: false,
        error: `Provider ${provider} not yet implemented. Use OpenAI or Anthropic.`
      };
    }
    
    return {
      success: true,
      text: responseText,
      confidence: 0.85
    };
    
  } catch (e) {
    console.error('[Main] AI generation error:', e);
    return {
      success: false,
      error: e.message || 'Failed to generate response'
    };
  }
});

// ==================== APP LIFECYCLE ====================

app.whenReady().then(() => {
  createWindow();
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Auto-updater
autoUpdater.checkForUpdatesAndNotify();
