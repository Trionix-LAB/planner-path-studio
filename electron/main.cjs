const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const dgram = require('dgram');

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
};
const FILE_STORE_ROOT_DIR = 'planner.fs';
const PREPARE_CLOSE_TIMEOUT_MS = 8000;
const pendingPrepareClose = new Map();
const closingWindowIds = new Set();

const registerPrepareCloseResult = (ipcMainRef) => {
  ipcMainRef.on(CHANNELS.lifecycle.prepareCloseResult, (event, payload) => {
    const token = typeof payload?.token === 'string' ? payload.token : '';
    if (!token) return;

    const pending = pendingPrepareClose.get(token);
    if (!pending) return;
    if (pending.windowId !== event.sender.id) return;

    clearTimeout(pending.timeoutId);
    pendingPrepareClose.delete(token);
    pending.resolve({
      ok: Boolean(payload?.ok),
      error: typeof payload?.error === 'string' ? payload.error : '',
    });
  });
};

const requestRendererPrepareClose = (windowRef, timeoutMs = PREPARE_CLOSE_TIMEOUT_MS) => {
  if (!windowRef || windowRef.isDestroyed() || windowRef.webContents.isDestroyed()) {
    return Promise.resolve({ ok: true, error: '' });
  }

  const token = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      pendingPrepareClose.delete(token);
      resolve({
        ok: false,
        error: `prepare-close timeout (${timeoutMs}ms)`,
      });
    }, timeoutMs);

    pendingPrepareClose.set(token, {
      resolve,
      timeoutId,
      windowId: windowRef.webContents.id,
    });
    windowRef.webContents.send(CHANNELS.lifecycle.prepareClose, { token });
  });
};

const shouldWaitRendererPrepareClose = (windowRef) => {
  if (!windowRef || windowRef.isDestroyed() || windowRef.webContents.isDestroyed()) {
    return false;
  }

  const url = String(windowRef.webContents.getURL() ?? '');
  if (!url) return false;
  if (/#\/(map|create-mission|open-mission)(\?|$)/.test(url)) return true;
  if (/\/(map|create-mission|open-mission)(\?|$)/.test(url)) return true;
  return false;
};

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

const DEFAULT_GNSS_COM_CONFIG = {
  autoDetectPort: true,
  comPort: '',
  baudRate: 115200,
  scanTimeoutMs: 1500,
};

const GNSS_COM_SIM_REGISTRY_PATH = '/tmp/planner-gnss-com-sim.json';

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

const writeTextAtomic = async (filePath, content) => {
  await ensureParentDir(filePath);
  const tempSuffix = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const tempPath = `${filePath}.tmp-${tempSuffix}`;
  await fs.writeFile(tempPath, String(content ?? ''), 'utf8');
  try {
    await fs.rename(tempPath, filePath);
  } catch (error) {
    try {
      await fs.rm(tempPath, { force: true });
    } catch {
      // ignore cleanup failure
    }
    throw error;
  }
};

const flushFile = async (filePath) => {
  let handle = null;
  try {
    handle = await fs.open(filePath, 'a');
    await handle.sync();
  } catch {
    // ignore flush failures in fallback path
  } finally {
    if (handle) {
      try {
        await handle.close();
      } catch {
        // ignore close failures
      }
    }
  }
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
  await writeTextAtomic(settingsPath, JSON.stringify(data, null, 2));
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

const normalizeText = (value, fallback = '') => {
  if (typeof value !== 'string') return fallback;
  return value.trim();
};

const normalizePositiveInt = (value, fallback, max = Number.MAX_SAFE_INTEGER) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > max) return fallback;
  return n;
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

const normalizeGnssComConfig = (input) => {
  const source = input && typeof input === 'object' ? input : {};
  return {
    autoDetectPort: normalizeBoolean(source.autoDetectPort, DEFAULT_GNSS_COM_CONFIG.autoDetectPort),
    comPort: normalizeText(source.comPort, DEFAULT_GNSS_COM_CONFIG.comPort),
    baudRate: normalizePositiveInt(source.baudRate, DEFAULT_GNSS_COM_CONFIG.baudRate, 4_000_000),
    scanTimeoutMs: normalizePositiveInt(source.scanTimeoutMs, DEFAULT_GNSS_COM_CONFIG.scanTimeoutMs, 10_000),
  };
};

const normalizeComPortNumber = (value) => {
  const text = normalizeText(value, '');
  if (!/^\d+$/.test(text)) return null;
  const portNumber = Number(text);
  if (!Number.isInteger(portNumber) || portNumber < 1) return null;
  return portNumber;
};

const extractComPortNumberFromPath = (portPath) => {
  const normalizedPath = normalizeText(portPath, '');
  if (!normalizedPath) return null;

  const winMatch = /com\s*(\d+)$/i.exec(normalizedPath);
  if (winMatch?.[1]) {
    return normalizeComPortNumber(winMatch[1]);
  }

  const trailingDigitsMatch = /(\d+)\s*$/.exec(normalizedPath);
  if (trailingDigitsMatch?.[1]) {
    return normalizeComPortNumber(trailingDigitsMatch[1]);
  }

  return null;
};

let serialPortCtorCached = undefined;

const getSerialPortCtor = () => {
  if (serialPortCtorCached !== undefined) {
    return serialPortCtorCached;
  }
  try {
    const moduleValue = require('serialport');
    if (moduleValue && typeof moduleValue === 'object') {
      if (typeof moduleValue.SerialPort === 'function') {
        serialPortCtorCached = moduleValue.SerialPort;
        return serialPortCtorCached;
      }
      if (typeof moduleValue.default === 'function') {
        serialPortCtorCached = moduleValue.default;
        return serialPortCtorCached;
      }
    }
    if (typeof moduleValue === 'function') {
      serialPortCtorCached = moduleValue;
      return serialPortCtorCached;
    }
  } catch {
    // serialport is optional at runtime; bridge will emit clear error when absent.
  }
  serialPortCtorCached = null;
  return null;
};

const listSerialPorts = async () => {
  const SerialPortCtor = getSerialPortCtor();
  const hardwarePorts = (() => {
    if (!SerialPortCtor || typeof SerialPortCtor.list !== 'function') {
      return Promise.resolve([]);
    }
    return SerialPortCtor.list()
      .then((ports) => {
        if (!Array.isArray(ports)) return [];
        return ports
          .map((entry) => {
            if (!entry || typeof entry !== 'object') return null;
            const pathValue = normalizeText(entry.path, '');
            if (!pathValue) return null;
            return {
              path: pathValue,
              manufacturer: normalizeText(entry.manufacturer, ''),
              serialNumber: normalizeText(entry.serialNumber, ''),
              pnpId: normalizeText(entry.pnpId, ''),
              vendorId: normalizeText(entry.vendorId, ''),
              productId: normalizeText(entry.productId, ''),
            };
          })
          .filter((entry) => entry !== null);
      })
      .catch(() => []);
  })();

  const simulatorRegistryPorts = (async () => {
    try {
      const raw = await fs.readFile(GNSS_COM_SIM_REGISTRY_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      const appPortPath = normalizeText(parsed?.appPortPath, '');
      if (!appPortPath) return [];
      return [
        {
          path: appPortPath,
          manufacturer: 'Planner GNSS-COM Simulator',
          serialNumber: '',
          pnpId: '',
          vendorId: '',
          productId: '',
        },
      ];
    } catch {
      return [];
    }
  })();

  const simulatorTmpPorts = (async () => {
    try {
      const entries = await fs.readdir('/tmp', { withFileTypes: true });
      const candidates = entries
        .map((entry) => entry.name)
        .filter((name) => name.startsWith('gnss-com') && !name.endsWith('.sim'))
        .map((name) => `/tmp/${name}`);
      if (candidates.length === 0) return [];

      const valid = (
        await Promise.all(
          candidates.map(async (candidate) => {
            try {
              await fs.access(candidate);
              return candidate;
            } catch {
              return '';
            }
          }),
        )
      ).filter((candidate) => candidate.length > 0);

      return valid.map((candidate) => ({
        path: candidate,
        manufacturer: 'Planner GNSS-COM Simulator',
        serialNumber: '',
        pnpId: '',
        vendorId: '',
        productId: '',
      }));
    } catch {
      return [];
    }
  })();

  const [hardware, registry, tmpPorts] = await Promise.all([
    hardwarePorts,
    simulatorRegistryPorts,
    simulatorTmpPorts,
  ]);

  const merged = [...registry, ...tmpPorts, ...hardware];
  const seenPaths = new Set();
  return merged.filter((entry) => {
    const pathValue = normalizeText(entry?.path, '');
    if (!pathValue || seenPaths.has(pathValue)) return false;
    seenPaths.add(pathValue);
    return true;
  });
};

const looksLikeNmeaLine = (line) => {
  if (typeof line !== 'string') return false;
  const trimmed = line.trim();
  if (!trimmed.startsWith('$')) return false;
  return /^\$[A-Z0-9]{5},/.test(trimmed);
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
      console.log(
        `[zima2r][rx] ${remote.address}:${remote.port} -> ${message.trim() || '<empty>'}`,
      );
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

const openSerialPort = async (portPath, baudRate) => {
  const SerialPortCtor = getSerialPortCtor();
  if (!SerialPortCtor) {
    throw new Error('Модуль serialport не установлен');
  }

  const port = new SerialPortCtor({
    path: portPath,
    baudRate,
    autoOpen: false,
  });

  await new Promise((resolve, reject) => {
    port.open((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  return port;
};

const closeSerialPort = async (port) => {
  if (!port) return;
  await new Promise((resolve) => {
    try {
      if (!port.isOpen) {
        resolve();
        return;
      }
      port.close(() => resolve());
    } catch {
      resolve();
    }
  });
};

const createGnssComBridge = () => {
  let serialPort = null;
  let status = 'stopped';
  let config = { ...DEFAULT_GNSS_COM_CONFIG };
  let activePortPath = '';

  const emitStatus = (nextStatus) => {
    if (status === nextStatus) return;
    status = nextStatus;
    emitToRenderer(CHANNELS.gnssCom.events.status, {
      status,
      config: { ...config, comPort: activePortPath || config.comPort },
    });
  };

  const emitError = (message) => {
    emitToRenderer(CHANNELS.gnssCom.events.error, {
      message,
      status,
      config: { ...config, comPort: activePortPath || config.comPort },
    });
  };

  const stop = async () => {
    const current = serialPort;
    serialPort = null;
    activePortPath = '';
    await closeSerialPort(current);
    emitStatus('stopped');
    return { status, config };
  };

  const hasNmeaOnPort = async (portPath, baudRate, timeoutMs) => {
    let probePort = null;
    let probeBuffer = '';
    try {
      probePort = await openSerialPort(portPath, baudRate);
      return await new Promise((resolve) => {
        let finished = false;
        const finish = async (result) => {
          if (finished) return;
          finished = true;
          clearTimeout(timerId);
          probePort.removeListener('data', onData);
          probePort.removeListener('error', onError);
          await closeSerialPort(probePort);
          resolve(result);
        };
        const onData = (chunk) => {
          const message = Buffer.from(chunk).toString('ascii');
          if (!message) return;
          probeBuffer += message;
          const { lines, rest } = (() => {
            const parts = probeBuffer.split(/\r?\n/);
            const ready = parts.slice(0, -1).map((line) => line.trim()).filter((line) => line.length > 0);
            const remain = parts[parts.length - 1] ?? '';
            return { lines: ready, rest: remain };
          })();
          probeBuffer = rest.slice(-2048);

          for (const line of lines) {
            if (looksLikeNmeaLine(line)) {
              void finish(true);
              return;
            }
          }

          const tail = probeBuffer.trim();
          if (tail.length > 6 && looksLikeNmeaLine(tail)) {
            void finish(true);
          }
        };
        const onError = () => {
          void finish(false);
        };
        const timerId = setTimeout(() => {
          void finish(false);
        }, timeoutMs);
        probePort.on('data', onData);
        probePort.on('error', onError);
      });
    } catch {
      await closeSerialPort(probePort);
      return false;
    }
  };

  const resolvePortPath = async (nextConfig) => {
    const manualPortRaw = normalizeText(nextConfig.comPort, '');
    const manualPortNumber = normalizeComPortNumber(manualPortRaw);
    const ports = await listSerialPorts();

    const resolveManualPathByNumber = (portNumber) => {
      const exactWinPath = `COM${portNumber}`;
      const exactWinMatch = ports.find((entry) => normalizeText(entry.path, '').toUpperCase() === exactWinPath);
      if (exactWinMatch) {
        return normalizeText(exactWinMatch.path, '');
      }

      const byTrailingNumber = ports.find(
        (entry) => extractComPortNumberFromPath(entry.path) === portNumber,
      );
      if (byTrailingNumber) {
        return normalizeText(byTrailingNumber.path, '');
      }

      // On Windows allow direct COM path even if SerialPort.list() temporarily returned empty.
      if (process.platform === 'win32') {
        return exactWinPath;
      }
      return '';
    };

    if (!nextConfig.autoDetectPort) {
      if (!manualPortRaw) {
        throw new Error('Не выбран COM-порт');
      }
      if (manualPortNumber === null) {
        return manualPortRaw;
      }
      const resolvedByNumber = resolveManualPathByNumber(manualPortNumber);
      if (!resolvedByNumber) {
        throw new Error(`COM-порт ${manualPortNumber} не найден среди доступных`);
      }
      return resolvedByNumber;
    }

    const candidates = [];
    const seenPaths = new Set();
    if (manualPortNumber !== null) {
      const preferredPath = resolveManualPathByNumber(manualPortNumber);
      if (preferredPath) {
        candidates.push({ path: preferredPath });
        seenPaths.add(preferredPath);
      }
    } else if (manualPortRaw.length > 0) {
      candidates.push({ path: manualPortRaw });
      seenPaths.add(manualPortRaw);
    }
    for (const entry of ports) {
      const pathValue = normalizeText(entry.path, '');
      if (!pathValue || seenPaths.has(pathValue)) continue;
      seenPaths.add(pathValue);
      candidates.push({ path: pathValue });
    }

    if (candidates.length === 0) {
      throw new Error('Нет доступных COM-портов для автоопределения');
    }

    for (const entry of candidates) {
      const pathValue = normalizeText(entry.path, '');
      if (!pathValue) continue;
      const hasNmea = await hasNmeaOnPort(pathValue, nextConfig.baudRate, nextConfig.scanTimeoutMs);
      if (hasNmea) {
        return pathValue;
      }
    }
    throw new Error('Не найден COM-порт с потоком NMEA');
  };

  const start = async (input) => {
    config = normalizeGnssComConfig(input);
    await stop();

    let openedPort = null;
    try {
      const resolvedPortPath = await resolvePortPath(config);
      openedPort = await openSerialPort(resolvedPortPath, config.baudRate);
      serialPort = openedPort;
      activePortPath = resolvedPortPath;

      openedPort.on('data', (chunk) => {
        const message = Buffer.from(chunk).toString('ascii');
        if (!message) return;
        emitToRenderer(CHANNELS.gnssCom.events.data, {
          message,
          receivedAt: Date.now(),
          portPath: activePortPath,
        });
      });

      openedPort.on('error', (error) => {
        emitStatus('error');
        emitError(error instanceof Error ? error.message : String(error));
      });

      openedPort.on('close', () => {
        if (serialPort === openedPort) {
          serialPort = null;
          activePortPath = '';
          if (status === 'running') {
            emitStatus('stopped');
          }
        }
      });

      emitStatus('running');
      return { status, config: { ...config, comPort: resolvedPortPath } };
    } catch (error) {
      await closeSerialPort(openedPort);
      serialPort = null;
      activePortPath = '';
      emitStatus('error');
      const message = error instanceof Error ? error.message : String(error);
      emitError(message);
      throw error;
    }
  };

  const getStatus = () => ({ status, config: { ...config, comPort: activePortPath || config.comPort } });

  return {
    start,
    stop,
    getStatus,
    listPorts: listSerialPorts,
  };
};

const createMainWindow = async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    autoHideMenuBar: true,
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
  win.setMenuBarVisibility(false);

  win.on('close', (event) => {
    if (closingWindowIds.has(win.id)) {
      return;
    }

    if (!shouldWaitRendererPrepareClose(win)) {
      closingWindowIds.add(win.id);
      return;
    }

    event.preventDefault();
    void (async () => {
      const result = await requestRendererPrepareClose(win);
      if (!result.ok && result.error) {
        console.warn(`[planner] graceful close fallback: ${result.error}`);
      }
      closingWindowIds.add(win.id);
      win.close();
    })();
  });

  win.on('closed', () => {
    closingWindowIds.delete(win.id);
  });

  return win;
};

const registerIpcHandlers = () => {
  const userDataPath = app.getPath('userData');
  const settingsPath = path.join(userDataPath, 'settings.json');
  const zimaBridge = createZimaUdpBridge();
  const gnssBridge = createGnssUdpBridge();
  const gnssComBridge = createGnssComBridge();
  registerPrepareCloseResult(ipcMain);

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
    await writeTextAtomic(resolvedPath.absolutePath, content);
  });

  ipcMain.handle(CHANNELS.fileStore.appendText, async (_event, inputPath, content) => {
    const resolvedPath = resolveFileStorePath(inputPath, userDataPath);
    await ensureParentDir(resolvedPath.absolutePath);
    await fs.appendFile(resolvedPath.absolutePath, String(content ?? ''), 'utf8');
  });

  ipcMain.handle(CHANNELS.fileStore.flush, async (_event, inputPath) => {
    const resolvedPath = resolveFileStorePath(inputPath, userDataPath);
    await flushFile(resolvedPath.absolutePath);
  });

  ipcMain.handle(CHANNELS.fileStore.remove, async (_event, inputPath) => {
    const resolvedPath = resolveFileStorePath(inputPath, userDataPath);
    try {
      await fs.rm(resolvedPath.absolutePath, { recursive: true, force: true });
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

  ipcMain.handle(CHANNELS.fileStore.stat, async (_event, inputPath) => {
    const resolvedPath = resolveFileStorePath(inputPath, userDataPath);
    try {
      const stat = await fs.stat(resolvedPath.absolutePath);
      return {
        mtimeMs: stat.mtimeMs,
      };
    } catch {
      return null;
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

  ipcMain.handle(CHANNELS.gnssCom.start, async (_event, input) => {
    return gnssComBridge.start(input);
  });

  ipcMain.handle(CHANNELS.gnssCom.stop, async () => {
    return gnssComBridge.stop();
  });

  ipcMain.handle(CHANNELS.gnssCom.status, async () => {
    return gnssComBridge.getStatus();
  });

  ipcMain.handle(CHANNELS.gnssCom.listPorts, async () => {
    return gnssComBridge.listPorts();
  });

  app.on('before-quit', () => {
    void Promise.allSettled([
      zimaBridge.stop(),
      gnssBridge.stop(),
      gnssComBridge.stop(),
    ]);
  });
};

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
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
