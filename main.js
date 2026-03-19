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

  // Setup tray
  setupTray();
}

function setupTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'src-tauri/icons/icon.png'));
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show OpenEgo', click: () => mainWindow.show() },
    { label: 'Hide', click: () => mainWindow.hide() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]);
  
  tray.setContextMenu(contextMenu);
  tray.setToolTip('OpenEgo');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ==================== AUTO UPDATER ====================

// Check for updates
function checkForUpdates() {
  autoUpdater.checkForUpdatesAndNotify();
}

// Auto updater events
autoUpdater.on('checking-for-update', () => {
  console.log('Checking for update...');
});

autoUpdater.on('update-available', (info) => {
  console.log('Update available:', info);
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
  console.log('Update downloaded:', info);
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

// IPC handler for manual update check
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

// Check for updates on startup (after 5 seconds)
setTimeout(checkForUpdates, 5000);
