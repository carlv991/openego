const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, dialog } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const { 
  setupFullDiskAccessHandlers, 
  setupScanningHandlers,
  setupLocalAIHandlers 
} = require('./electron-modules');
const { setupCommunicationScanner } = require('./communication-scanner');

let mainWindow;
let tray;
let menuBarWindow;

function createWindow() {
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

  // Setup IPC handlers
  setupFullDiskAccessHandlers();
  setupScanningHandlers(mainWindow);
  setupLocalAIHandlers();
  setupCommunicationScanner(mainWindow);

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
  let icon = nativeImage.createFromPath(iconPath);
  
  // Resize for menu bar
  icon = icon.resize({ width: 16, height: 16 });
  
  // For macOS dark mode support
  icon.setTemplateImage(true);
  
  tray = new Tray(icon);
  
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
