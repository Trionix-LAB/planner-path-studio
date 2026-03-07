import { parseZimaLine } from '@/features/devices/zima2r/protocol';
import { parseNmeaLine } from '@/features/devices/gnss-udp/protocol';
import { parseRwltLine, type RwltPrwlaMessage } from '@/features/devices/rwlt-com/protocol';

export type TelemetryConnectionState = 'ok' | 'timeout' | 'error';
export type TelemetryEntityType = 'agent' | 'base_station' | 'diver';

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
  source?: 'AZMLOC' | 'AZMREM' | 'GNSS' | 'RWLT' | 'SIM';
  entity_type?: TelemetryEntityType;
  entity_id?: string;
  navigation_source_id?: string;
};

export type RawTelemetryPacket = {
  schema_id: string;
  raw: string;
  received_at: number;
};

export type TelemetryProvider = {
  start: () => void;
  stop: () => void;
  setEnabled: (enabled: boolean) => void;
  setSimulateConnectionError: (enabled: boolean) => void;
  onFix: (listener: (fix: TelemetryFix) => void) => () => void;
  onRawPacket: (listener: (packet: RawTelemetryPacket) => void) => () => void;
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

type ElectronGnssComBridgeConfig = {
  autoDetectPort: boolean;
  comPort: string;
  baudRate: number;
};

type ElectronGnssComConfig = ElectronGnssComBridgeConfig & {
  navigationSourceId: string;
};

type ElectronGnssComApi = {
  start: (config: ElectronGnssComBridgeConfig) => Promise<unknown>;
  stop: () => Promise<unknown>;
  onData: (listener: (payload: { message?: string; receivedAt?: number; portPath?: string }) => void) => () => void;
  onStatus: (listener: (payload: { status?: string }) => void) => () => void;
  onError: (listener: (payload: { message?: string }) => void) => () => void;
};

type ElectronGnssComTelemetryOptions = {
  timeoutMs?: number;
  readConfig: () => Promise<ElectronGnssComConfig | null>;
};

type ElectronRwltComBridgeConfig = {
  autoDetectPort: boolean;
  comPort: string;
  baudRate: number;
  mode: 'pinger' | 'divers';
};

type ElectronRwltComConfig = ElectronRwltComBridgeConfig & {
  navigationSourceId: string;
};

type ElectronRwltComApi = {
  start: (config: ElectronRwltComBridgeConfig) => Promise<unknown>;
  stop: () => Promise<unknown>;
  onData: (listener: (payload: { message?: string; receivedAt?: number; portPath?: string }) => void) => () => void;
  onStatus: (listener: (payload: { status?: string }) => void) => () => void;
  onError: (listener: (payload: { message?: string }) => void) => () => void;
};

type ElectronRwltComTelemetryOptions = {
  timeoutMs?: number;
  readConfig: () => Promise<ElectronRwltComConfig | null>;
  resolveDiver: (tId: number) => { uid: string; id: string } | null;
  onBuoyUpdate: (buoy: RwltPrwlaMessage) => void;
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
const HDT_FRESHNESS_TIMEOUT_MS = 5000;
const MAX_BUFFERED_ZIMA_BYTES = 16 * 1024;
const MAX_BUFFERED_NMEA_BYTES = 16 * 1024;
const EARTH_RADIUS_M = 6_371_000;

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

type GroundTrackPoint = {
  lat: number;
  lon: number;
  receivedAt: number;
};

const normalizeCourseDeg = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return ((value % 360) + 360) % 360;
};

const toRadians = (deg: number): number => (deg * Math.PI) / 180;
const toDegrees = (rad: number): number => (rad * 180) / Math.PI;

const haversineDistanceMeters = (from: GroundTrackPoint, to: GroundTrackPoint): number => {
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const dLat = lat2 - lat1;
  const dLon = toRadians(to.lon - from.lon);

  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const a = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
};

const initialGroundMotion = () => ({ speed: 0, course: 0 });

const computeGroundMotion = (
  previous: GroundTrackPoint | null,
  current: GroundTrackPoint,
): { speed: number; course: number } => {
  if (!previous) return initialGroundMotion();

  const dtMs = current.receivedAt - previous.receivedAt;
  if (!Number.isFinite(dtMs) || dtMs <= 0) {
    return initialGroundMotion();
  }

  const distance = haversineDistanceMeters(previous, current);
  if (!Number.isFinite(distance) || distance <= 0) {
    return initialGroundMotion();
  }

  const lat1 = toRadians(previous.lat);
  const lat2 = toRadians(current.lat);
  const dLon = toRadians(current.lon - previous.lon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const course = normalizeCourseDeg(toDegrees(Math.atan2(y, x)));
  const speed = distance / (dtMs / 1000);

  if (!Number.isFinite(speed) || speed < 0) {
    return { speed: 0, course };
  }
  return { speed, course };
};

const isFreshHeading = (headingAt: number, receivedAt: number): boolean => {
  if (!Number.isFinite(headingAt) || headingAt <= 0) return false;
  const ageMs = receivedAt - headingAt;
  return ageMs >= 0 && ageMs <= HDT_FRESHNESS_TIMEOUT_MS;
};

export const createNoopTelemetryProvider = (): TelemetryProvider => {
  const connectionListeners = new Set<(nextState: TelemetryConnectionState) => void>();
  const rawPacketListeners = new Set<(packet: RawTelemetryPacket) => void>();

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
    onRawPacket: (listener) => {
      rawPacketListeners.add(listener);
      return () => {
        rawPacketListeners.delete(listener);
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
  const rawPacketListeners = new Set<(packet: RawTelemetryPacket) => void>();

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
    onRawPacket: (listener) => {
      rawPacketListeners.add(listener);
      return () => {
        rawPacketListeners.delete(listener);
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
  let connectionState: TelemetryConnectionState = 'timeout';
  let lastFixAt = 0;
  let lineBuffer = '';
  const lastAzmRemPointByBeacon = new Map<string, GroundTrackPoint>();

  let timeoutIntervalId: number | null = null;
  let unsubscribeData: (() => void) | null = null;
  let unsubscribeStatus: (() => void) | null = null;
  let unsubscribeError: (() => void) | null = null;

  const fixListeners = new Set<(fix: TelemetryFix) => void>();
  const connectionListeners = new Set<(nextState: TelemetryConnectionState) => void>();
  const rawPacketListeners = new Set<(packet: RawTelemetryPacket) => void>();

  const emitConnectionState = (nextState: TelemetryConnectionState) => {
    if (connectionState === nextState) return;
    connectionState = nextState;
    connectionListeners.forEach((listener) => listener(nextState));
  };

  const emitFix = (fix: TelemetryFix) => {
    fixListeners.forEach((listener) => listener(fix));
  };
  const emitRawPacket = (packet: RawTelemetryPacket) => {
    rawPacketListeners.forEach((listener) => listener(packet));
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
    let nextRest = rest;
    let linesToProcess = lines;
    if (linesToProcess.length === 0) {
      const candidate = rest.trim();
      const parsedCandidate = parseZimaLine(candidate);
      const looksTerminated = candidate.endsWith(',');
      if (candidate.length > 0 && (parsedCandidate.kind !== 'UNKNOWN' || looksTerminated)) {
        linesToProcess = [candidate];
        nextRest = '';
      }
    }
    lineBuffer = nextRest.slice(-MAX_BUFFERED_ZIMA_BYTES);

    for (const line of linesToProcess) {
      const receivedAt = payload.receivedAt ?? Date.now();
      emitRawPacket({
        schema_id: 'zima2r',
        raw: line,
        received_at: receivedAt,
      });
      const parsed = parseZimaLine(line);

      if (parsed.kind === 'AZMLOC') {
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
        const beaconKey = parsed.beaconId ?? (parsed.remoteAddress !== null ? String(parsed.remoteAddress) : null);
        if (!beaconKey) {
          continue;
        }

        const currentPoint: GroundTrackPoint = {
          lat: parsed.lat,
          lon: parsed.lon,
          receivedAt,
        };
        const groundMotion = computeGroundMotion(lastAzmRemPointByBeacon.get(beaconKey) ?? null, currentPoint);
        lastAzmRemPointByBeacon.set(beaconKey, currentPoint);

        lastFixAt = receivedAt;
        emitConnectionState('ok');
        emitFix({
          lat: parsed.lat,
          lon: parsed.lon,
          speed: groundMotion.speed,
          course: groundMotion.course,
          heading: groundMotion.course,
          depth: parsed.depth ?? 0,
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
    lastFixAt = 0;
    lineBuffer = '';
    lastAzmRemPointByBeacon.clear();
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
      if (payload.status === 'error') {
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
        emitConnectionState('timeout');
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
        emitConnectionState('timeout');
      }
    },
    onFix: (listener) => {
      fixListeners.add(listener);
      return () => {
        fixListeners.delete(listener);
      };
    },
    onRawPacket: (listener) => {
      rawPacketListeners.add(listener);
      return () => {
        rawPacketListeners.delete(listener);
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
  let connectionState: TelemetryConnectionState = 'timeout';
  let lastFixAt = 0;
  let lineBuffer = '';
  let lastGroundPoint: GroundTrackPoint | null = null;
  let latestHeading: number | null = null;
  let latestHeadingAt = 0;

  let timeoutIntervalId: number | null = null;
  let unsubscribeData: (() => void) | null = null;
  let unsubscribeStatus: (() => void) | null = null;
  let unsubscribeError: (() => void) | null = null;

  const fixListeners = new Set<(fix: TelemetryFix) => void>();
  const connectionListeners = new Set<(nextState: TelemetryConnectionState) => void>();
  const rawPacketListeners = new Set<(packet: RawTelemetryPacket) => void>();

  const emitConnectionState = (nextState: TelemetryConnectionState) => {
    if (connectionState === nextState) return;
    connectionState = nextState;
    connectionListeners.forEach((listener) => listener(nextState));
  };

  const emitFix = (fix: TelemetryFix) => {
    fixListeners.forEach((listener) => listener(fix));
  };
  const emitRawPacket = (packet: RawTelemetryPacket) => {
    rawPacketListeners.forEach((listener) => listener(packet));
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
      const receivedAt = payload.receivedAt ?? Date.now();
      emitRawPacket({
        schema_id: 'gnss-udp',
        raw: line,
        received_at: receivedAt,
      });
      const parsed = parseNmeaLine(line);

      if (parsed.kind === 'HDT' && parsed.headingDeg !== null) {
        latestHeading = parsed.headingDeg;
        latestHeadingAt = receivedAt;
        continue;
      }

      if (parsed.kind !== 'RMC' && parsed.kind !== 'GGA' && parsed.kind !== 'GNS') {
        continue;
      }

      if (!parsed.hasFix || !isValidLatLon(parsed.lat, parsed.lon)) {
        continue;
      }

      const currentPoint: GroundTrackPoint = {
        lat: parsed.lat,
        lon: parsed.lon,
        receivedAt,
      };
      const previousPoint = lastGroundPoint;
      if (previousPoint && currentPoint.receivedAt <= previousPoint.receivedAt) {
        // Ignore duplicate or out-of-order timestamps to avoid overriding
        // valid over-ground motion with dt=0 samples from the same datagram.
        continue;
      }

      const groundMotion = computeGroundMotion(previousPoint, currentPoint);
      lastGroundPoint = currentPoint;
      const headingIsFresh = latestHeading !== null && isFreshHeading(latestHeadingAt, receivedAt);
      const course = headingIsFresh && latestHeading !== null ? latestHeading : groundMotion.course;
      const heading = headingIsFresh ? latestHeading : null;

      lastFixAt = receivedAt;
      emitConnectionState('ok');
      emitFix({
        lat: parsed.lat,
        lon: parsed.lon,
        speed: groundMotion.speed,
        course,
        heading,
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
    lastFixAt = 0;
    lineBuffer = '';
    lastGroundPoint = null;
    latestHeading = null;
    latestHeadingAt = 0;
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
      if (payload.status === 'error') {
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
        emitConnectionState('timeout');
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
        emitConnectionState('timeout');
      }
    },
    onFix: (listener) => {
      fixListeners.add(listener);
      return () => {
        fixListeners.delete(listener);
      };
    },
    onRawPacket: (listener) => {
      rawPacketListeners.add(listener);
      return () => {
        rawPacketListeners.delete(listener);
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

export const createElectronGnssComTelemetryProvider = (
  options: ElectronGnssComTelemetryOptions,
): TelemetryProvider => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let enabled = false;
  let simulateConnectionError = false;
  let started = false;
  let connected = false;
  let connectionState: TelemetryConnectionState = 'timeout';
  let lastFixAt = 0;
  let lineBuffer = '';
  let lastGroundPoint: GroundTrackPoint | null = null;
  let latestHeading: number | null = null;
  let latestHeadingAt = 0;
  let activeNavigationSourceId = 'gnss-com';

  let timeoutIntervalId: number | null = null;
  let unsubscribeData: (() => void) | null = null;
  let unsubscribeStatus: (() => void) | null = null;
  let unsubscribeError: (() => void) | null = null;

  const fixListeners = new Set<(fix: TelemetryFix) => void>();
  const connectionListeners = new Set<(nextState: TelemetryConnectionState) => void>();
  const rawPacketListeners = new Set<(packet: RawTelemetryPacket) => void>();

  const emitConnectionState = (nextState: TelemetryConnectionState) => {
    if (connectionState === nextState) return;
    connectionState = nextState;
    connectionListeners.forEach((listener) => listener(nextState));
  };

  const emitFix = (fix: TelemetryFix) => {
    fixListeners.forEach((listener) => listener(fix));
  };
  const emitRawPacket = (packet: RawTelemetryPacket) => {
    rawPacketListeners.forEach((listener) => listener(packet));
  };

  const clearIntervals = () => {
    if (timeoutIntervalId !== null) {
      window.clearInterval(timeoutIntervalId);
      timeoutIntervalId = null;
    }
  };

  const getApi = (): ElectronGnssComApi | null => {
    const api = (window as unknown as { electronAPI?: { gnssCom?: ElectronGnssComApi } }).electronAPI?.gnssCom;
    return api ?? null;
  };

  const handleData = (payload: { message?: string; receivedAt?: number }) => {
    if (!enabled || simulateConnectionError) return;
    const message = payload.message ?? '';
    if (!message) return;

    const { lines, rest } = splitBufferedLines(lineBuffer, message);
    lineBuffer = rest.slice(-MAX_BUFFERED_NMEA_BYTES);

    for (const line of lines) {
      const receivedAt = payload.receivedAt ?? Date.now();
      emitRawPacket({
        schema_id: 'gnss-com',
        raw: line,
        received_at: receivedAt,
      });
      const parsed = parseNmeaLine(line);

      if (parsed.kind === 'HDT' && parsed.headingDeg !== null) {
        latestHeading = parsed.headingDeg;
        latestHeadingAt = receivedAt;
        continue;
      }

      if (parsed.kind !== 'RMC' && parsed.kind !== 'GGA' && parsed.kind !== 'GNS') {
        continue;
      }

      if (!parsed.hasFix || !isValidLatLon(parsed.lat, parsed.lon)) {
        continue;
      }

      const currentPoint: GroundTrackPoint = {
        lat: parsed.lat,
        lon: parsed.lon,
        receivedAt,
      };
      const previousPoint = lastGroundPoint;
      if (previousPoint && currentPoint.receivedAt <= previousPoint.receivedAt) {
        // Ignore duplicate or out-of-order timestamps to avoid overriding
        // valid over-ground motion with dt=0 samples from the same datagram.
        continue;
      }

      const groundMotion = computeGroundMotion(previousPoint, currentPoint);
      lastGroundPoint = currentPoint;
      const headingIsFresh = latestHeading !== null && isFreshHeading(latestHeadingAt, receivedAt);
      const course = headingIsFresh && latestHeading !== null ? latestHeading : groundMotion.course;
      const heading = headingIsFresh ? latestHeading : null;

      lastFixAt = receivedAt;
      emitConnectionState('ok');
      emitFix({
        lat: parsed.lat,
        lon: parsed.lon,
        speed: groundMotion.speed,
        course,
        heading,
        depth: 0,
        received_at: receivedAt,
        source: 'GNSS',
        entity_type: 'base_station',
        entity_id: 'base-station',
        navigation_source_id: activeNavigationSourceId,
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
    lastFixAt = 0;
    lineBuffer = '';
    lastGroundPoint = null;
    latestHeading = null;
    latestHeadingAt = 0;
    activeNavigationSourceId = 'gnss-com';
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

      activeNavigationSourceId = config.navigationSourceId;
      await api.start({
        autoDetectPort: config.autoDetectPort,
        comPort: config.comPort,
        baudRate: config.baudRate,
      });
      connected = true;
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
      if (payload.status === 'error') {
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
        emitConnectionState('timeout');
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
        emitConnectionState('timeout');
      }
    },
    onFix: (listener) => {
      fixListeners.add(listener);
      return () => {
        fixListeners.delete(listener);
      };
    },
    onRawPacket: (listener) => {
      rawPacketListeners.add(listener);
      return () => {
        rawPacketListeners.delete(listener);
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

export const createElectronRwltComTelemetryProvider = (
  options: ElectronRwltComTelemetryOptions,
): TelemetryProvider => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let enabled = false;
  let simulateConnectionError = false;
  let started = false;
  let connected = false;
  let connectionState: TelemetryConnectionState = 'timeout';
  let lastFixAt = 0;
  let lineBuffer = '';
  let lastPingerDepth = 0;
  let lastPingerGroundPoint: GroundTrackPoint | null = null;
  const lastDiverGroundPointByTargetId = new Map<number, GroundTrackPoint>();
  let activeMode: 'pinger' | 'divers' = 'pinger';
  let activeNavigationSourceId = 'rwlt-com';

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

  const getApi = (): ElectronRwltComApi | null => {
    const api = (window as unknown as { electronAPI?: { rwltCom?: ElectronRwltComApi } }).electronAPI?.rwltCom;
    return api ?? null;
  };

  const emitPingerAgentFix = (
    lat: number,
    lon: number,
    receivedAt: number,
  ) => {
    const currentPoint: GroundTrackPoint = { lat, lon, receivedAt };
    const groundMotion = computeGroundMotion(lastPingerGroundPoint, currentPoint);
    lastPingerGroundPoint = currentPoint;

    lastFixAt = receivedAt;
    emitConnectionState('ok');
    emitFix({
      lat,
      lon,
      speed: groundMotion.speed,
      course: normalizeCourseDeg(groundMotion.course),
      heading: null,
      depth: lastPingerDepth,
      received_at: receivedAt,
      source: 'RWLT',
      entity_type: 'agent',
      entity_id: 'rwlt-pinger-agent',
      navigation_source_id: activeNavigationSourceId,
    });
  };

  const handleData = (payload: { message?: string; receivedAt?: number }) => {
    if (!enabled || simulateConnectionError) return;
    const message = payload.message ?? '';
    if (!message) return;

    const { lines, rest } = splitBufferedLines(lineBuffer, message);
    lineBuffer = rest.slice(-MAX_BUFFERED_NMEA_BYTES);

    for (const line of lines) {
      const parsed = parseRwltLine(line);
      const receivedAt = payload.receivedAt ?? Date.now();

      if (parsed.kind === 'PRWLA') {
        options.onBuoyUpdate(parsed);
        continue;
      }

      if (parsed.kind === 'PUWV5') {
        lastFixAt = receivedAt;
        emitConnectionState('ok');
        emitFix({
          lat: parsed.lat,
          lon: parsed.lon,
          speed: parsed.speedKmh !== null ? Math.max(0, parsed.speedKmh / 3.6) : 0,
          course: normalizeCourseDeg(parsed.courseDeg ?? 0),
          heading: null,
          depth: 0,
          received_at: receivedAt,
          source: 'RWLT',
          entity_type: 'base_station',
          entity_id: 'base-station',
          navigation_source_id: activeNavigationSourceId,
        });
        continue;
      }

      if (activeMode === 'pinger') {
        if (parsed.kind === 'GGA' && parsed.hasFix && isValidLatLon(parsed.lat, parsed.lon)) {
          lastPingerDepth = parsed.depthM;
          emitPingerAgentFix(parsed.lat, parsed.lon, receivedAt);
        } else if (parsed.kind === 'RMC' && parsed.hasFix && isValidLatLon(parsed.lat, parsed.lon)) {
          emitPingerAgentFix(parsed.lat, parsed.lon, receivedAt);
        }
        continue;
      }

      if (parsed.kind !== 'PUWV3') {
        continue;
      }
      if (!isValidLatLon(parsed.lat, parsed.lon)) {
        continue;
      }
      const diver = options.resolveDiver(parsed.targetId);
      if (!diver) {
        continue;
      }

      const currentPoint: GroundTrackPoint = { lat: parsed.lat, lon: parsed.lon, receivedAt };
      const groundMotion = computeGroundMotion(lastDiverGroundPointByTargetId.get(parsed.targetId) ?? null, currentPoint);
      lastDiverGroundPointByTargetId.set(parsed.targetId, currentPoint);

      lastFixAt = receivedAt;
      emitConnectionState('ok');
      emitFix({
        lat: parsed.lat,
        lon: parsed.lon,
        speed: groundMotion.speed,
        course: normalizeCourseDeg(parsed.courseDeg ?? groundMotion.course),
        heading: null,
        depth: parsed.depthM,
        received_at: receivedAt,
        source: 'RWLT',
        entity_type: 'diver',
        entity_id: diver.uid,
        navigation_source_id: activeNavigationSourceId,
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
    lastFixAt = 0;
    lineBuffer = '';
    lastPingerDepth = 0;
    lastPingerGroundPoint = null;
    lastDiverGroundPointByTargetId.clear();
    activeMode = 'pinger';
    activeNavigationSourceId = 'rwlt-com';
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

      activeMode = config.mode;
      activeNavigationSourceId = config.navigationSourceId;
      await api.start({
        autoDetectPort: config.autoDetectPort,
        comPort: config.comPort,
        baudRate: config.baudRate,
        mode: config.mode,
      });
      connected = true;
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
      if (payload.status === 'error') {
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
        emitConnectionState('timeout');
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
        emitConnectionState('timeout');
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
