const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tokenmeter', {
  getUsageData: () => ipcRenderer.invoke('get-usage-data'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowMaximize: () => ipcRenderer.invoke('window-maximize'),
  windowClose: () => ipcRenderer.invoke('window-close'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  onUsageUpdated: (cb) => ipcRenderer.on('usage-updated', (_e, data) => cb(data)),
  removeUsageUpdatedListener: () => ipcRenderer.removeAllListeners('usage-updated'),
});
