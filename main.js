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

// ==================== AI RESPONSE GENERATION ====================
ipcMain.handle('generate-response', async (event, { message, context, style }) => {
  // This will be expanded to call actual AI API
  // For now, return a placeholder
  const persona = loadPersona();
  
  if (!persona || !persona.apiKey) {
    return {
      success: false,
      error: 'Please configure AI settings first (Settings → AI Model)'
    };
  }
  
  // TODO: Call actual AI API here
  return {
    success: true,
    text: `This is a placeholder response. AI integration will be added in the next update.\n\nMessage: "${message.substring(0, 50)}..."\nStyle: ${style || 'default'}`,
    confidence: 0.85
  };
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
