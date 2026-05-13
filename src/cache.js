// Incremental scan cache — tracks mtime of each JSONL file so we only re-parse changed files.
// Uses electron-store so it persists across app launches.

let store = null;

function getStore() {
  if (!store) {
    const Store = require('electron-store');
    store = new Store({ name: 'scan-cache', cwd: undefined });
  }
  return store;
}

function getFileMtime(filePath) {
  return getStore().get(`mtimes.${filePath.replace(/\\/g, '/')}`, 0);
}

function setFileMtime(filePath, mtime) {
  getStore().set(`mtimes.${filePath.replace(/\\/g, '/')}`, mtime);
}

function clearCache() {
  getStore().clear();
}

module.exports = { getFileMtime, setFileMtime, clearCache };
