const fs = require('fs/promises');
const dgram = require('dgram');

const DEFAULT_SIMULATOR_CONFIG = {
  mode: 'stream',
  messageMode: 'mix',
  targetHost: '127.0.0.1',
  dataPort: 28127,
  commandPort: 28128,
  bindInterface: '0.0.0.0',
  rateHz: 1,
  commandEcho: false,
  waitForOcon: false,
  beaconIds: [1, 2, 3],
};

const BEACON_TRAJECTORIES = ['orbit', 'figure8', 'zigzag'];

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
  if (normalized === 'command-echo' || normalized === 'command_echo') return 'command-echo';
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

const normalizeBeaconIds = (value, fallback) => {
  const source = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : typeof value === 'number'
        ? Array.from({ length: Math.max(0, Math.trunc(value)) }, (_, index) => index + 1)
        : [];

  const unique = [];
  const seen = new Set();
  for (const item of source) {
    const n = Number(String(item).trim());
    if (!Number.isInteger(n) || n < 1 || n > 16 || seen.has(n)) continue;
    seen.add(n);
    unique.push(n);
  }

  if (unique.length > 0) return unique;
  return [...fallback];
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

const formatNumber = (value, digits = 6) => Number(value).toFixed(digits);

const createAzmLocLine = (state) => {
  const lat = formatNumber(state.lat, 6);
  const lon = formatNumber(state.lon, 6);
  const course = formatNumber(state.course, 2);
  const speed = formatNumber(state.speed, 2);
  const heading = formatNumber(state.heading, 2);
  const depth = formatNumber(state.depth, 2);

  return `@AZMLOC,1013.2,${depth},12.3,0.1,-0.2,0,${lat},${lon},${course},${speed},0,${heading},0,`;
};

const createInitialBeaconStates = (beaconIds, baseLat, baseLon) => {
  const states = {};
  beaconIds.forEach((beaconId, index) => {
    const phase = (index / Math.max(1, beaconIds.length)) * Math.PI * 2;
    const anchorRadius = 0.00018;
    const offsetLat = anchorRadius * Math.sin(phase);
    const offsetLon = anchorRadius * Math.cos(phase);
    const anchorLat = baseLat + offsetLat;
    const anchorLon = baseLon + offsetLon;
    states[beaconId] = {
      lat: anchorLat,
      lon: anchorLon,
      depth: 8 + index,
      phase,
      offsetLat,
      offsetLon,
      trajectory: BEACON_TRAJECTORIES[index % BEACON_TRAJECTORIES.length],
    };
  });
  return states;
};

const updateBeaconState = (baseState, beaconState, index, tick) => {
  const speedFactor = 0.65 + index * 0.08;
  const t = tick * 0.11 * speedFactor + beaconState.phase;
  const driftLat = 0.00002 * Math.sin(tick * 0.025 + index * 0.6);
  const driftLon = 0.00002 * Math.cos(tick * 0.023 + index * 0.5);
  const anchorLat = baseState.lat + beaconState.offsetLat + driftLat;
  const anchorLon = baseState.lon + beaconState.offsetLon + driftLon;

  if (beaconState.trajectory === 'figure8') {
    beaconState.lat = anchorLat + 0.00013 * Math.sin(t * 1.2);
    beaconState.lon = anchorLon + 0.00017 * Math.sin(t) * Math.cos(t);
  } else if (beaconState.trajectory === 'zigzag') {
    const triangle = (2 / Math.PI) * Math.asin(Math.sin(t * 1.4));
    beaconState.lat = anchorLat + 0.00014 * triangle;
    beaconState.lon = anchorLon + 0.00016 * Math.sin(t * 0.7 + 0.4);
  } else {
    beaconState.lat = anchorLat + 0.00012 * Math.sin(t);
    beaconState.lon = anchorLon + 0.00016 * Math.cos(t * 1.08);
  }

  beaconState.depth = Math.max(0, 7.5 + index * 1.1 + 1.4 * Math.sin(t * 0.8 + index * 0.2));
  beaconState.phase += 0.055 + index * 0.006;
};

const createAzmRemLine = (state, beaconId, beaconState) => {
  const lat = formatNumber(beaconState.lat, 6);
  const lon = formatNumber(beaconState.lon, 6);
  const depth = formatNumber(beaconState.depth, 2);
  const slopeRange = formatNumber(60 + beaconId * 4 + Math.sin(beaconState.phase) * 1.5, 2);
  const azimuth = formatNumber((state.heading + beaconId * 16) % 360, 2);
  const ptime = formatNumber(0.55 + beaconId * 0.01, 3);
  const msr = formatNumber(24 + (beaconId % 4), 1);
  const srProjection = formatNumber(Math.max(0, Number(slopeRange) - 1.2), 2);
  const adistance = formatNumber(30 + beaconId * 2.5, 2);
  const aazimuth = formatNumber((state.course + beaconId * 11) % 360, 2);
  const elevation = formatNumber(15 + (beaconId % 6), 2);
  const vcc = formatNumber(10.5 + beaconId * 0.06, 2);
  const waterTemp = formatNumber(13.5 + (beaconId % 3) * 0.2, 2);
  const razimuth = formatNumber((state.heading + 180 + beaconId * 7) % 360, 2);

  return `@AZMREM,${beaconId},${slopeRange},${azimuth},${ptime},${msr},0,${depth},0,${srProjection},0,${adistance},0,${aazimuth},0,${elevation},0,${vcc},0,${waterTemp},0,${lat},${lon},0,${razimuth},0,Beacon-${beaconId},0,False,`;
};

const createBrokenLine = (tick) => {
  const variants = [
    '@AZMLOC,broken,line',
    '@AZMREM,1,2,3,broken',
    '@AZMLOC,1013.2,10.5,12.3,0.1,-0.2',
    '@BROKEN_MESSAGE,###',
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
    commandPort: clampPort(source.commandPort, DEFAULT_SIMULATOR_CONFIG.commandPort),
    bindInterface: normalizeHost(source.bindInterface, DEFAULT_SIMULATOR_CONFIG.bindInterface),
    rateHz: clampRate(source.rateHz, DEFAULT_SIMULATOR_CONFIG.rateHz),
    commandEcho: normalizeBoolean(source.commandEcho, DEFAULT_SIMULATOR_CONFIG.commandEcho),
    waitForOcon: normalizeBoolean(source.waitForOcon, DEFAULT_SIMULATOR_CONFIG.waitForOcon),
    beaconIds: normalizeBeaconIds(source.beaconIds ?? source.beacons, DEFAULT_SIMULATOR_CONFIG.beaconIds),
  };
};

const createZimaSimulator = () => {
  let status = 'stopped';
  let config = { ...DEFAULT_SIMULATOR_CONFIG };
  let senderSocket = null;
  let commandSocket = null;
  let streamTimer = null;
  let playbackTimer = null;
  let scenario = [];
  let playbackIndex = 0;
  let linkOpened = true;
  let tick = 0;
  let stats = {
    packetsSent: 0,
    bytesSent: 0,
    commandsReceived: 0,
    lastCommand: null,
    lastError: null,
    lastSentAt: null,
  };

  let state = {
    lat: 59.9375,
    lon: 30.3086,
    heading: 120,
    course: 120,
    speed: 0.7,
    depth: 10.5,
    x: 0,
    y: 0,
  };
  let beaconStates = createInitialBeaconStates(
    DEFAULT_SIMULATOR_CONFIG.beaconIds,
    state.lat,
    state.lon,
  );

  const resetStats = () => {
    stats = {
      packetsSent: 0,
      bytesSent: 0,
      commandsReceived: 0,
      lastCommand: null,
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
    const phase = tick / 7;
    state.lat += 0.000025 * Math.sin(phase);
    state.lon += 0.000025 * Math.cos(phase);
    state.course = (state.course + 9) % 360;
    state.heading = (state.heading + 7) % 360;
    state.speed = Math.max(0.1, 0.7 + 0.2 * Math.sin(phase));
    state.depth = Math.max(0, 10.5 + 1.6 * Math.sin(phase / 2));
    state.x += 0.7 * Math.cos(phase);
    state.y += 0.7 * Math.sin(phase);

    config.beaconIds.forEach((beaconId, index) => {
      const beacon = beaconStates[beaconId];
      if (!beacon) return;
      updateBeaconState(state, beacon, index, tick);
    });
  };

  const buildDatagram = () => {
    const mode = config.messageMode;
    if (mode === 'broken') {
      return `${createBrokenLine(tick)}\r\n`;
    }

    if (mode === 'mix' && tick % 7 === 0) {
      return `${createBrokenLine(tick)}\r\n`;
    }

    const loc = createAzmLocLine(state);
    const remLines = config.beaconIds.map((beaconId) => createAzmRemLine(state, beaconId, beaconStates[beaconId]));
    if (mode === 'mix' && tick % 3 === 0) {
      return `${loc}\r\n${remLines.join('\r\n')}\r\n`;
    }
    return `${loc}\r\n${remLines.join('\r\n')}\r\n`;
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

  const shouldSendTick = () => {
    if (!config.waitForOcon) return true;
    return linkOpened;
  };

  const runStreamTick = async () => {
    if (!shouldSendTick()) return;
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
    if (!shouldSendTick()) {
      playbackTimer = setTimeout(() => {
        void runPlayback();
      }, 250);
      return;
    }

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

  const applyCommand = (rawCommand) => {
    const command = rawCommand.trim();
    if (!command) return;
    stats.commandsReceived += 1;
    stats.lastCommand = command;

    if (command === 'OCON') {
      linkOpened = true;
      return;
    }
    if (command === 'CCON') {
      linkOpened = false;
      return;
    }
    if (command.startsWith('LHOV,')) {
      const parts = command.split(',');
      if (parts.length !== 4) return;
      const lat = Number(parts[1]);
      const lon = Number(parts[2]);
      const heading = Number(parts[3]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(heading)) return;
      state.lat = lat;
      state.lon = lon;
      state.heading = ((heading % 360) + 360) % 360;
      state.course = state.heading;
      beaconStates = createInitialBeaconStates(config.beaconIds, state.lat, state.lon);
    }
  };

  const startCommandEcho = async () => {
    if (!config.commandEcho && config.mode !== 'command-echo') return;
    commandSocket = dgram.createSocket('udp4');
    commandSocket.on('error', (error) => {
      setError(error);
    });
    commandSocket.on('message', (buffer) => {
      const message = Buffer.from(buffer).toString('ascii');
      applyCommand(message);
    });

    await new Promise((resolve, reject) => {
      commandSocket.once('listening', resolve);
      commandSocket.once('error', reject);
      commandSocket.bind(config.commandPort, config.bindInterface);
    });
  };

  const start = async (input) => {
    await stop();
    config = normalizeSimulatorConfig(input);
    resetStats();
    status = 'running';
    tick = 0;
    playbackIndex = 0;
    linkOpened = !config.waitForOcon;
    beaconStates = createInitialBeaconStates(config.beaconIds, state.lat, state.lon);

    senderSocket = dgram.createSocket('udp4');
    senderSocket.on('error', (error) => {
      setError(error);
    });

    try {
      await startCommandEcho();
    } catch (error) {
      setError(error);
      return getStatus();
    }

    if (config.mode === 'single') {
      await runStreamTick();
      await stop();
      return getStatus();
    }

    if (config.mode === 'playback') {
      if (scenario.length === 0) {
        const beaconId = config.beaconIds[0] ?? 1;
        scenario = [
          { msg: createAzmLocLine(state), delayMs: 1000 },
          { msg: createAzmRemLine(state, beaconId, beaconStates[beaconId]), delayMs: 1000 },
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
    const currentCommand = commandSocket;
    senderSocket = null;
    commandSocket = null;
    await closeSocket(currentSender);
    await closeSocket(currentCommand);
    status = 'stopped';
    return getStatus();
  };

  const getStatus = () => ({
    status,
    config,
    linkOpened,
    beaconIds: [...config.beaconIds],
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
  createZimaSimulator,
  parseScenario,
};
