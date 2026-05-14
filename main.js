const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage, Notification } = require('electron');
const path = require('path');
const Store = require('electron-store');
const { scan } = require('./src/scanner');

const store = new Store({ name: 'tokenmeter-config' });

let mainWindow = null;
let tray = null;
let refreshTimer = null;
let lastUsageData = null;

const DEFAULT_SETTINGS = {
  refreshInterval: 60,
  lookbackDays: 14,
  claudePath: '',
  geminiPath: '',
  idleTimeout: 60,
  openAtLogin: false,
  dailyCostAlert: 0,
};

function fmtTokensTray(n) {
  if (!n) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K';
  return String(n);
}

function createTrayImage() {
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    buf[i * 4 + 0] = 232;
    buf[i * 4 + 1] = 101;
    buf[i * 4 + 2] = 10;
    buf[i * 4 + 3] = 255;
  }
  return nativeImage.createFromBuffer(buf, { width: size, height: size });
}

function createTray() {
  tray = new Tray(createTrayImage());
  tray.setToolTip('Tokenmeter');
  const menu = Menu.buildFromTemplate([
    { label: 'Open Tokenmeter', click: () => mainWindow?.show() },
    { label: 'Refresh', click: () => runScan() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => mainWindow?.show());
}

function getSettings() {
  return { ...DEFAULT_SETTINGS, ...store.get('settings', {}) };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 720,
    height: 600,
    minWidth: 580,
    minHeight: 480,
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
    if (tray) {
      const todayTokens = data.claude?.daily?.[data.claude.daily.length - 1]?.totalTokens || 0;
      tray.setToolTip(`Tokenmeter · Today: ${fmtTokensTray(todayTokens)} tokens`);
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

ipcMain.handle('show-notification', (_e, { title, body }) => {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
});

app.whenReady().then(() => {
  createWindow();
  createTray();
  startRefreshTimer();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
