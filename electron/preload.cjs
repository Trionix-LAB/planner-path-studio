const { contextBridge, ipcRenderer, webUtils } = require('electron');

const CHANNELS = {
  pickDirectory: 'planner:pickDirectory',
  fileStore: {
    exists: 'planner:fileStore:exists',
    readText: 'planner:fileStore:readText',
    writeText: 'planner:fileStore:writeText',
    appendText: 'planner:fileStore:appendText',
    flush: 'planner:fileStore:flush',
    remove: 'planner:fileStore:remove',
    list: 'planner:fileStore:list',
    stat: 'planner:fileStore:stat',
  },
  settings: {
    readJson: 'planner:settings:readJson',
    writeJson: 'planner:settings:writeJson',
    remove: 'planner:settings:remove',
  },
  raster: {
    convertTiffBase64ToPngBase64: 'planner:raster:convertTiffBase64ToPngBase64',
    readSiblingTfwTextByTifPath: 'planner:raster:readSiblingTfwTextByTifPath',
  },
  lifecycle: {
    prepareClose: 'planner:lifecycle:prepareClose',
    prepareCloseResult: 'planner:lifecycle:prepareCloseResult',
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
  gnss: {
    start: 'planner:gnss:start',
    stop: 'planner:gnss:stop',
    status: 'planner:gnss:status',
    events: {
      data: 'planner:gnss:data',
      status: 'planner:gnss:statusChanged',
      error: 'planner:gnss:error',
    },
  },
  gnssCom: {
    start: 'planner:gnssCom:start',
    stop: 'planner:gnssCom:stop',
    status: 'planner:gnssCom:status',
    listPorts: 'planner:gnssCom:listPorts',
    events: {
      data: 'planner:gnssCom:data',
      status: 'planner:gnssCom:statusChanged',
      error: 'planner:gnssCom:error',
    },
  },
  rwltCom: {
    start: 'planner:rwltCom:start',
    stop: 'planner:rwltCom:stop',
    status: 'planner:rwltCom:status',
    listPorts: 'planner:rwltCom:listPorts',
    events: {
      data: 'planner:rwltCom:data',
      status: 'planner:rwltCom:statusChanged',
      error: 'planner:rwltCom:error',
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
    appendText: (path, content) => ipcRenderer.invoke(CHANNELS.fileStore.appendText, path, content),
    flush: (path) => ipcRenderer.invoke(CHANNELS.fileStore.flush, path),
    remove: (path) => ipcRenderer.invoke(CHANNELS.fileStore.remove, path),
    list: (prefix) => ipcRenderer.invoke(CHANNELS.fileStore.list, prefix),
    stat: (path) => ipcRenderer.invoke(CHANNELS.fileStore.stat, path),
  },
  settings: {
    readJson: (key) => ipcRenderer.invoke(CHANNELS.settings.readJson, key),
    writeJson: (key, value) => ipcRenderer.invoke(CHANNELS.settings.writeJson, key, value),
    remove: (key) => ipcRenderer.invoke(CHANNELS.settings.remove, key),
  },
  raster: {
    convertTiffBase64ToPngBase64: (tiffBase64) =>
      ipcRenderer.invoke(CHANNELS.raster.convertTiffBase64ToPngBase64, tiffBase64),
    readSiblingTfwTextByTifPath: (tifPath) =>
      ipcRenderer.invoke(CHANNELS.raster.readSiblingTfwTextByTifPath, tifPath),
    resolveLocalPathForFile: async (file) => {
      try {
        if (!file) return null;
        const path = webUtils?.getPathForFile?.(file);
        if (typeof path === 'string' && path.trim().length > 0) return path;
      } catch {
        // continue with fallback
      }
      try {
        const fallback = file && typeof file.path === 'string' ? file.path : null;
        if (typeof fallback === 'string' && fallback.trim().length > 0) return fallback;
      } catch {
        // ignore
      }
      return null;
    },
  },
  lifecycle: {
    onPrepareClose: (listener) => subscribe(CHANNELS.lifecycle.prepareClose, listener),
    resolvePrepareClose: ({ token, ok, error }) =>
      ipcRenderer.send(CHANNELS.lifecycle.prepareCloseResult, {
        token: typeof token === 'string' ? token : '',
        ok: Boolean(ok),
        error: typeof error === 'string' ? error : '',
      }),
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
  gnss: {
    start: (config) => ipcRenderer.invoke(CHANNELS.gnss.start, config),
    stop: () => ipcRenderer.invoke(CHANNELS.gnss.stop),
    status: () => ipcRenderer.invoke(CHANNELS.gnss.status),
    onData: (listener) => subscribe(CHANNELS.gnss.events.data, listener),
    onStatus: (listener) => subscribe(CHANNELS.gnss.events.status, listener),
    onError: (listener) => subscribe(CHANNELS.gnss.events.error, listener),
  },
  gnssCom: {
    start: (config) => ipcRenderer.invoke(CHANNELS.gnssCom.start, config),
    stop: () => ipcRenderer.invoke(CHANNELS.gnssCom.stop),
    status: () => ipcRenderer.invoke(CHANNELS.gnssCom.status),
    listPorts: () => ipcRenderer.invoke(CHANNELS.gnssCom.listPorts),
    onData: (listener) => subscribe(CHANNELS.gnssCom.events.data, listener),
    onStatus: (listener) => subscribe(CHANNELS.gnssCom.events.status, listener),
    onError: (listener) => subscribe(CHANNELS.gnssCom.events.error, listener),
  },
  rwltCom: {
    start: (config) => ipcRenderer.invoke(CHANNELS.rwltCom.start, config),
    stop: () => ipcRenderer.invoke(CHANNELS.rwltCom.stop),
    status: () => ipcRenderer.invoke(CHANNELS.rwltCom.status),
    listPorts: () => ipcRenderer.invoke(CHANNELS.rwltCom.listPorts),
    onData: (listener) => subscribe(CHANNELS.rwltCom.events.data, listener),
    onStatus: (listener) => subscribe(CHANNELS.rwltCom.events.status, listener),
    onError: (listener) => subscribe(CHANNELS.rwltCom.events.error, listener),
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);
