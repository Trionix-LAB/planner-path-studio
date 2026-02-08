export type TelemetryConnectionState = 'ok' | 'timeout' | 'error';

export type TelemetryFix = {
  lat: number;
  lon: number;
  speed: number;
  course: number;
  depth: number;
  received_at: number;
};

export type TelemetryProvider = {
  start: () => void;
  stop: () => void;
  setEnabled: (enabled: boolean) => void;
  setSimulateConnectionError: (enabled: boolean) => void;
  onFix: (listener: (fix: TelemetryFix) => void) => () => void;
  onConnectionState: (listener: (state: TelemetryConnectionState) => void) => () => void;
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
    emitFix({ ...state, received_at: lastFixAt });
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

