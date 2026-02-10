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
  zima: {
    start: 'planner:zima:start',
    stop: 'planner:zima:stop',
    sendCommand: 'planner:zima:sendCommand',
    status: 'planner:zima:status',
    events: {
      data: 'planner:zima:data',
      status: 'planner:zima:statusChanged',
      error: 'planner:zima:error',
    },
  },
};

const subscribe = (channel, listener) => {
  const wrapped = (_event, payload) => {
    listener(payload);
  };
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
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
  zima: {
    start: (config) => ipcRenderer.invoke(CHANNELS.zima.start, config),
    stop: () => ipcRenderer.invoke(CHANNELS.zima.stop),
    sendCommand: (command) => ipcRenderer.invoke(CHANNELS.zima.sendCommand, command),
    status: () => ipcRenderer.invoke(CHANNELS.zima.status),
    onData: (listener) => subscribe(CHANNELS.zima.events.data, listener),
    onStatus: (listener) => subscribe(CHANNELS.zima.events.status, listener),
    onError: (listener) => subscribe(CHANNELS.zima.events.error, listener),
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);
