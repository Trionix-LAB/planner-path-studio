import { parseZimaLine } from '@/features/devices/zima2r/protocol';
import { parseNmeaLine } from '@/features/devices/gnss-udp/protocol';

export type TelemetryConnectionState = 'ok' | 'timeout' | 'error';
export type TelemetryEntityType = 'agent' | 'base_station';

export type TelemetryFix = {
  lat: number;
  lon: number;
  speed: number;
  course: number;
  heading?: number | null;
  depth: number;
  received_at: number;
  remoteAddress?: number | null;
  beaconId?: string | null;
  source?: 'AZMLOC' | 'AZMREM' | 'GNSS' | 'SIM';
  entity_type?: TelemetryEntityType;
  entity_id?: string;
  navigation_source_id?: string;
};

export type TelemetryProvider = {
  start: () => void;
  stop: () => void;
  setEnabled: (enabled: boolean) => void;
  setSimulateConnectionError: (enabled: boolean) => void;
  onFix: (listener: (fix: TelemetryFix) => void) => () => void;
  onConnectionState: (listener: (state: TelemetryConnectionState) => void) => () => void;
};

type ElectronZimaConfig = {
  ipAddress: string;
  dataPort: number;
  commandPort: number;
  useCommandPort: boolean;
  useExternalGnss: boolean;
  latitude: number | null;
  longitude: number | null;
  azimuth: number | null;
};

type ElectronZimaApi = {
  start: (config: ElectronZimaConfig) => Promise<unknown>;
  stop: () => Promise<unknown>;
  sendCommand: (command: string) => Promise<unknown>;
  onData: (listener: (payload: { message?: string; receivedAt?: number }) => void) => () => void;
  onStatus: (listener: (payload: { status?: string }) => void) => () => void;
  onError: (listener: (payload: { message?: string }) => void) => () => void;
};

type ElectronTelemetryOptions = {
  timeoutMs?: number;
  readConfig: () => Promise<ElectronZimaConfig | null>;
};

type ElectronGnssConfig = {
  ipAddress: string;
  dataPort: number;
};

type ElectronGnssApi = {
  start: (config: ElectronGnssConfig) => Promise<unknown>;
  stop: () => Promise<unknown>;
  onData: (listener: (payload: { message?: string; receivedAt?: number }) => void) => () => void;
  onStatus: (listener: (payload: { status?: string }) => void) => () => void;
  onError: (listener: (payload: { message?: string }) => void) => () => void;
};

type ElectronGnssTelemetryOptions = {
  timeoutMs?: number;
  readConfig: () => Promise<ElectronGnssConfig | null>;
};

type SimulationTelemetryOptions = {
  intervalMs?: number;
  timeoutMs?: number;
  startLat?: number;
  startLon?: number;
  startSpeed?: number;
  startCourse?: number;
  startDepth?: number;
};

const DEFAULT_INTERVAL_MS = 1000;
const DEFAULT_TIMEOUT_MS = 5000;
const MAX_BUFFERED_ZIMA_BYTES = 16 * 1024;
const MAX_BUFFERED_NMEA_BYTES = 16 * 1024;

const isValidLatLon = (lat: number | null, lon: number | null): lat is number =>
  lat !== null &&
  lon !== null &&
  Number.isFinite(lat) &&
  Number.isFinite(lon) &&
  lat >= -90 &&
  lat <= 90 &&
  lon >= -180 &&
  lon <= 180 &&
  !(lat === 0 && lon === 0);

const splitBufferedLines = (
  previousBuffer: string,
  chunk: string,
): { lines: string[]; rest: string } => {
  const merged = `${previousBuffer}${chunk}`;
  const parts = merged.split(/\r?\n/);
  const lines = parts
    .slice(0, -1)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const rest = parts[parts.length - 1] ?? '';
  return { lines, rest };
};

export const createNoopTelemetryProvider = (): TelemetryProvider => {
  const connectionListeners = new Set<(nextState: TelemetryConnectionState) => void>();

  return {
    start: () => {
      // Electron MVP: telemetry stream is disabled, keep stable "ok" state.
      connectionListeners.forEach((listener) => listener('ok'));
    },
    stop: () => {
      // no-op
    },
    setEnabled: () => {
      // no-op
    },
    setSimulateConnectionError: () => {
      // no-op
    },
    onFix: () => {
      return () => {
        // no-op
      };
    },
    onConnectionState: (listener) => {
      connectionListeners.add(listener);
      return () => {
        connectionListeners.delete(listener);
      };
    },
  };
};

export const createSimulationTelemetryProvider = (
  options?: SimulationTelemetryOptions,
): TelemetryProvider => {
  const intervalMs = options?.intervalMs ?? DEFAULT_INTERVAL_MS;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let enabled = true;
  let simulateConnectionError = false;
  let state = {
    lat: options?.startLat ?? 59.93428,
    lon: options?.startLon ?? 30.335099,
    speed: options?.startSpeed ?? 0.8,
    course: options?.startCourse ?? 45,
    depth: options?.startDepth ?? 12.5,
  };
  let tick = 0;
  let lossTicksRemaining = 0;
  let lastFixAt = Date.now();
  let connectionState: TelemetryConnectionState = 'ok';

  let dataIntervalId: number | null = null;
  let timeoutIntervalId: number | null = null;

  const fixListeners = new Set<(fix: TelemetryFix) => void>();
  const connectionListeners = new Set<(nextState: TelemetryConnectionState) => void>();

  const emitConnectionState = (nextState: TelemetryConnectionState) => {
    if (nextState === connectionState) return;
    connectionState = nextState;
    connectionListeners.forEach((listener) => listener(nextState));
  };

  const emitFix = (fix: TelemetryFix) => {
    fixListeners.forEach((listener) => listener(fix));
  };

  const runDataTick = () => {
    if (!enabled) return;
    if (simulateConnectionError) {
      emitConnectionState('error');
      return;
    }

    tick += 1;
    if (lossTicksRemaining > 0) {
      lossTicksRemaining -= 1;
      return;
    }
    if (tick % 35 === 0) {
      lossTicksRemaining = 7;
      return;
    }

    state = {
      lat: state.lat + 0.00003 * Math.sin(tick / 6),
      lon: state.lon + 0.00003 * Math.cos(tick / 6),
      speed: Math.max(0.2, 0.8 + 0.25 * Math.sin(tick / 4)),
      course: (state.course + 12) % 360,
      depth: Math.max(0, 12 + 2 * Math.sin(tick / 5)),
    };

    lastFixAt = Date.now();
    emitConnectionState('ok');
    emitFix({
      ...state,
      heading: state.course,
      received_at: lastFixAt,
      source: 'SIM',
      entity_type: 'agent',
      entity_id: 'sim-agent-1',
      navigation_source_id: 'simulation',
    });
  };

  const runTimeoutTick = () => {
    if (!enabled || simulateConnectionError) return;
    if (Date.now() - lastFixAt > timeoutMs) {
      emitConnectionState('timeout');
    }
  };

  const start = () => {
    if (dataIntervalId !== null || timeoutIntervalId !== null) return;
    lastFixAt = Date.now();
    dataIntervalId = window.setInterval(runDataTick, intervalMs);
    timeoutIntervalId = window.setInterval(runTimeoutTick, 1000);
  };

  const stop = () => {
    if (dataIntervalId !== null) {
      window.clearInterval(dataIntervalId);
      dataIntervalId = null;
    }
    if (timeoutIntervalId !== null) {
      window.clearInterval(timeoutIntervalId);
      timeoutIntervalId = null;
    }
  };

  return {
    start,
    stop,
    setEnabled: (nextEnabled: boolean) => {
      enabled = nextEnabled;
      if (!enabled) {
        emitConnectionState('ok');
        return;
      }
      lastFixAt = Date.now();
      if (!simulateConnectionError) {
        emitConnectionState('ok');
      }
    },
    setSimulateConnectionError: (nextValue: boolean) => {
      simulateConnectionError = nextValue;
      if (simulateConnectionError) {
        emitConnectionState('error');
        return;
      }
      lastFixAt = Date.now();
      if (enabled) {
        emitConnectionState('ok');
      }
    },
    onFix: (listener) => {
      fixListeners.add(listener);
      return () => {
        fixListeners.delete(listener);
      };
    },
    onConnectionState: (listener) => {
      connectionListeners.add(listener);
      return () => {
        connectionListeners.delete(listener);
      };
    },
  };
};

export const createElectronZimaTelemetryProvider = (
  options: ElectronTelemetryOptions,
): TelemetryProvider => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let enabled = false;
  let simulateConnectionError = false;
  let started = false;
  let connected = false;
  let activeConfig: ElectronZimaConfig | null = null;
  let connectionState: TelemetryConnectionState = 'ok';
  let lastFixAt = 0;
  let lineBuffer = '';
  let latestMotion = { speed: 0, course: 0, depth: 0 };

  let timeoutIntervalId: number | null = null;
  let unsubscribeData: (() => void) | null = null;
  let unsubscribeStatus: (() => void) | null = null;
  let unsubscribeError: (() => void) | null = null;

  const fixListeners = new Set<(fix: TelemetryFix) => void>();
  const connectionListeners = new Set<(nextState: TelemetryConnectionState) => void>();

  const emitConnectionState = (nextState: TelemetryConnectionState) => {
    if (connectionState === nextState) return;
    connectionState = nextState;
    connectionListeners.forEach((listener) => listener(nextState));
  };

  const emitFix = (fix: TelemetryFix) => {
    fixListeners.forEach((listener) => listener(fix));
  };

  const clearIntervals = () => {
    if (timeoutIntervalId !== null) {
      window.clearInterval(timeoutIntervalId);
      timeoutIntervalId = null;
    }
  };

  const getApi = (): ElectronZimaApi | null => {
    const api = (window as unknown as { electronAPI?: { zima?: ElectronZimaApi } }).electronAPI?.zima;
    return api ?? null;
  };

  const handleData = (payload: { message?: string; receivedAt?: number }) => {
    if (!enabled || simulateConnectionError) return;
    const message = payload.message ?? '';
    if (!message) return;

    const { lines, rest } = splitBufferedLines(lineBuffer, message);
    lineBuffer = rest.slice(-MAX_BUFFERED_ZIMA_BYTES);

    for (const line of lines) {
      const parsed = parseZimaLine(line);
      const receivedAt = payload.receivedAt ?? Date.now();

      if (parsed.kind === 'AZMLOC') {
        latestMotion = {
          speed: parsed.speed,
          course: parsed.course,
          depth: parsed.depth,
        };
        lastFixAt = receivedAt;
        emitConnectionState('ok');
        emitFix({
          lat: parsed.lat,
          lon: parsed.lon,
          speed: parsed.speed,
          course: parsed.course,
          heading: parsed.heading,
          depth: parsed.depth,
          received_at: receivedAt,
          source: 'AZMLOC',
          entity_type: 'base_station',
          entity_id: 'base-station',
          navigation_source_id: 'zima2r',
        });
        continue;
      }

      if (parsed.kind === 'AZMREM' && parsed.isTimeout !== true && isValidLatLon(parsed.lat, parsed.lon)) {
        lastFixAt = receivedAt;
        emitConnectionState('ok');
        emitFix({
          lat: parsed.lat,
          lon: parsed.lon,
          speed: latestMotion.speed,
          course: latestMotion.course,
          heading: latestMotion.course,
          depth: parsed.depth ?? latestMotion.depth,
          received_at: receivedAt,
          remoteAddress: parsed.remoteAddress,
          beaconId: parsed.beaconId,
          source: 'AZMREM',
          entity_type: 'agent',
          entity_id: parsed.beaconId ? `beacon-${parsed.beaconId}` : undefined,
          navigation_source_id: 'zima2r',
        });
      }
    }
  };

  const startTimeoutWatchdog = () => {
    clearIntervals();
    timeoutIntervalId = window.setInterval(() => {
      if (!enabled || simulateConnectionError) return;
      if (lastFixAt === 0) return;
      if (Date.now() - lastFixAt > timeoutMs) {
        emitConnectionState('timeout');
      }
    }, 1000);
  };

  const disconnectBridge = () => {
    const api = getApi();
    const shouldCloseConnections = connected && activeConfig?.useCommandPort;
    connected = false;
    activeConfig = null;
    lineBuffer = '';
    latestMotion = { speed: 0, course: 0, depth: 0 };
    clearIntervals();
    if (api) {
      if (shouldCloseConnections) {
        void api.sendCommand('CCON').catch(() => {
          // ignore
        });
      }
      void api.stop().catch(() => {
        // ignore
      });
    }
  };

  const detachListeners = () => {
    if (unsubscribeData) {
      unsubscribeData();
      unsubscribeData = null;
    }
    if (unsubscribeStatus) {
      unsubscribeStatus();
      unsubscribeStatus = null;
    }
    if (unsubscribeError) {
      unsubscribeError();
      unsubscribeError = null;
    }
  };

  const connectBridge = async () => {
    if (!started || !enabled || connected || simulateConnectionError) return;
    const api = getApi();
    if (!api) {
      emitConnectionState('error');
      return;
    }

    try {
      const config = await options.readConfig();
      if (!config) {
        emitConnectionState('error');
        return;
      }

      await api.start(config);
      activeConfig = config;
      if (config.useCommandPort) {
        await api.sendCommand('OCON');
        if (!config.useExternalGnss) {
          const hasManualLhov =
            config.latitude !== null &&
            config.longitude !== null &&
            config.azimuth !== null;
          if (hasManualLhov) {
            await api.sendCommand(`LHOV,${config.latitude},${config.longitude},${config.azimuth}`);
          }
        }
      }
      connected = true;
      lastFixAt = Date.now();
      emitConnectionState('ok');
      startTimeoutWatchdog();
    } catch {
      connected = false;
      emitConnectionState('error');
    }
  };

  const stop = () => {
    started = false;
    disconnectBridge();
    detachListeners();
  };

  const start = () => {
    if (started) return;
    started = true;

    const api = getApi();
    if (!api) {
      emitConnectionState('error');
      return;
    }

    unsubscribeData = api.onData((payload) => handleData(payload));
    unsubscribeStatus = api.onStatus((payload) => {
      if (!payload?.status) return;
      if (payload.status === 'running' && !simulateConnectionError) {
        emitConnectionState('ok');
      } else if (payload.status === 'error') {
        emitConnectionState('error');
      }
    });
    unsubscribeError = api.onError(() => {
      emitConnectionState('error');
    });

    void connectBridge();
  };

  return {
    start,
    stop,
    setEnabled: (nextEnabled: boolean) => {
      enabled = nextEnabled;
      if (!enabled) {
        disconnectBridge();
        emitConnectionState('ok');
        return;
      }
      if (started) {
        void connectBridge();
      }
    },
    setSimulateConnectionError: (nextValue: boolean) => {
      simulateConnectionError = nextValue;
      if (simulateConnectionError) {
        emitConnectionState('error');
        return;
      }
      if (enabled) {
        emitConnectionState('ok');
      }
    },
    onFix: (listener) => {
      fixListeners.add(listener);
      return () => {
        fixListeners.delete(listener);
      };
    },
    onConnectionState: (listener) => {
      connectionListeners.add(listener);
      return () => {
        connectionListeners.delete(listener);
      };
    },
  };
};

export const createElectronGnssTelemetryProvider = (
  options: ElectronGnssTelemetryOptions,
): TelemetryProvider => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let enabled = false;
  let simulateConnectionError = false;
  let started = false;
  let connected = false;
  let connectionState: TelemetryConnectionState = 'ok';
  let lastFixAt = 0;
  let lineBuffer = '';
  let latestMotion = { speed: 0, course: 0 };
  let latestHeading: number | null = null;

  let timeoutIntervalId: number | null = null;
  let unsubscribeData: (() => void) | null = null;
  let unsubscribeStatus: (() => void) | null = null;
  let unsubscribeError: (() => void) | null = null;

  const fixListeners = new Set<(fix: TelemetryFix) => void>();
  const connectionListeners = new Set<(nextState: TelemetryConnectionState) => void>();

  const emitConnectionState = (nextState: TelemetryConnectionState) => {
    if (connectionState === nextState) return;
    connectionState = nextState;
    connectionListeners.forEach((listener) => listener(nextState));
  };

  const emitFix = (fix: TelemetryFix) => {
    fixListeners.forEach((listener) => listener(fix));
  };

  const clearIntervals = () => {
    if (timeoutIntervalId !== null) {
      window.clearInterval(timeoutIntervalId);
      timeoutIntervalId = null;
    }
  };

  const getApi = (): ElectronGnssApi | null => {
    const api = (window as unknown as { electronAPI?: { gnss?: ElectronGnssApi } }).electronAPI?.gnss;
    return api ?? null;
  };

  const handleData = (payload: { message?: string; receivedAt?: number }) => {
    if (!enabled || simulateConnectionError) return;
    const message = payload.message ?? '';
    if (!message) return;

    const { lines, rest } = splitBufferedLines(lineBuffer, message);
    lineBuffer = rest.slice(-MAX_BUFFERED_NMEA_BYTES);

    for (const line of lines) {
      const parsed = parseNmeaLine(line);
      const receivedAt = payload.receivedAt ?? Date.now();

      if (parsed.kind === 'HDT' && parsed.headingDeg !== null) {
        latestHeading = parsed.headingDeg;
        continue;
      }

      if (parsed.kind !== 'RMC' && parsed.kind !== 'GGA' && parsed.kind !== 'GNS') {
        continue;
      }

      if (!parsed.hasFix || !isValidLatLon(parsed.lat, parsed.lon)) {
        continue;
      }

      if (parsed.speedMps !== null) {
        latestMotion.speed = Math.max(0, parsed.speedMps);
      }
      if (parsed.courseDeg !== null) {
        latestMotion.course = parsed.courseDeg;
      } else if (latestHeading !== null) {
        latestMotion.course = latestHeading;
      }

      lastFixAt = receivedAt;
      emitConnectionState('ok');
      emitFix({
        lat: parsed.lat,
        lon: parsed.lon,
        speed: latestMotion.speed,
        course: latestMotion.course,
        heading: latestHeading,
        depth: 0,
        received_at: receivedAt,
        source: 'GNSS',
        entity_type: 'base_station',
        entity_id: 'base-station',
        navigation_source_id: 'gnss-udp',
      });
    }
  };

  const startTimeoutWatchdog = () => {
    clearIntervals();
    timeoutIntervalId = window.setInterval(() => {
      if (!enabled || simulateConnectionError) return;
      if (lastFixAt === 0) return;
      if (Date.now() - lastFixAt > timeoutMs) {
        emitConnectionState('timeout');
      }
    }, 1000);
  };

  const disconnectBridge = () => {
    const api = getApi();
    connected = false;
    lineBuffer = '';
    latestMotion = { speed: 0, course: 0 };
    latestHeading = null;
    clearIntervals();
    if (api) {
      void api.stop().catch(() => {
        // ignore
      });
    }
  };

  const detachListeners = () => {
    if (unsubscribeData) {
      unsubscribeData();
      unsubscribeData = null;
    }
    if (unsubscribeStatus) {
      unsubscribeStatus();
      unsubscribeStatus = null;
    }
    if (unsubscribeError) {
      unsubscribeError();
      unsubscribeError = null;
    }
  };

  const connectBridge = async () => {
    if (!started || !enabled || connected || simulateConnectionError) return;
    const api = getApi();
    if (!api) {
      emitConnectionState('error');
      return;
    }

    try {
      const config = await options.readConfig();
      if (!config) {
        emitConnectionState('error');
        return;
      }

      await api.start(config);
      connected = true;
      lastFixAt = Date.now();
      emitConnectionState('ok');
      startTimeoutWatchdog();
    } catch {
      connected = false;
      emitConnectionState('error');
    }
  };

  const stop = () => {
    started = false;
    disconnectBridge();
    detachListeners();
  };

  const start = () => {
    if (started) return;
    started = true;

    const api = getApi();
    if (!api) {
      emitConnectionState('error');
      return;
    }

    unsubscribeData = api.onData((payload) => handleData(payload));
    unsubscribeStatus = api.onStatus((payload) => {
      if (!payload?.status) return;
      if (payload.status === 'running' && !simulateConnectionError) {
        emitConnectionState('ok');
      } else if (payload.status === 'error') {
        emitConnectionState('error');
      }
    });
    unsubscribeError = api.onError(() => {
      emitConnectionState('error');
    });

    void connectBridge();
  };

  return {
    start,
    stop,
    setEnabled: (nextEnabled: boolean) => {
      enabled = nextEnabled;
      if (!enabled) {
        disconnectBridge();
        emitConnectionState('ok');
        return;
      }
      if (started) {
        void connectBridge();
      }
    },
    setSimulateConnectionError: (nextValue: boolean) => {
      simulateConnectionError = nextValue;
      if (simulateConnectionError) {
        emitConnectionState('error');
        return;
      }
      if (enabled) {
        emitConnectionState('ok');
      }
    },
    onFix: (listener) => {
      fixListeners.add(listener);
      return () => {
        fixListeners.delete(listener);
      };
    },
    onConnectionState: (listener) => {
      connectionListeners.add(listener);
      return () => {
        connectionListeners.delete(listener);
      };
    },
  };
};
