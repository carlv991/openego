const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } = require('electron');
const path = require('path');
const { 
  setupFullDiskAccessHandlers, 
  setupScanningHandlers,
  setupLocalAIHandlers 
} = require('./electron-modules');

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
