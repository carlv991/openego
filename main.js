const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, dialog, Notification } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const { 
  setupFullDiskAccessHandlers, 
  setupScanningHandlers,
  setupLocalAIHandlers,
  setupFeedbackHandlers,
  setupAITrainingHandlers
} = require('./electron-modules');
const { setupCommunicationScanner } = require('./communication-scanner');
const { setupEmailScannerHandlers } = require('./email-scanner');
const { setupMessageMonitor } = require('./message-monitor-safe');
const { setupAIResponseHandlers } = require('./ai-response-generator');
const { setupAppleMailHandlers } = require('./apple-mail-sender');
const { setupTelegramSenderHandlers } = require('./telegram-sender');
const { setupTrainingEngine } = require('./training-engine');
const { setupSmartFeatures } = require('./smart-features');
const { setupMultiChannelHandlers } = require('./multi-channel-sender');
const { setupErrorRecoveryHandlers } = require('./error-recovery');
const { OpenEgoCore } = require('./openego-core');

let mainWindow;
let tray;
let menuBarWindow;
let ipcHandlersRegistered = false;
let openegoCore;// OpenEgo Core Controller

// Smart Suggest - Background monitoring
let smartSuggestEnabled = true;
let lastCheckedEmail = null;
let smartSuggestInterval = null;

// Register retrain-persona handler directly in main.js to ensure it works
ipcMain.handle('retrain-persona', async (event) => {
  console.log('[Main] Retrain persona handler called');
  
  // Return immediately and process in background to prevent UI freezing
  return new Promise(async (resolve) => {
    try {
      const { PersonaEngine } = require('./persona-engine');
      const { CommunicationScanner } = require('./communication-scanner');
      
      console.log('[Main] Creating scanner...');
      const scanner = new CommunicationScanner(mainWindow);
      
      // Use setImmediate to yield control back to the event loop
      setImmediate(async () => {
        try {
          console.log('[Main] Starting email scan...');
          const results = await scanner.scanMail();
          console.log(`[Main] Scan complete: ${results?.emails?.length || 0} emails`);
          
          if (!results.emails || results.emails.length === 0) {
            resolve({ 
              success: false, 
              error: 'No emails found. Make sure you have emails in Apple Mail and Full Disk Access is granted.'
            });
            return;
          }
          
          console.log('[Main] Building persona...');
          const engine = new PersonaEngine();
          
          // Process emails in chunks to prevent blocking
          const processChunk = (startIdx) => {
            const chunkSize = 25;
            const endIdx = Math.min(startIdx + chunkSize, results.emails.length);
            
            for (let i = startIdx; i < endIdx; i++) {
              engine.analyzeEmail({
                content: results.emails[i].body || results.emails[i].preview || results.emails[i].content || '',
                timestamp: new Date(results.emails[i].date || Date.now())
              });
            }
            
            if (endIdx < results.emails.length) {
              // More emails to process - schedule next chunk
              setTimeout(() => processChunk(endIdx), 10);
            } else {
              // Done processing
              console.log('[Main] Saving persona...');
              engine.savePersona();
              
              console.log('[Main] Retrain complete!');
              resolve({ 
                success: true, 
                emailsAnalyzed: results.emails.length,
                persona: engine.generatePersonaProfile()
              });
            }
          };
          
          // Start processing
          processChunk(0);
          
        } catch (e) {
          console.error('[Main] Retrain error in background:', e);
          resolve({ success: false, error: e.message, stack: e.stack });
        }
      });
    } catch (e) {
      console.error('[Main] Retrain error:', e);
      resolve({ success: false, error: e.message, stack: e.stack });
    }
  });
});
console.log('[Main] retrain-persona handler registered directly in main.js');

function createWindow() {
  // Prevent creating multiple windows
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'OpenEgo - Your Personal Digital Twin',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      webSecurity: false
    },
    icon: path.join(__dirname, 'src-tauri/icons/icon.png')
  });

  // Load the HTML file
  mainWindow.loadFile('src/index.html');

  // Setup IPC handlers (only once)
  if (!ipcHandlersRegistered) {
    console.log('[Main] Setting up IPC handlers...');
    setupFullDiskAccessHandlers();
    console.log('[Main] Full Disk Access handlers ready');
    setupScanningHandlers(mainWindow);
    console.log('[Main] Scanning handlers ready');
    setupLocalAIHandlers();
    console.log('[Main] Local AI handlers ready');
    setupFeedbackHandlers();
    console.log('[Main] Feedback handlers ready');
    
    // Setup AI Training with error handling
    try {
      setupAITrainingHandlers();
      console.log('[Main] AI Training handlers ready');
    } catch (e) {
      console.error('[Main] AI Training handlers failed:', e);
    }
    
    setupCommunicationScanner(mainWindow);
    console.log('[Main] Communication scanner ready');
    setupEmailScannerHandlers(mainWindow);
    console.log('[Main] Email scanner handlers ready');
    
    // Setup new message monitor and AI response handlers
    setupMessageMonitor(mainWindow);
    console.log('[Main] Message monitor ready');
    setupAIResponseHandlers();
    setupAppleMailHandlers();
    console.log('[Main] Apple Mail handlers ready');
    setupTelegramSenderHandlers();
    setupTrainingEngine();
    console.log('[Main] Training engine ready');
    setupSmartFeatures();
    console.log('[Main] Smart features ready');
    setupMultiChannelHandlers();
    console.log('[Main] Multi-channel handlers ready');
    setupErrorRecoveryHandlers();
    console.log('[Main] Error recovery ready');
    console.log('[Main] Telegram sender handlers ready');
    console.log('[Main] AI response handlers ready');
    
    // Initialize OpenEgo Core Controller
    openegoCore = new OpenEgoCore(mainWindow);
    console.log('[Main] OpenEgo Core initialized');
    ipcHandlersRegistered = true;
    console.log('[Main] All IPC handlers registered');
  }

  // Setup menu bar (top right)
  setupMenuBar();
  
  // Setup tray (dock)
  setupTray();
  
  // Hide dock icon on macOS (keep only menu bar)
  if (process.platform === 'darwin') {
    app.dock.hide();
  }
}

// Setup Menu Bar icon (top right, next to battery/wifi)
function setupMenuBar() {
  // Create a template icon for menu bar (16x16, black/white for macOS)
  const iconPath = path.join(__dirname, 'src-tauri/icons/icon.png');
  
  let icon;
  try {
    icon = nativeImage.createFromPath(iconPath);
    // Resize for menu bar
    icon = icon.resize({ width: 16, height: 16 });
    // For macOS dark mode support
    icon.setTemplateImage(true);
  } catch (e) {
    console.error('Failed to load menu bar icon:', e);
    // Create a blank icon as fallback
    icon = nativeImage.createEmpty();
  }
  
  // Create new tray if doesn't exist
  if (!tray) {
    tray = new Tray(icon);
  } else {
    tray.setImage(icon);
  }
  
  // Build context menu
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: 'OpenEgo',
      enabled: false,
      icon: icon.resize({ width: 16, height: 16 })
    },
    { type: 'separator' },
    { 
      label: 'Show Dashboard',
      accelerator: 'CmdOrCtrl+D',
      click: () => {
        showMainWindow();
      }
    },
    { 
      label: 'New Message',
      accelerator: 'CmdOrCtrl+N',
      click: () => {
        showMainWindow();
        // Could trigger new message action here
      }
    },
    { type: 'separator' },
    { 
      label: 'Settings',
      accelerator: 'CmdOrCtrl+,',
      click: () => {
        showMainWindow();
        // Send IPC to open settings
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('open-settings');
        }
      }
    },
    { 
      label: 'Check for Updates',
      click: () => {
        checkForUpdates();
      }
    },
    { type: 'separator' },
    { 
      label: 'Start at Login',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (menuItem) => {
        app.setLoginItemSettings({
          openAtLogin: menuItem.checked,
          openAsHidden: true
        });
      }
    },
    { type: 'separator' },
    { 
      label: 'Quit',
      accelerator: 'CmdOrCtrl+Q',
      click: () => {
        app.quit();
      }
    }
  ]);
  
  tray.setContextMenu(contextMenu);
  tray.setToolTip('OpenEgo - Your Personal Digital Twin');
  
  // Click on icon to show/hide
  tray.on('click', () => {
    toggleWindow();
  });
  
  // Double-click to show
  tray.on('double-click', () => {
    showMainWindow();
  });
  
  // Right-click for menu
  tray.on('right-click', () => {
    tray.popUpContextMenu();
  });
}

// Setup traditional tray (for dock on macOS, system tray on Windows/Linux)
function setupTray() {
  // On macOS, the menu bar IS the tray, so we skip this
  if (process.platform === 'darwin') return;
  
  // Windows/Linux tray setup
  const icon = nativeImage.createFromPath(path.join(__dirname, 'src-tauri/icons/icon.png'));
  const trayIcon = new Tray(icon.resize({ width: 16, height: 16 }));
  
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show OpenEgo', click: () => showMainWindow() },
    { label: 'Hide', click: () => hideMainWindow() },
    { type: 'separator' },
    { label: 'Settings', click: () => {
      showMainWindow();
      if (mainWindow) mainWindow.webContents.send('open-settings');
    }},
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]);
  
  trayIcon.setContextMenu(contextMenu);
  trayIcon.setToolTip('OpenEgo');
}

// Show/hide main window
function toggleWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  
  if (mainWindow.isVisible()) {
    hideMainWindow();
  } else {
    showMainWindow();
  }
}

function showMainWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  
  mainWindow.show();
  mainWindow.focus();
  
  // Show dock icon temporarily on macOS
  if (process.platform === 'darwin') {
    app.dock.show();
  }
}

function hideMainWindow() {
  if (mainWindow) {
    mainWindow.hide();
    
    // Hide dock icon on macOS
    if (process.platform === 'darwin') {
      app.dock.hide();
    }
  }
}

// Handle IPC from renderer
ipcMain.on('hide-window', () => {
  hideMainWindow();
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  // On macOS, keep app running in menu bar
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else {
    showMainWindow();
  }
});

// Prevent app from quitting when window is closed (macOS menu bar apps)
app.on('before-quit', () => {
  // Allow quit
});

// ==================== AUTO UPDATER ====================

function checkForUpdates() {
  autoUpdater.checkForUpdatesAndNotify();
}

autoUpdater.on('checking-for-update', () => {
  console.log('Checking for update...');
});

autoUpdater.on('update-available', (info) => {
  dialog.showMessageBox({
    type: 'info',
    title: 'Update Available',
    message: 'A new version of OpenEgo is available!',
    detail: `Version ${info.version} is ready to download.`,
    buttons: ['Download & Install', 'Later'],
    defaultId: 0
  }).then((result) => {
    if (result.response === 0) {
      autoUpdater.downloadUpdate();
    }
  });
});

autoUpdater.on('update-not-available', () => {
  console.log('Update not available');
});

autoUpdater.on('error', (err) => {
  console.log('Error in auto-updater:', err);
});

autoUpdater.on('download-progress', (progressObj) => {
  console.log(`Download progress: ${progressObj.percent}%`);
});

autoUpdater.on('update-downloaded', (info) => {
  dialog.showMessageBox({
    type: 'info',
    title: 'Update Ready',
    message: 'Update downloaded successfully!',
    detail: 'OpenEgo will restart to apply the update.',
    buttons: ['Restart Now', 'Later'],
    defaultId: 0
  }).then((result) => {
    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });
});

ipcMain.handle('check-for-updates', async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    return { 
      success: true, 
      version: result?.updateInfo?.version || null,
      available: !!result?.updateInfo?.version
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

setTimeout(checkForUpdates, 5000);

// ==================== SMART SUGGEST ====================
// Proactive reply suggestions based on incoming emails

// Start background monitoring for Smart Suggest
function startSmartSuggestMonitoring() {
  // Performance fix: Disabled automatic monitoring to prevent freezing
  // User can manually check for updates instead
  console.log('[Smart Suggest] Auto-monitoring disabled for performance');
  return;
  
  /* Original code - disabled for performance
  if (smartSuggestInterval) {
    clearInterval(smartSuggestInterval);
  }
  
  smartSuggestInterval = setInterval(() => {
    if (smartSuggestEnabled) {
      checkForNewEmails();
    }
  }, 30000);
  
  console.log('[Smart Suggest] Background monitoring started');
  */
}

// Check for new emails that need replies
async function checkForNewEmails() {
  try {
    // This would integrate with Apple Mail via AppleScript
    // For now, we'll simulate with a placeholder
    const { exec } = require('child_process');
    
    // AppleScript to get latest unread emails
    const script = `
      tell application "Mail"
        set unreadMessages to {}
        repeat withacct in accounts
          set mailboxList to mailboxes of acct
          repeat with mb in mailboxList
            set msgs to messages of mb whose read status is false
            repeat with msg in msgs
              set msgData to {subject:subject of msg, sender:(sender of msg), content:content of msg, id:id of msg}
              set end of unreadMessages to msgData
              if length of unreadMessages >= 5 then exit repeat
            end repeat
            if length of unreadMessages >= 5 then exit repeat
          end repeat
          if length of unreadMessages >= 5 then exit repeat
        end repeat
        return unreadMessages
      end tell
    `;
    
    // Skip if no access to Mail
    // In production, this would actually query Mail app
    
  } catch (e) {
    console.log('[Smart Suggest] Email check skipped:', e.message);
  }
}

// Show Smart Suggest notification
function showSmartSuggestNotification(emailData, suggestion) {
  if (!smartSuggestEnabled) return;
  
  const notification = new Notification({
    title: '💡 OpenEgo Suggestion',
    subtitle: `Reply to ${emailData.sender}`,
    body: suggestion.substring(0, 100) + (suggestion.length > 100 ? '...' : ''),
    icon: path.join(__dirname, 'src-tauri/icons/icon.png'),
    hasReply: false,
    actions: [
      { type: 'button', text: 'Reply with OpenEgo' },
      { type: 'button', text: 'Dismiss' }
    ],
    sound: 'default'
  });
  
  notification.on('action', (event, index) => {
    if (index === 0) {
      // User clicked "Reply with OpenEgo"
      autoReplyToEmail(emailData, suggestion);
    }
  });
  
  notification.on('click', () => {
    // Click notification to show main window with suggestion
    showMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send('show-suggestion', { email: emailData, suggestion });
    }
  });
  
  notification.show();
  
  // Log for analytics
  console.log('[Smart Suggest] Notification shown for:', emailData.sender);
}

// Auto-fill reply in Mail app
async function autoReplyToEmail(emailData, suggestion) {
  try {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    // Escape the suggestion for AppleScript
    const escapedSuggestion = suggestion
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '');
    
    // AppleScript to find message by subject/sender and open reply
    // Note: This searches by subject since message ID may not persist
    const script = `
      tell application "Mail"
        activate
        
        -- Search for the message by subject
        set targetSubject to "${emailData.subject.replace(/"/g, '\\"')}"
        set targetSender to "${emailData.sender.replace(/"/g, '\\"')}"
        set foundMessage to null
        
        -- Search in inbox
        repeat with msg in messages of inbox
          if subject of msg contains targetSubject then
            set foundMessage to msg
            exit repeat
          end if
        end repeat
        
        if foundMessage is not null then
          -- Open the message first
          set selected messages of front message viewer to {foundMessage}
          
          -- Create reply
          set replyMessage to reply foundMessage
          
          -- Set the content
          set content of replyMessage to "${escapedSuggestion}"
          
          -- Activate compose window
          activate
          
          return "Reply created successfully"
        else
          return "Message not found - may have been moved or deleted"
        end if
      end tell
    `;
    
    // Execute the AppleScript
    console.log('[Smart Suggest] Executing AppleScript to auto-fill reply...');
    const { stdout, stderr } = await execAsync(`osascript -e '${script}'`);
    
    if (stderr) {
      console.error('[Smart Suggest] AppleScript stderr:', stderr);
    }
    
    console.log('[Smart Suggest] AppleScript result:', stdout);
    
    // Show success notification
    const confirmNotification = new Notification({
      title: '✅ Reply Auto-Filled',
      body: 'Check your Mail app - the reply is ready to send!',
      icon: path.join(__dirname, 'src-tauri/icons/icon.png'),
      sound: 'default'
    });
    confirmNotification.show();
    
    // Also show in main window
    showMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send('auto-reply-success', { 
        email: emailData, 
        suggestion,
        message: 'Reply automatically filled in Mail app!'
      });
    }
    
  } catch (e) {
    console.error('[Smart Suggest] Auto-reply failed:', e);
    
    // Fallback to clipboard method
    const clipboard = require('electron').clipboard;
    clipboard.writeText(suggestion);
    
    // Show fallback notification
    const fallbackNotification = new Notification({
      title: '⚠️ Auto-Fill Failed',
      body: 'Reply copied to clipboard instead. Please paste manually.',
      icon: path.join(__dirname, 'src-tauri/icons/icon.png')
    });
    fallbackNotification.show();
    
    // Show in main window
    showMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send('auto-reply-fallback', { 
        email: emailData, 
        suggestion,
        error: e.message
      });
    }
  }
}

// IPC handlers for Smart Suggest
ipcMain.handle('smart-suggest:enable', () => {
  smartSuggestEnabled = true;
  startSmartSuggestMonitoring();
  return { enabled: true };
});

ipcMain.handle('smart-suggest:disable', () => {
  smartSuggestEnabled = false;
  if (smartSuggestInterval) {
    clearInterval(smartSuggestInterval);
  }
  return { enabled: false };
});

ipcMain.handle('smart-suggest:status', () => {
  return { enabled: smartSuggestEnabled };
});

// Test Smart Suggest notification (for demo/testing)
ipcMain.handle('smart-suggest:test', async () => {
  const testEmail = {
    subject: 'Lunch today?',
    sender: 'Scott <scott@example.com>',
    content: 'Hey Vic, are you free to grab lunch at 12:00 at Ithaki?',
    id: 'test-message-id'
  };
  
  const testSuggestion = "Sorry Scott, I'm all booked today with meetings. How about tomorrow at the same time? Or we could do dinner instead if that works better for you.";
  
  showSmartSuggestNotification(testEmail, testSuggestion);
  
  return { success: true, message: 'Test notification shown' };
});

// Start monitoring when app launches
app.whenReady().then(() => {
  // setTimeout(startSmartSuggestMonitoring, 10000); // Disabled for performance
});
