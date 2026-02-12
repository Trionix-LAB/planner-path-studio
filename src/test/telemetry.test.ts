import {
  createElectronGnssTelemetryProvider,
  createElectronZimaTelemetryProvider,
  createNoopTelemetryProvider,
} from '@/features/mission';

type ZimaDataPayload = { message?: string; receivedAt?: number };
type ZimaStatusPayload = { status?: string };
type ZimaErrorPayload = { message?: string };
type ZimaDataListener = (payload: ZimaDataPayload) => void;
type ZimaStatusListener = (payload: ZimaStatusPayload) => void;
type ZimaErrorListener = (payload: ZimaErrorPayload) => void;
type GnssDataPayload = { message?: string; receivedAt?: number };
type GnssStatusPayload = { status?: string };
type GnssErrorPayload = { message?: string };
type GnssDataListener = (payload: GnssDataPayload) => void;
type GnssStatusListener = (payload: GnssStatusPayload) => void;
type GnssErrorListener = (payload: GnssErrorPayload) => void;

type MockZimaApi = {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  sendCommand: ReturnType<typeof vi.fn>;
  onData: (listener: ZimaDataListener) => () => void;
  onStatus: (listener: ZimaStatusListener) => () => void;
  onError: (listener: ZimaErrorListener) => () => void;
  emitData: (payload: ZimaDataPayload) => void;
};

type MockGnssApi = {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  onData: (listener: GnssDataListener) => () => void;
  onStatus: (listener: GnssStatusListener) => () => void;
  onError: (listener: GnssErrorListener) => () => void;
  emitData: (payload: GnssDataPayload) => void;
};

const createMockZimaApi = (): MockZimaApi => {
  const dataListeners = new Set<ZimaDataListener>();
  const statusListeners = new Set<ZimaStatusListener>();
  const errorListeners = new Set<ZimaErrorListener>();

  return {
    start: vi.fn(async () => ({ ok: true })),
    stop: vi.fn(async () => ({ ok: true })),
    sendCommand: vi.fn(async () => ({ ok: true })),
    onData: (listener) => {
      dataListeners.add(listener);
      return () => {
        dataListeners.delete(listener);
      };
    },
    onStatus: (listener) => {
      statusListeners.add(listener);
      return () => {
        statusListeners.delete(listener);
      };
    },
    onError: (listener) => {
      errorListeners.add(listener);
      return () => {
        errorListeners.delete(listener);
      };
    },
    emitData: (payload) => {
      dataListeners.forEach((listener) => listener(payload));
    },
  };
};

const createMockGnssApi = (): MockGnssApi => {
  const dataListeners = new Set<GnssDataListener>();
  const statusListeners = new Set<GnssStatusListener>();
  const errorListeners = new Set<GnssErrorListener>();

  return {
    start: vi.fn(async () => ({ ok: true })),
    stop: vi.fn(async () => ({ ok: true })),
    onData: (listener) => {
      dataListeners.add(listener);
      return () => {
        dataListeners.delete(listener);
      };
    },
    onStatus: (listener) => {
      statusListeners.add(listener);
      return () => {
        statusListeners.delete(listener);
      };
    },
    onError: (listener) => {
      errorListeners.add(listener);
      return () => {
        errorListeners.delete(listener);
      };
    },
    emitData: (payload) => {
      dataListeners.forEach((listener) => listener(payload));
    },
  };
};

const flushMicrotasks = async (turns = 8) => {
  for (let i = 0; i < turns; i += 1) {
    await Promise.resolve();
  }
};

const setElectronApi = (api: { zima?: MockZimaApi; gnss?: MockGnssApi } | undefined) => {
  const target = window as unknown as { electronAPI?: { zima?: MockZimaApi; gnss?: MockGnssApi } };
  if (!api || (!api.zima && !api.gnss)) {
    delete target.electronAPI;
    return;
  }
  target.electronAPI = { ...api };
};

describe('noop telemetry provider', () => {
  it('does not emit fixes and keeps connection state stable', () => {
    vi.useFakeTimers();
    const provider = createNoopTelemetryProvider();
    const onFix = vi.fn();
    const onConnectionState = vi.fn();

    const unsubscribeFix = provider.onFix(onFix);
    const unsubscribeConnection = provider.onConnectionState(onConnectionState);

    provider.start();
    provider.setEnabled(false);
    provider.setSimulateConnectionError(true);
    vi.advanceTimersByTime(30_000);
    provider.stop();

    expect(onFix).not.toHaveBeenCalled();
    expect(onConnectionState).toHaveBeenCalledTimes(1);
    expect(onConnectionState).toHaveBeenLastCalledWith('ok');

    unsubscribeFix();
    unsubscribeConnection();
    vi.useRealTimers();
  });
});

describe('electron zima telemetry provider', () => {
  it('starts bridge and processes AZMLOC fixes with command channel', async () => {
    const api = createMockZimaApi();
    setElectronApi({ zima: api });

    const provider = createElectronZimaTelemetryProvider({
      readConfig: async () => ({
        ipAddress: '127.0.0.1',
        dataPort: 28127,
        commandPort: 28128,
        useCommandPort: true,
        useExternalGnss: false,
        latitude: 59.9375,
        longitude: 30.3086,
        azimuth: 120,
      }),
    });

    const onFix = vi.fn();
    provider.onFix(onFix);

    provider.start();
    provider.setEnabled(true);
    await flushMicrotasks();

    expect(api.start).toHaveBeenCalledTimes(1);
    expect(api.sendCommand).toHaveBeenCalledWith('OCON');
    expect(api.sendCommand).toHaveBeenCalledWith('LHOV,59.9375,30.3086,120');

    api.emitData({
      message:
        '@AZMLOC,1013.2,10.5,12.3,0.1,-0.2,0,59.937500,30.308600,120.0,0.8,0,130.0,0,0,0,10.5,1.2,0,\r\n',
      receivedAt: 1739318400000,
    });

    expect(onFix).toHaveBeenCalledTimes(1);
    expect(onFix).toHaveBeenCalledWith({
      lat: 59.9375,
      lon: 30.3086,
      speed: 0.8,
      course: 120,
      heading: 130,
      depth: 10.5,
      received_at: 1739318400000,
      source: 'AZMLOC',
      entity_type: 'base_station',
      entity_id: 'base-station',
      navigation_source_id: 'zima2r',
    });

    provider.stop();
    await flushMicrotasks();

    expect(api.sendCommand).toHaveBeenCalledWith('CCON');
    expect(api.stop).toHaveBeenCalledTimes(1);
    setElectronApi(undefined);
  });

  it('buffers split datagrams and emits fix from AZMREM', async () => {
    const api = createMockZimaApi();
    setElectronApi({ zima: api });

    const provider = createElectronZimaTelemetryProvider({
      readConfig: async () => ({
        ipAddress: '127.0.0.1',
        dataPort: 28127,
        commandPort: 28128,
        useCommandPort: false,
        useExternalGnss: true,
        latitude: null,
        longitude: null,
        azimuth: null,
      }),
    });

    const onFix = vi.fn();
    provider.onFix(onFix);

    provider.start();
    provider.setEnabled(true);
    await flushMicrotasks();

    api.emitData({
      message:
        '@AZMREM,1,120.3,45.2,0.7,24.5,0,5.2,0,120.3,0,30.1,0,80.4,0,20.0,0,9.9,0,14.3,0,59.9301,30.3002,0,100.5,0,msg,0,1,2',
      receivedAt: 1739318401000,
    });
    expect(onFix).not.toHaveBeenCalled();

    api.emitData({
      message: ',false\r\n',
      receivedAt: 1739318402000,
    });

    expect(onFix).toHaveBeenCalledTimes(1);
    expect(onFix).toHaveBeenCalledWith({
      lat: 59.9301,
      lon: 30.3002,
      speed: 0,
      course: 0,
      heading: 0,
      depth: 5.2,
      received_at: 1739318402000,
      remoteAddress: 1,
      beaconId: '1',
      source: 'AZMREM',
      entity_type: 'agent',
      entity_id: 'beacon-1',
      navigation_source_id: 'zima2r',
    });

    provider.stop();
    setElectronApi(undefined);
  });

  it('emits fixes for compact real-world AZMLOC/AZMREM messages', async () => {
    const api = createMockZimaApi();
    setElectronApi({ zima: api });

    const provider = createElectronZimaTelemetryProvider({
      readConfig: async () => ({
        ipAddress: '127.0.0.1',
        dataPort: 28127,
        commandPort: 28128,
        useCommandPort: false,
        useExternalGnss: true,
        latitude: null,
        longitude: null,
        azimuth: null,
      }),
    });

    const onFix = vi.fn();
    provider.onFix(onFix);

    provider.start();
    provider.setEnabled(true);
    await flushMicrotasks();

    api.emitData({
      message: '@AZMLOC,981.5,-0.3,20.2,-60.8,-42.7,0.0,48.123456,44.123456,,,,0.0,0.9,',
      receivedAt: 1739318403000,
    });
    api.emitData({
      message:
        '@AZMREM,0,0.5,3.0,0.0004,21.5,0.0,0.0,0.0,0.5,0.0,0.5,0.0,3.0,0.0,-3.0,0.0,,,,,48.123460,44.123456,0.0,183.0,0.0,,,False,',
      receivedAt: 1739318404000,
    });

    expect(onFix).toHaveBeenCalledTimes(2);
    expect(onFix.mock.calls[0]?.[0]).toMatchObject({
      source: 'AZMLOC',
      lat: 48.123456,
      lon: 44.123456,
      depth: -0.3,
    });
    expect(onFix.mock.calls[1]?.[0]).toMatchObject({
      source: 'AZMREM',
      lat: 48.12346,
      lon: 44.123456,
      remoteAddress: 0,
      beaconId: '0',
      depth: 0,
    });

    provider.stop();
    setElectronApi(undefined);
  });

  it('switches connection to ok only after valid telemetry message', async () => {
    const api = createMockZimaApi();
    setElectronApi({ zima: api });

    const provider = createElectronZimaTelemetryProvider({
      readConfig: async () => ({
        ipAddress: '127.0.0.1',
        dataPort: 28127,
        commandPort: 28128,
        useCommandPort: false,
        useExternalGnss: true,
        latitude: null,
        longitude: null,
        azimuth: null,
      }),
    });

    const onConnectionState = vi.fn();
    provider.onConnectionState(onConnectionState);

    provider.start();
    provider.setEnabled(true);
    await flushMicrotasks();

    expect(onConnectionState).not.toHaveBeenCalledWith('ok');

    api.emitData({
      message: '@AZMLOC,981.5,-0.3,20.2,-60.8,-42.7,0.0,48.123456,44.123456,,,,0.0,0.9,',
      receivedAt: 1739318403000,
    });

    expect(onConnectionState).toHaveBeenCalledWith('ok');

    provider.stop();
    setElectronApi(undefined);
  });

  it('accepts compact packets with service prefix and NUL terminator', async () => {
    const api = createMockZimaApi();
    setElectronApi({ zima: api });

    const provider = createElectronZimaTelemetryProvider({
      readConfig: async () => ({
        ipAddress: '127.0.0.1',
        dataPort: 28127,
        commandPort: 28128,
        useCommandPort: false,
        useExternalGnss: true,
        latitude: null,
        longitude: null,
        azimuth: null,
      }),
    });

    const onFix = vi.fn();
    provider.onFix(onFix);

    provider.start();
    provider.setEnabled(true);
    await flushMicrotasks();

    api.emitData({
      message:
        '[1] [zima2r][rx] 127.0.0.1:42672 -> @AZMLOC,981.5,-0.3,20.2,-60.8,-42.7,0.0,48.123456,44.123456,,,,0.0,0.9,',
      receivedAt: 1739318405000,
    });
    api.emitData({
      message:
        '@AZMREM,0,0.5,3.0,0.0004,21.5,0.0,0.0,0.0,0.5,0.0,0.5,0.0,3.0,0.0,-3.0,0.0,,,,,48.123460,44.123456,0.0,183.0,0.0,,,False,\u0000',
      receivedAt: 1739318406000,
    });

    expect(onFix).toHaveBeenCalledTimes(2);
    expect(onFix.mock.calls[0]?.[0]).toMatchObject({
      source: 'AZMLOC',
      lat: 48.123456,
      lon: 44.123456,
    });
    expect(onFix.mock.calls[1]?.[0]).toMatchObject({
      source: 'AZMREM',
      lat: 48.12346,
      lon: 44.123456,
      remoteAddress: 0,
      beaconId: '0',
    });

    provider.stop();
    setElectronApi(undefined);
  });
});

describe('electron gnss telemetry provider', () => {
  it('starts bridge and emits fix from RMC line', async () => {
    const api = createMockGnssApi();
    setElectronApi({ gnss: api });

    const provider = createElectronGnssTelemetryProvider({
      readConfig: async () => ({
        ipAddress: '127.0.0.1',
        dataPort: 28128,
      }),
    });

    const onFix = vi.fn();
    provider.onFix(onFix);

    provider.start();
    provider.setEnabled(true);
    await flushMicrotasks();

    expect(api.start).toHaveBeenCalledTimes(1);

    api.emitData({
      message: '$GPRMC,123519,A,5956.2500,N,03018.5160,E,1.94,84.4,230394,,*1B\r\n',
      receivedAt: 1739318403000,
    });

    expect(onFix).toHaveBeenCalledTimes(1);
    const payload = onFix.mock.calls[0]?.[0];
    expect(payload.source).toBe('GNSS');
    expect(payload.received_at).toBe(1739318403000);
    expect(payload.lat).toBeCloseTo(59.9375, 5);
    expect(payload.lon).toBeCloseTo(30.3086, 5);
    expect(payload.speed).toBeCloseTo(0.998, 3);
    expect(payload.course).toBeCloseTo(84.4, 3);
    expect(payload.heading).toBeNull();
    expect(payload.depth).toBe(0);
    expect(payload.entity_type).toBe('base_station');
    expect(payload.entity_id).toBe('base-station');
    expect(payload.navigation_source_id).toBe('gnss-udp');

    provider.stop();
    await flushMicrotasks();
    expect(api.stop).toHaveBeenCalledTimes(1);
    setElectronApi(undefined);
  });
});
