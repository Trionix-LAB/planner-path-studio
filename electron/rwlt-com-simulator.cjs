const fs = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');

const DEFAULT_SIMULATOR_CONFIG = {
  mode: 'stream',
  messageMode: 'mix',
  portPath: '',
  simulatorPortPath: '',
  baudRate: 38400,
  rateHz: 2,
  autoDetectPort: false,
  virtualPort: true,
  virtualSetupTimeoutMs: 7000,
  rwltMode: 'pinger',
  allowRuntimeModeSwitch: false,
  diverTargetIds: [1, 2],
};

const RWLT_COM_SIM_REGISTRY_PATH = '/tmp/planner-rwlt-com-sim.json';
const RWLT_SIM_BUOYS = [
  { buoyId: 1, dLat: +0.0009, dLon: -0.0015 },
  { buoyId: 2, dLat: +0.0009, dLon: +0.0015 },
  { buoyId: 3, dLat: -0.0009, dLon: +0.0015 },
  { buoyId: 4, dLat: -0.0009, dLon: -0.0015 },
];

const clampRate = (value, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0.1, Math.min(100, n));
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

const normalizePositiveInt = (value, fallback, max = Number.MAX_SAFE_INTEGER) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > max) return fallback;
  return n;
};

const normalizeText = (value, fallback = '') => {
  if (typeof value !== 'string') return fallback;
  return value.trim();
};

const wait = async (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const normalizeMode = (value, fallback) => {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'single') return 'single';
  if (normalized === 'stream') return 'stream';
  if (normalized === 'playback' || normalized === 'replay') return 'playback';
  return fallback;
};

const normalizeMessageMode = (value, fallback) => {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'valid') return 'valid';
  if (normalized === 'broken') return 'broken';
  if (normalized === 'mix') return 'mix';
  return fallback;
};

const normalizeRwltMode = (value, fallback) => {
  if (typeof value !== 'string') return fallback;
  return value.trim().toLowerCase() === 'divers' ? 'divers' : 'pinger';
};

const parseDiverTargetIds = (value, fallback) => {
  const source = typeof value === 'string' ? value : Array.isArray(value) ? value.join(',') : '';
  if (!source.trim()) return fallback;
  const parsed = source
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 255);
  return parsed.length > 0 ? parsed : fallback;
};

const resolveRwltModeFromCommand = (line) => {
  const trimmed = normalizeText(line, '');
  if (!trimmed.startsWith('$')) return null;
  const payloadRaw = trimmed.slice(1);
  const payload = payloadRaw.includes('*') ? payloadRaw.slice(0, payloadRaw.lastIndexOf('*')) : payloadRaw;
  const fields = payload.split(',');
  const sentenceId = normalizeText(fields[0], '').toUpperCase();
  if (sentenceId !== 'PUNV0' && sentenceId !== 'PUWV0') return null;
  const primaryModeRaw = normalizeText(fields[11] ?? '', '').toLowerCase();
  const modeRaw = primaryModeRaw || normalizeText(fields[10] ?? '', '').toLowerCase();
  if (modeRaw === '1' || modeRaw === 'divers') return 'divers';
  if (modeRaw === '0' || modeRaw === 'pinger') return 'pinger';
  return null;
};

const stripQuotes = (value) => {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

const parseScenarioYamlLike = (source) => {
  const rows = source.split(/\r?\n/);
  const items = [];

  for (const rawRow of rows) {
    const row = rawRow.trim();
    if (!row || row.startsWith('#')) continue;

    const msgMatch = /msg\s*:\s*(.+)$/i.exec(row);
    if (msgMatch) {
      items.push({
        msg: stripQuotes(msgMatch[1]),
        delayMs: 1000,
      });
      continue;
    }

    const delayMatch = /delay_ms\s*:\s*(-?\d+)/i.exec(row);
    if (delayMatch && items.length > 0) {
      const delay = Math.max(0, Number(delayMatch[1]));
      items[items.length - 1].delayMs = Number.isFinite(delay) ? delay : 1000;
    }
  }

  return items;
};

const parseScenario = (input) => {
  if (Array.isArray(input)) {
    return input
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const msg = typeof item.msg === 'string' ? item.msg : '';
        if (!msg.trim()) return null;
        const delayRaw = item.delayMs ?? item.delay_ms;
        const delay = Math.max(0, Number(delayRaw));
        return {
          msg,
          delayMs: Number.isFinite(delay) ? delay : 1000,
        };
      })
      .filter((item) => item !== null);
  }

  if (typeof input !== 'string') return [];
  const source = input.trim();
  if (!source) return [];

  try {
    const parsed = JSON.parse(source);
    return parseScenario(parsed);
  } catch {
    return parseScenarioYamlLike(source);
  }
};

const addChecksum = (payload) => {
  let checksum = 0;
  for (let i = 0; i < payload.length; i += 1) {
    checksum ^= payload.charCodeAt(i);
  }
  return `$${payload}*${checksum.toString(16).toUpperCase().padStart(2, '0')}`;
};

const formatNmeaCoord = (value, isLatitude) => {
  const abs = Math.abs(value);
  const degrees = Math.floor(abs);
  const minutes = (abs - degrees) * 60;
  const degWidth = isLatitude ? 2 : 3;
  const degPart = String(degrees).padStart(degWidth, '0');
  const minPart = minutes.toFixed(4).padStart(7, '0');
  return `${degPart}${minPart}`;
};

const formatUtcTime = (date) => {
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return `${hh}${mm}${ss}.00`;
};

const formatUtcDate = (date) => {
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const yy = String(date.getUTCFullYear() % 100).padStart(2, '0');
  return `${dd}${mm}${yy}`;
};

const normalizeCourseDeg = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return ((n % 360) + 360) % 360;
};

const createPuwv5Line = (state) =>
  addChecksum(
    `PUWV5,${state.lat.toFixed(6)},${state.lon.toFixed(6)},${normalizeCourseDeg(state.course).toFixed(1)},${Math.max(0, state.speedKmh).toFixed(2)}`,
  );

const createGnggaLine = (state, date) => {
  const time = formatUtcTime(date);
  const lat = formatNmeaCoord(state.lat, true);
  const lon = formatNmeaCoord(state.lon, false);
  const latHemi = state.lat >= 0 ? 'N' : 'S';
  const lonHemi = state.lon >= 0 ? 'E' : 'W';
  const altitude = -Math.max(0, state.depthM);
  return addChecksum(`GNGGA,${time},${lat},${latHemi},${lon},${lonHemi},1,08,1.0,${altitude.toFixed(1)},M,0.0,M,,`);
};

const createGnrmcLine = (state, date) => {
  const time = formatUtcTime(date);
  const day = formatUtcDate(date);
  const lat = formatNmeaCoord(state.lat, true);
  const lon = formatNmeaCoord(state.lon, false);
  const latHemi = state.lat >= 0 ? 'N' : 'S';
  const lonHemi = state.lon >= 0 ? 'E' : 'W';
  const speedKnots = (Math.max(0, state.speedKmh) / 1.852).toFixed(2);
  return addChecksum(
    `GNRMC,${time},A,${lat},${latHemi},${lon},${lonHemi},${speedKnots},${normalizeCourseDeg(state.course).toFixed(1)},${day},,,A`,
  );
};

const createPuwv3Line = (targetId, lat, lon, depthM, courseDeg) =>
  addChecksum(
    `PUWV3,${targetId},${lat.toFixed(6)},${lon.toFixed(6)},${Math.max(0, depthM).toFixed(1)},${normalizeCourseDeg(courseDeg).toFixed(1)},2.0,1`,
  );

const createPrwlaLine = (buoyId, lat, lon, tick) =>
  addChecksum(
    `PRWLA,${buoyId},${lat.toFixed(6)},${lon.toFixed(6)},0.5,${(12.4 - tick * 0.001).toFixed(2)},0,3.1,25.0`,
  );

const createBrokenLine = (tick) => {
  const variants = [
    '$PUWV5,broken,line,*00',
    '$GNGGA,120000.00,5956.0520,N,03020.1060,E,1',
    '$PRWLA,###',
    '$UNKNOWN,###',
  ];
  return variants[tick % variants.length];
};

const normalizeSimulatorConfig = (input) => {
  const source = input && typeof input === 'object' ? input : {};
  const onlyValid = normalizeBoolean(source.onlyValid, false);
  const onlyBroken = normalizeBoolean(source.onlyBroken, false);
  const messageMode = onlyValid
    ? 'valid'
    : onlyBroken
      ? 'broken'
      : normalizeMessageMode(source.messageMode, DEFAULT_SIMULATOR_CONFIG.messageMode);

  return {
    mode: normalizeMode(source.mode, DEFAULT_SIMULATOR_CONFIG.mode),
    messageMode,
    portPath: normalizeText(source.portPath, DEFAULT_SIMULATOR_CONFIG.portPath),
    simulatorPortPath: normalizeText(source.simulatorPortPath, DEFAULT_SIMULATOR_CONFIG.simulatorPortPath),
    baudRate: normalizePositiveInt(source.baudRate, DEFAULT_SIMULATOR_CONFIG.baudRate, 4_000_000),
    rateHz: clampRate(source.rateHz, DEFAULT_SIMULATOR_CONFIG.rateHz),
    autoDetectPort: normalizeBoolean(source.autoDetectPort, DEFAULT_SIMULATOR_CONFIG.autoDetectPort),
    virtualPort: normalizeBoolean(source.virtualPort, DEFAULT_SIMULATOR_CONFIG.virtualPort),
    virtualSetupTimeoutMs: normalizePositiveInt(
      source.virtualSetupTimeoutMs,
      DEFAULT_SIMULATOR_CONFIG.virtualSetupTimeoutMs,
      30_000,
    ),
    rwltMode: normalizeRwltMode(source.rwltMode, DEFAULT_SIMULATOR_CONFIG.rwltMode),
    allowRuntimeModeSwitch: normalizeBoolean(
      source.allowRuntimeModeSwitch,
      DEFAULT_SIMULATOR_CONFIG.allowRuntimeModeSwitch,
    ),
    diverTargetIds: parseDiverTargetIds(source.diverTargetIds, DEFAULT_SIMULATOR_CONFIG.diverTargetIds),
  };
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
    // serialport is optional until simulator is used.
  }
  serialPortCtorCached = null;
  return null;
};

const listSerialPorts = async () => {
  const SerialPortCtor = getSerialPortCtor();
  if (!SerialPortCtor || typeof SerialPortCtor.list !== 'function') {
    return [];
  }
  try {
    const ports = await SerialPortCtor.list();
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
        };
      })
      .filter((entry) => entry !== null);
  } catch {
    return [];
  }
};

const writeSimulatorRegistry = async (appPortPath, simulatorPortPath) => {
  try {
    await fs.writeFile(
      RWLT_COM_SIM_REGISTRY_PATH,
      JSON.stringify(
        {
          appPortPath,
          simulatorPortPath,
          pid: process.pid,
          updatedAt: Date.now(),
        },
        null,
        2,
      ),
      'utf8',
    );
  } catch {
    // ignore registry write failures
  }
};

const cleanupSimulatorRegistry = async (appPortPath, simulatorPortPath) => {
  try {
    const raw = await fs.readFile(RWLT_COM_SIM_REGISTRY_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const sameAppPort = normalizeText(parsed?.appPortPath, '') === normalizeText(appPortPath, '');
    const sameSimPort = normalizeText(parsed?.simulatorPortPath, '') === normalizeText(simulatorPortPath, '');
    if (sameAppPort && sameSimPort) {
      await fs.rm(RWLT_COM_SIM_REGISTRY_PATH, { force: true });
    }
  } catch {
    // ignore registry cleanup failures
  }
};

const resolveVirtualPorts = (desiredAppPortPath, desiredSimulatorPortPath) => {
  const basePath = desiredAppPortPath || path.join('/tmp', `rwlt-com-${Date.now()}-${process.pid}-app`);
  const appPortPath = basePath;
  const simulatorPortPath = desiredSimulatorPortPath || `${basePath}.sim`;
  return { appPortPath, simulatorPortPath };
};

const waitForPathToAppear = async (targetPath, timeoutMs) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    try {
      await fs.access(targetPath);
      return true;
    } catch {
      // continue polling
    }
    await wait(50);
  }
  return false;
};

const killChildProcess = async (childProcess) =>
  new Promise((resolve) => {
    if (!childProcess || childProcess.killed) {
      resolve();
      return;
    }

    let resolved = false;
    const done = () => {
      if (resolved) return;
      resolved = true;
      resolve();
    };

    childProcess.once('exit', done);
    try {
      childProcess.kill('SIGTERM');
    } catch {
      done();
      return;
    }

    setTimeout(() => {
      if (resolved) return;
      try {
        childProcess.kill('SIGKILL');
      } catch {
        // ignore
      }
      done();
    }, 1000);
  });

const createVirtualSerialPair = async (appPortPath, simulatorPortPath, timeoutMs) => {
  if (process.platform === 'win32') {
    throw new Error(
      'Автосоздание виртуальных COM-портов поддерживается только на Linux/macOS (через socat).',
    );
  }

  await fs.mkdir(path.dirname(appPortPath), { recursive: true });
  await fs.mkdir(path.dirname(simulatorPortPath), { recursive: true });
  await fs.rm(appPortPath, { force: true }).catch(() => {
    // ignore stale symlink cleanup failures
  });
  await fs.rm(simulatorPortPath, { force: true }).catch(() => {
    // ignore stale symlink cleanup failures
  });

  const helperProcess = spawn(
    'socat',
    ['-d', '-d', `pty,raw,echo=0,link=${appPortPath}`, `pty,raw,echo=0,link=${simulatorPortPath}`],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );

  let stderrTail = '';
  helperProcess.stderr.on('data', (chunk) => {
    const text = String(chunk ?? '');
    if (!text) return;
    stderrTail = `${stderrTail}${text}`;
    if (stderrTail.length > 4000) {
      stderrTail = stderrTail.slice(stderrTail.length - 4000);
    }
  });

  const waitResult = await Promise.race([
    (async () => {
      const appReady = await waitForPathToAppear(appPortPath, timeoutMs);
      const simReady = await waitForPathToAppear(simulatorPortPath, timeoutMs);
      return appReady && simReady;
    })(),
    new Promise((resolve) => {
      helperProcess.once('error', () => resolve(false));
      helperProcess.once('exit', () => resolve(false));
    }),
  ]);

  if (!waitResult) {
    await killChildProcess(helperProcess);
    const details = stderrTail.trim();
    if (details) {
      throw new Error(`Не удалось поднять виртуальный COM-порт через socat: ${details}`);
    }
    throw new Error('Не удалось поднять виртуальный COM-порт через socat');
  }

  return helperProcess;
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

const closeSerialPort = async (port) =>
  new Promise((resolve) => {
    if (!port) {
      resolve();
      return;
    }
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

const createRwltComSimulator = () => {
  let status = 'stopped';
  let config = { ...DEFAULT_SIMULATOR_CONFIG };
  let serialPort = null;
  let virtualPairProcess = null;
  let streamTimer = null;
  let playbackTimer = null;
  let scenario = [];
  let playbackIndex = 0;
  let tick = 0;
  let activePortPath = '';
  let activeWriterPortPath = '';
  let incomingBuffer = '';
  let stats = {
    framesSent: 0,
    bytesSent: 0,
    lastError: null,
    lastSentAt: null,
  };

  let state = {
    lat: 59.93428,
    lon: 30.335099,
    course: 120,
    speedKmh: 7.2,
    depthM: 12,
  };
  let runtimeRwltMode = config.rwltMode;

  const resetStats = () => {
    stats = {
      framesSent: 0,
      bytesSent: 0,
      lastError: null,
      lastSentAt: null,
    };
  };

  const setError = (error) => {
    status = 'error';
    stats.lastError = error instanceof Error ? error.message : String(error);
  };

  const clearTimers = () => {
    if (streamTimer) {
      clearInterval(streamTimer);
      streamTimer = null;
    }
    if (playbackTimer) {
      clearTimeout(playbackTimer);
      playbackTimer = null;
    }
  };

  const advanceState = () => {
    tick += 1;
    const phase = tick / 6;
    state.lat += 0.00002 * Math.sin(phase);
    state.lon += 0.00002 * Math.cos(phase);
    state.course = (state.course + 10) % 360;
    state.speedKmh = Math.max(2, 7.2 + 1.2 * Math.sin(phase / 2));
    state.depthM = Math.max(0, 12 + 2 * Math.sin(tick / 5));
  };

  const applyModeCommand = (line) => {
    if (!config.allowRuntimeModeSwitch) return;
    const nextMode = resolveRwltModeFromCommand(line);
    if (!nextMode) return;
    runtimeRwltMode = nextMode;
  };

  const buildFrame = () => {
    if (config.messageMode === 'broken') {
      return `${createBrokenLine(tick)}\r\n`;
    }

    if (config.messageMode === 'mix' && tick % 8 === 0) {
      return `${createBrokenLine(tick)}\r\n`;
    }

    const lines = [];
    const now = new Date();
    lines.push(createPuwv5Line(state));

    if (runtimeRwltMode === 'divers') {
      const targetIds = config.diverTargetIds.length > 0 ? config.diverTargetIds : [1];
      for (let index = 0; index < targetIds.length; index += 1) {
        const targetId = targetIds[index];
        const phaseOffset = index * (Math.PI / 3);
        const lat = state.lat + 0.0002 * Math.sin(tick / 8 + phaseOffset);
        const lon = state.lon + 0.0002 * Math.cos(tick / 8 + phaseOffset);
        const depth = Math.max(0, 10 + 3 * Math.sin(tick / 5 + phaseOffset));
        const course = (45 + index * 60 + tick * 8) % 360;
        lines.push(createPuwv3Line(targetId, lat, lon, depth, course));
      }
    } else {
      lines.push(createGnggaLine(state, now));
      lines.push(createGnrmcLine(state, now));
    }

    if (tick % 3 === 0) {
      for (const buoy of RWLT_SIM_BUOYS) {
        lines.push(createPrwlaLine(buoy.buoyId, state.lat + buoy.dLat, state.lon + buoy.dLon, tick));
      }
    }

    return `${lines.join('\r\n')}\r\n`;
  };

  const writeFrame = async (frame) => {
    if (!serialPort || !serialPort.isOpen) return;
    const payload = Buffer.from(frame, 'ascii');
    await new Promise((resolve, reject) => {
      serialPort.write(payload, (error) => {
        if (error) {
          reject(error);
          return;
        }
        serialPort.drain((drainError) => {
          if (drainError) {
            reject(drainError);
            return;
          }
          resolve();
        });
      });
    });

    stats.framesSent += 1;
    stats.bytesSent += payload.byteLength;
    stats.lastSentAt = Date.now();
  };

  const runStreamTick = async () => {
    advanceState();
    const frame = buildFrame();
    try {
      await writeFrame(frame);
    } catch (error) {
      setError(error);
    }
  };

  const runPlayback = async () => {
    if (status !== 'running') return;
    if (playbackIndex >= scenario.length) {
      await stop();
      return;
    }

    const current = scenario[playbackIndex];
    playbackIndex += 1;
    const payload = current.msg.endsWith('\n') ? current.msg : `${current.msg}\r\n`;
    try {
      await writeFrame(payload);
    } catch (error) {
      setError(error);
      return;
    }

    playbackTimer = setTimeout(() => {
      void runPlayback();
    }, Math.max(0, current.delayMs));
  };

  const resolvePhysicalPortPath = async (nextConfig) => {
    if (nextConfig.portPath) return nextConfig.portPath;
    if (!nextConfig.autoDetectPort) {
      throw new Error('Не указан serial порт. Используйте --port <path>');
    }

    const ports = await listSerialPorts();
    const first = ports[0];
    if (!first || typeof first.path !== 'string' || !first.path.trim()) {
      throw new Error('Нет доступных serial портов');
    }
    return first.path.trim();
  };

  const setupVirtualPorts = async (nextConfig) => {
    const { appPortPath, simulatorPortPath } = resolveVirtualPorts(
      nextConfig.portPath,
      nextConfig.simulatorPortPath,
    );
    const helperProcess = await createVirtualSerialPair(
      appPortPath,
      simulatorPortPath,
      nextConfig.virtualSetupTimeoutMs,
    );
    virtualPairProcess = helperProcess;
    activePortPath = appPortPath;
    activeWriterPortPath = simulatorPortPath;
    await writeSimulatorRegistry(appPortPath, simulatorPortPath);
    return simulatorPortPath;
  };

  const start = async (input) => {
    await stop();
    config = normalizeSimulatorConfig(input);
    runtimeRwltMode = config.rwltMode;
    resetStats();
    status = 'running';
    tick = 0;
    playbackIndex = 0;
    incomingBuffer = '';

    try {
      const writerPortPath = config.virtualPort
        ? await setupVirtualPorts(config)
        : await resolvePhysicalPortPath(config);
      serialPort = await openSerialPort(writerPortPath, config.baudRate);
      if (!config.virtualPort) {
        activePortPath = writerPortPath;
        activeWriterPortPath = writerPortPath;
      }
    } catch (error) {
      setError(error);
      return getStatus();
    }

    serialPort.on('data', (chunk) => {
      const incoming = Buffer.from(chunk).toString('ascii');
      if (!incoming) return;
      incomingBuffer += incoming;
      const parts = incomingBuffer.split(/\r?\n/);
      const lines = parts.slice(0, -1);
      incomingBuffer = parts[parts.length - 1] ?? '';
      for (const line of lines) {
        applyModeCommand(line);
      }
    });

    serialPort.on('error', (error) => {
      setError(error);
    });

    serialPort.on('close', () => {
      if (status === 'running') {
        status = 'stopped';
      }
    });

    if (config.mode === 'single') {
      await runStreamTick();
      await stop();
      return getStatus();
    }

    if (config.mode === 'playback') {
      if (scenario.length === 0) {
        scenario = [
          { msg: createPuwv5Line(state), delayMs: 500 },
          { msg: createGnggaLine(state, new Date()), delayMs: 500 },
          { msg: createGnrmcLine(state, new Date()), delayMs: 500 },
        ];
      }
      void runPlayback();
      return getStatus();
    }

    streamTimer = setInterval(() => {
      void runStreamTick();
    }, Math.max(50, Math.round(1000 / config.rateHz)));
    void runStreamTick();
    return getStatus();
  };

  const stop = async () => {
    clearTimers();
    const currentPort = serialPort;
    const currentVirtualProcess = virtualPairProcess;
    const currentAppPortPath = activePortPath;
    const currentWriterPortPath = activeWriterPortPath;
    serialPort = null;
    virtualPairProcess = null;
    await closeSerialPort(currentPort);
    await killChildProcess(currentVirtualProcess);
    if (currentVirtualProcess || currentAppPortPath || currentWriterPortPath) {
      await fs.rm(currentAppPortPath, { force: true }).catch(() => {
        // ignore
      });
      await fs.rm(currentWriterPortPath, { force: true }).catch(() => {
        // ignore
      });
      await cleanupSimulatorRegistry(currentAppPortPath, currentWriterPortPath);
    }
    activePortPath = '';
    activeWriterPortPath = '';
    status = 'stopped';
    return getStatus();
  };

  const getStatus = () => ({
    status,
    config: {
      ...config,
      rwltMode: runtimeRwltMode,
      portPath: activePortPath || config.portPath,
      simulatorPortPath: activeWriterPortPath || config.simulatorPortPath,
    },
    virtualPort:
      config.virtualPort && (activePortPath || activeWriterPortPath)
        ? {
            appPortPath: activePortPath || config.portPath,
            simulatorPortPath: activeWriterPortPath || config.simulatorPortPath,
            helper: 'socat',
          }
        : null,
    scenarioLength: scenario.length,
    stats: { ...stats },
  });

  const loadScenario = async (input) => {
    let parsed = [];
    if (Array.isArray(input)) {
      parsed = parseScenario(input);
    } else if (typeof input === 'string') {
      const trimmed = input.trim();
      if (trimmed.startsWith('[') || trimmed.startsWith('{') || trimmed.startsWith('-') || trimmed.includes('\n')) {
        parsed = parseScenario(trimmed);
      } else {
        const content = await fs.readFile(trimmed, 'utf8');
        parsed = parseScenario(content);
      }
    } else if (input && typeof input === 'object' && Array.isArray(input.items)) {
      parsed = parseScenario(input.items);
    }

    scenario = parsed;
    playbackIndex = 0;
    return { ok: true, loaded: scenario.length };
  };

  const sendTestMessage = async (message) => {
    const payload = typeof message === 'string' ? message.trim() : '';
    if (!payload) throw new Error('Test message is empty');
    await writeFrame(`${payload}\r\n`);
    return { ok: true };
  };

  const listPorts = async () => listSerialPorts();

  return {
    start,
    stop,
    getStatus,
    loadScenario,
    sendTestMessage,
    listPorts,
  };
};

module.exports = {
  createRwltComSimulator,
  parseScenario,
  resolveRwltModeFromCommand,
};
