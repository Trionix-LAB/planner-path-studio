const fs = require('fs/promises');
const dgram = require('dgram');

const DEFAULT_SIMULATOR_CONFIG = {
  mode: 'stream',
  messageMode: 'mix',
  targetHost: '127.0.0.1',
  dataPort: 28128,
  rateHz: 2,
};

const clampPort = (value, fallback) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 65535) return fallback;
  return n;
};

const clampRate = (value, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0.1, Math.min(100, n));
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

const createRmcLine = (state, date) => {
  const time = formatUtcTime(date);
  const day = formatUtcDate(date);
  const lat = formatNmeaCoord(state.lat, true);
  const lon = formatNmeaCoord(state.lon, false);
  const latHemi = state.lat >= 0 ? 'N' : 'S';
  const lonHemi = state.lon >= 0 ? 'E' : 'W';
  const speedKnots = (state.speedMps / 0.514444).toFixed(2);
  const course = ((state.course % 360) + 360) % 360;
  return addChecksum(`GPRMC,${time},A,${lat},${latHemi},${lon},${lonHemi},${speedKnots},${course.toFixed(2)},${day},,,A`);
};

const createGgaLine = (state, date) => {
  const time = formatUtcTime(date);
  const lat = formatNmeaCoord(state.lat, true);
  const lon = formatNmeaCoord(state.lon, false);
  const latHemi = state.lat >= 0 ? 'N' : 'S';
  const lonHemi = state.lon >= 0 ? 'E' : 'W';
  return addChecksum(`GPGGA,${time},${lat},${latHemi},${lon},${lonHemi},1,10,0.8,5.3,M,0.0,M,,`);
};

const createHdtLine = (state) => {
  const heading = ((state.heading % 360) + 360) % 360;
  return addChecksum(`HEHDT,${heading.toFixed(2)},T`);
};

const createBrokenLine = (tick) => {
  const variants = [
    '$GPRMC,broken,line,*00',
    '$GPGGA,123519,5956.25,N,03018.51,E,1',
    '$HEHDT,###,T*00',
    '$BROKEN,###',
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
    targetHost: normalizeHost(source.targetHost, DEFAULT_SIMULATOR_CONFIG.targetHost),
    dataPort: clampPort(source.dataPort, DEFAULT_SIMULATOR_CONFIG.dataPort),
    rateHz: clampRate(source.rateHz, DEFAULT_SIMULATOR_CONFIG.rateHz),
  };
};

const createGnssSimulator = () => {
  let status = 'stopped';
  let config = { ...DEFAULT_SIMULATOR_CONFIG };
  let senderSocket = null;
  let streamTimer = null;
  let playbackTimer = null;
  let scenario = [];
  let playbackIndex = 0;
  let tick = 0;
  let stats = {
    packetsSent: 0,
    bytesSent: 0,
    lastError: null,
    lastSentAt: null,
  };

  let state = {
    lat: 59.9375,
    lon: 30.3086,
    course: 120,
    heading: 120,
    speedMps: 0.8,
  };

  const resetStats = () => {
    stats = {
      packetsSent: 0,
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

  const closeSocket = async (socket) =>
    new Promise((resolve) => {
      if (!socket) {
        resolve();
        return;
      }
      try {
        socket.close(() => resolve());
      } catch {
        resolve();
      }
    });

  const advanceState = () => {
    tick += 1;
    const phase = tick / 6;
    state.lat += 0.000018 * Math.sin(phase);
    state.lon += 0.000018 * Math.cos(phase);
    state.course = (state.course + 8) % 360;
    state.heading = (state.heading + 6) % 360;
    state.speedMps = Math.max(0.2, 0.8 + 0.18 * Math.sin(phase / 2));
  };

  const buildDatagram = () => {
    if (config.messageMode === 'broken') {
      return `${createBrokenLine(tick)}\r\n`;
    }

    if (config.messageMode === 'mix' && tick % 8 === 0) {
      return `${createBrokenLine(tick)}\r\n`;
    }

    const now = new Date();
    const lines = [createRmcLine(state, now), createGgaLine(state, now), createHdtLine(state)];
    return `${lines.join('\r\n')}\r\n`;
  };

  const sendDatagram = async (datagram) => {
    if (!senderSocket) return;
    const payload = Buffer.from(datagram, 'ascii');
    await new Promise((resolve, reject) => {
      senderSocket.send(payload, config.dataPort, config.targetHost, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    stats.packetsSent += 1;
    stats.bytesSent += payload.byteLength;
    stats.lastSentAt = Date.now();
  };

  const runStreamTick = async () => {
    advanceState();
    const datagram = buildDatagram();
    try {
      await sendDatagram(datagram);
    } catch (error) {
      setError(error);
    }
  };

  const runPlayback = async () => {
    if (status !== 'running') return;
    if (scenario.length === 0) {
      status = 'stopped';
      return;
    }

    const current = scenario[playbackIndex % scenario.length];
    playbackIndex += 1;
    try {
      await sendDatagram(`${current.msg}\r\n`);
    } catch (error) {
      setError(error);
      return;
    }

    playbackTimer = setTimeout(() => {
      void runPlayback();
    }, Math.max(0, current.delayMs));
  };

  const start = async (input) => {
    await stop();
    config = normalizeSimulatorConfig(input);
    resetStats();
    status = 'running';
    tick = 0;
    playbackIndex = 0;

    senderSocket = dgram.createSocket('udp4');
    senderSocket.on('error', (error) => {
      setError(error);
    });

    if (config.mode === 'single') {
      await runStreamTick();
      await stop();
      return getStatus();
    }

    if (config.mode === 'playback') {
      if (scenario.length === 0) {
        const now = new Date();
        scenario = [
          { msg: createRmcLine(state, now), delayMs: 500 },
          { msg: createGgaLine(state, now), delayMs: 500 },
          { msg: createHdtLine(state), delayMs: 500 },
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
    const currentSender = senderSocket;
    senderSocket = null;
    await closeSocket(currentSender);
    status = 'stopped';
    return getStatus();
  };

  const getStatus = () => ({
    status,
    config,
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
    if (!senderSocket) {
      const transient = dgram.createSocket('udp4');
      const bytes = Buffer.from(payload, 'ascii');
      await new Promise((resolve, reject) => {
        transient.send(bytes, config.dataPort, config.targetHost, (error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }).finally(() => {
        try {
          transient.close();
        } catch {
          // ignore
        }
      });
      return { ok: true };
    }

    await sendDatagram(`${payload}\r\n`);
    return { ok: true };
  };

  return {
    start,
    stop,
    getStatus,
    loadScenario,
    sendTestMessage,
  };
};

module.exports = {
  createGnssSimulator,
};
