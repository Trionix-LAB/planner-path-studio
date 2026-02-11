const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const dgram = require('dgram');

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
};
const FILE_STORE_ROOT_DIR = 'planner.fs';

const DEFAULT_ZIMA_CONFIG = {
  ipAddress: '127.0.0.1',
  dataPort: 28127,
  commandPort: 28128,
  useCommandPort: false,
};

const DEFAULT_GNSS_CONFIG = {
  ipAddress: '127.0.0.1',
  dataPort: 28128,
};

const normalizeInputPath = (value) => {
  if (typeof value !== 'string') throw new Error('Invalid path');
  const trimmed = value.trim();
  if (!trimmed) throw new Error('Empty path');
  return trimmed;
};

const toForwardSlashes = (value) => value.replace(/\\/g, '/');

const normalizeRelativeFileStorePath = (value) => {
  const normalized = toForwardSlashes(path.posix.normalize(value));
  const trimmed = normalized.replace(/^\.\/+/, '').replace(/^\/+/, '');
  if (!trimmed || trimmed === '.') throw new Error('Empty path');
  if (trimmed === '..' || trimmed.startsWith('../')) {
    throw new Error('Path escapes fileStore root');
  }
  return trimmed;
};

const resolveFileStorePath = (inputPath, userDataPath) => {
  const rawPath = normalizeInputPath(inputPath);
  if (path.isAbsolute(rawPath)) {
    return {
      absolutePath: rawPath,
      isRelative: false,
    };
  }

  const canonicalPath = normalizeRelativeFileStorePath(rawPath);
  const absolutePath = path.join(userDataPath, FILE_STORE_ROOT_DIR, ...canonicalPath.split('/'));
  return {
    absolutePath,
    isRelative: true,
  };
};

const fileStorePathForResponse = (resolvedPath, absolutePath, userDataPath) => {
  if (!resolvedPath.isRelative) {
    return toForwardSlashes(absolutePath);
  }

  const rootPath = path.join(userDataPath, FILE_STORE_ROOT_DIR);
  const relativePath = toForwardSlashes(path.relative(rootPath, absolutePath));
  return normalizeRelativeFileStorePath(relativePath);
};

const ensureParentDir = async (filePath) => {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
};

const readSettingsFile = async (settingsPath) => {
  try {
    const raw = await fs.readFile(settingsPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch {
    return {};
  }
};

const writeSettingsFile = async (settingsPath, data) => {
  await ensureParentDir(settingsPath);
  await fs.writeFile(settingsPath, JSON.stringify(data, null, 2), 'utf8');
};

const clampPort = (value, fallback) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 65535) return fallback;
  return n;
};

const normalizeHost = (value, fallback) => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
};

const normalizeBoolean = (value, fallback) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return fallback;
};

const normalizeZimaConfig = (input) => {
  const source = input && typeof input === 'object' ? input : {};
  return {
    ipAddress: normalizeHost(source.ipAddress, DEFAULT_ZIMA_CONFIG.ipAddress),
    dataPort: clampPort(source.dataPort, DEFAULT_ZIMA_CONFIG.dataPort),
    commandPort: clampPort(source.commandPort, DEFAULT_ZIMA_CONFIG.commandPort),
    useCommandPort: normalizeBoolean(source.useCommandPort, DEFAULT_ZIMA_CONFIG.useCommandPort),
  };
};

const normalizeGnssConfig = (input) => {
  const source = input && typeof input === 'object' ? input : {};
  return {
    ipAddress: normalizeHost(source.ipAddress, DEFAULT_GNSS_CONFIG.ipAddress),
    dataPort: clampPort(source.dataPort, DEFAULT_GNSS_CONFIG.dataPort),
  };
};

const emitToRenderer = (channel, payload) => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, payload);
    }
  }
};

const createZimaUdpBridge = () => {
  let socket = null;
  let status = 'stopped';
  let config = { ...DEFAULT_ZIMA_CONFIG };

  const emitStatus = (nextStatus) => {
    if (status === nextStatus) return;
    status = nextStatus;
    emitToRenderer(CHANNELS.zima.events.status, { status, config });
  };

  const emitError = (message) => {
    emitToRenderer(CHANNELS.zima.events.error, { message, status, config });
  };

  const stop = async () => {
    if (!socket) {
      emitStatus('stopped');
      return { status, config };
    }

    const current = socket;
    socket = null;
    await new Promise((resolve) => {
      try {
        current.close(() => resolve());
      } catch {
        resolve();
      }
    });
    emitStatus('stopped');
    return { status, config };
  };

  const start = async (input) => {
    config = normalizeZimaConfig(input);
    await stop();

    socket = dgram.createSocket('udp4');

    socket.on('message', (buffer, remote) => {
      const message = Buffer.from(buffer).toString('ascii');
      emitToRenderer(CHANNELS.zima.events.data, {
        message,
        receivedAt: Date.now(),
        remote: {
          address: remote.address,
          family: remote.family,
          port: remote.port,
          size: remote.size,
        },
      });
    });

    socket.on('error', (error) => {
      emitStatus('error');
      emitError(error instanceof Error ? error.message : String(error));
    });

    await new Promise((resolve, reject) => {
      socket.once('listening', resolve);
      socket.once('error', reject);
      socket.bind(config.dataPort);
    });

    emitStatus('running');
    return { status, config };
  };

  const sendCommand = async (command) => {
    const payload = typeof command === 'string' ? command.trim() : '';
    if (!payload) {
      throw new Error('Command is empty');
    }
    if (payload.length > 256) {
      throw new Error('Command is too long');
    }

    const sender = dgram.createSocket('udp4');
    const bytes = Buffer.from(payload, 'ascii');

    await new Promise((resolve, reject) => {
      sender.send(bytes, config.commandPort, config.ipAddress, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    }).finally(() => {
      try {
        sender.close();
      } catch {
        // ignore
      }
    });

    return { ok: true };
  };

  const getStatus = () => ({ status, config });

  return {
    start,
    stop,
    sendCommand,
    getStatus,
  };
};

const createGnssUdpBridge = () => {
  let socket = null;
  let status = 'stopped';
  let config = { ...DEFAULT_GNSS_CONFIG };

  const emitStatus = (nextStatus) => {
    if (status === nextStatus) return;
    status = nextStatus;
    emitToRenderer(CHANNELS.gnss.events.status, { status, config });
  };

  const emitError = (message) => {
    emitToRenderer(CHANNELS.gnss.events.error, { message, status, config });
  };

  const stop = async () => {
    if (!socket) {
      emitStatus('stopped');
      return { status, config };
    }

    const current = socket;
    socket = null;
    await new Promise((resolve) => {
      try {
        current.close(() => resolve());
      } catch {
        resolve();
      }
    });
    emitStatus('stopped');
    return { status, config };
  };

  const start = async (input) => {
    config = normalizeGnssConfig(input);
    await stop();

    socket = dgram.createSocket('udp4');

    socket.on('message', (buffer, remote) => {
      const message = Buffer.from(buffer).toString('ascii');
      emitToRenderer(CHANNELS.gnss.events.data, {
        message,
        receivedAt: Date.now(),
        remote: {
          address: remote.address,
          family: remote.family,
          port: remote.port,
          size: remote.size,
        },
      });
    });

    socket.on('error', (error) => {
      emitStatus('error');
      emitError(error instanceof Error ? error.message : String(error));
    });

    await new Promise((resolve, reject) => {
      socket.once('listening', resolve);
      socket.once('error', reject);
      socket.bind(config.dataPort);
    });

    emitStatus('running');
    return { status, config };
  };

  const getStatus = () => ({ status, config });

  return {
    start,
    stop,
    getStatus,
  };
};

const createMainWindow = async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: true,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url).catch(() => {
      // ignore
    });
    return { action: 'deny' };
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl && !app.isPackaged) {
    await win.loadURL(devUrl);
  } else {
    await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  return win;
};

const registerIpcHandlers = () => {
  const userDataPath = app.getPath('userData');
  const settingsPath = path.join(userDataPath, 'settings.json');
  const zimaBridge = createZimaUdpBridge();
  const gnssBridge = createGnssUdpBridge();

  ipcMain.handle(CHANNELS.pickDirectory, async (_event, options) => {
    const title = options?.title;
    const defaultPath = options?.defaultPath;

    const result = await dialog.showOpenDialog({
      title: typeof title === 'string' ? title : undefined,
      defaultPath: typeof defaultPath === 'string' && defaultPath.trim() ? defaultPath.trim() : undefined,
      properties: ['openDirectory', 'createDirectory'],
    });

    if (result.canceled || !result.filePaths?.[0]) return null;
    return result.filePaths[0];
  });

  ipcMain.handle(CHANNELS.fileStore.exists, async (_event, inputPath) => {
    const resolvedPath = resolveFileStorePath(inputPath, userDataPath);
    try {
      await fs.access(resolvedPath.absolutePath);
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle(CHANNELS.fileStore.readText, async (_event, inputPath) => {
    const resolvedPath = resolveFileStorePath(inputPath, userDataPath);
    try {
      return await fs.readFile(resolvedPath.absolutePath, 'utf8');
    } catch {
      return null;
    }
  });

  ipcMain.handle(CHANNELS.fileStore.writeText, async (_event, inputPath, content) => {
    const resolvedPath = resolveFileStorePath(inputPath, userDataPath);
    await ensureParentDir(resolvedPath.absolutePath);
    await fs.writeFile(resolvedPath.absolutePath, String(content ?? ''), 'utf8');
  });

  ipcMain.handle(CHANNELS.fileStore.remove, async (_event, inputPath) => {
    const resolvedPath = resolveFileStorePath(inputPath, userDataPath);
    try {
      await fs.unlink(resolvedPath.absolutePath);
    } catch {
      // ignore
    }
  });

  const walkDir = async (rootDir) => {
    const results = [];
    const entries = await fs.readdir(rootDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(rootDir, entry.name);
      if (entry.isDirectory()) {
        results.push(...(await walkDir(fullPath)));
      } else {
        results.push(fullPath);
      }
    }
    return results;
  };

  ipcMain.handle(CHANNELS.fileStore.list, async (_event, inputPrefix) => {
    const resolvedPrefix = resolveFileStorePath(inputPrefix, userDataPath);
    try {
      const stat = await fs.stat(resolvedPrefix.absolutePath);
      if (stat.isDirectory()) {
        const files = await walkDir(resolvedPrefix.absolutePath);
        return files.map((absolutePath) => fileStorePathForResponse(resolvedPrefix, absolutePath, userDataPath));
      }
      if (stat.isFile()) {
        return [
          fileStorePathForResponse(resolvedPrefix, resolvedPrefix.absolutePath, userDataPath),
        ];
      }
      return [];
    } catch {
      return [];
    }
  });

  ipcMain.handle(CHANNELS.settings.readJson, async (_event, key) => {
    const settings = await readSettingsFile(settingsPath);
    if (!key || typeof key !== 'string') return null;
    return Object.prototype.hasOwnProperty.call(settings, key) ? settings[key] : null;
  });

  ipcMain.handle(CHANNELS.settings.writeJson, async (_event, key, value) => {
    if (!key || typeof key !== 'string') return;
    const settings = await readSettingsFile(settingsPath);
    settings[key] = value;
    await writeSettingsFile(settingsPath, settings);
  });

  ipcMain.handle(CHANNELS.settings.remove, async (_event, key) => {
    if (!key || typeof key !== 'string') return;
    const settings = await readSettingsFile(settingsPath);
    delete settings[key];
    await writeSettingsFile(settingsPath, settings);
  });

  ipcMain.handle(CHANNELS.zima.start, async (_event, input) => {
    return zimaBridge.start(input);
  });

  ipcMain.handle(CHANNELS.zima.stop, async () => {
    return zimaBridge.stop();
  });

  ipcMain.handle(CHANNELS.zima.sendCommand, async (_event, command) => {
    return zimaBridge.sendCommand(command);
  });

  ipcMain.handle(CHANNELS.zima.status, async () => {
    return zimaBridge.getStatus();
  });

  ipcMain.handle(CHANNELS.gnss.start, async (_event, input) => {
    return gnssBridge.start(input);
  });

  ipcMain.handle(CHANNELS.gnss.stop, async () => {
    return gnssBridge.stop();
  });

  ipcMain.handle(CHANNELS.gnss.status, async () => {
    return gnssBridge.getStatus();
  });
};

app.whenReady().then(async () => {
  registerIpcHandlers();
  await createMainWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
