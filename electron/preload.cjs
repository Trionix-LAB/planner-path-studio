const { contextBridge, ipcRenderer } = require('electron');

const CHANNELS = {
  pickDirectory: 'planner:pickDirectory',
  fileStore: {
    exists: 'planner:fileStore:exists',
    readText: 'planner:fileStore:readText',
    writeText: 'planner:fileStore:writeText',
    remove: 'planner:fileStore:remove',
    list: 'planner:fileStore:list',
  },
  settings: {
    readJson: 'planner:settings:readJson',
    writeJson: 'planner:settings:writeJson',
    remove: 'planner:settings:remove',
  },
};

const api = {
  pickDirectory: (options) => ipcRenderer.invoke(CHANNELS.pickDirectory, options),
  fileStore: {
    exists: (path) => ipcRenderer.invoke(CHANNELS.fileStore.exists, path),
    readText: (path) => ipcRenderer.invoke(CHANNELS.fileStore.readText, path),
    writeText: (path, content) => ipcRenderer.invoke(CHANNELS.fileStore.writeText, path, content),
    remove: (path) => ipcRenderer.invoke(CHANNELS.fileStore.remove, path),
    list: (prefix) => ipcRenderer.invoke(CHANNELS.fileStore.list, prefix),
  },
  settings: {
    readJson: (key) => ipcRenderer.invoke(CHANNELS.settings.readJson, key),
    writeJson: (key, value) => ipcRenderer.invoke(CHANNELS.settings.writeJson, key, value),
    remove: (key) => ipcRenderer.invoke(CHANNELS.settings.remove, key),
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);
