const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const Store = require('electron-store');
const { scan } = require('./src/scanner');

const store = new Store({ name: 'tokenmeter-config' });

let mainWindow = null;
let refreshTimer = null;
let lastUsageData = null;

const DEFAULT_SETTINGS = {
  refreshInterval: 60,
  lookbackDays: 14,
  claudePath: '',
  geminiPath: '',
  idleTimeout: 60,
  openAtLogin: false,
};

function getSettings() {
  return { ...DEFAULT_SETTINGS, ...store.get('settings', {}) };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    frame: false,
    backgroundColor: '#07070d',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
    titleBarStyle: 'hidden',
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

async function runScan() {
  const settings = getSettings();
  try {
    const data = await scan(settings);
    lastUsageData = data;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('usage-updated', data);
    }
    return data;
  } catch (e) {
    console.error('Scan error:', e);
    return lastUsageData;
  }
}

function startRefreshTimer() {
  if (refreshTimer) clearInterval(refreshTimer);
  const settings = getSettings();
  const intervalMs = (settings.refreshInterval || 60) * 1000;
  refreshTimer = setInterval(runScan, intervalMs);
}

// IPC handlers
ipcMain.handle('get-usage-data', async () => {
  return await runScan();
});

ipcMain.handle('get-settings', () => getSettings());

ipcMain.handle('save-settings', (_e, newSettings) => {
  store.set('settings', { ...getSettings(), ...newSettings });
  startRefreshTimer();
  return true;
});

ipcMain.handle('window-minimize', () => mainWindow?.minimize());
ipcMain.handle('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.handle('window-close', () => mainWindow?.close());
ipcMain.handle('open-external', (_e, url) => shell.openExternal(url));

app.whenReady().then(() => {
  createWindow();
  startRefreshTimer();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
