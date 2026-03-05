import {
  createElectronGnssComTelemetryProvider,
  createElectronGnssTelemetryProvider,
  createElectronRwltComTelemetryProvider,
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

const withChecksum = (payload: string): string => {
  let checksum = 0;
  for (let i = 0; i < payload.length; i += 1) {
    checksum ^= payload.charCodeAt(i);
  }
  return `$${payload}*${checksum.toString(16).toUpperCase().padStart(2, '0')}`;
};

const setElectronApi = (
  api: { zima?: MockZimaApi; gnss?: MockGnssApi; gnssCom?: MockGnssApi; rwltCom?: MockGnssApi } | undefined,
) => {
  const target = window as unknown as {
    electronAPI?: { zima?: MockZimaApi; gnss?: MockGnssApi; gnssCom?: MockGnssApi; rwltCom?: MockGnssApi };
  };
  if (!api || (!api.zima && !api.gnss && !api.gnssCom && !api.rwltCom)) {
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

  it('computes AZMREM course/speed over-ground per beacon and does not inherit AZMLOC motion', async () => {
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
      message: '@AZMLOC,1013.2,10.5,12.3,0.1,-0.2,0,59.937500,30.308600,270.0,2.5,0,130.0,0,\r\n',
      receivedAt: 1739318400000,
    });
    api.emitData({
      message:
        '@AZMREM,1,120.3,45.2,0.7,24.5,0,5.2,0,120.3,0,30.1,0,80.4,0,20.0,0,9.9,0,14.3,0,59.9301,30.3002,0,100.5,0,msg,0,1,2,false\r\n',
      receivedAt: 1739318401000,
    });
    api.emitData({
      message:
        '@AZMREM,1,120.3,45.2,0.7,24.5,0,5.2,0,120.3,0,30.1,0,80.4,0,20.0,0,9.9,0,14.3,0,59.9302,30.3002,0,100.5,0,msg,0,1,2,false\r\n',
      receivedAt: 1739318402000,
    });

    expect(onFix).toHaveBeenCalledTimes(3);
    const secondAzmRemFix = onFix.mock.calls[2]?.[0];
    expect(secondAzmRemFix.source).toBe('AZMREM');
    expect(secondAzmRemFix.speed).toBeGreaterThan(11);
    expect(secondAzmRemFix.speed).toBeLessThan(11.3);
    expect(secondAzmRemFix.course).toBeCloseTo(0, 0);
    expect(secondAzmRemFix.heading).toBeCloseTo(0, 0);
    expect(secondAzmRemFix.course).not.toBe(270);

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
  it('starts bridge and emits over-ground motion from sequential RMC lines', async () => {
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
      message: '$GPRMC,123519,A,5956.2500,N,03018.5160,E,1.94,84.4,230394,,\r\n',
      receivedAt: 1739318403000,
    });
    api.emitData({
      message: '$GPRMC,123520,A,5956.2560,N,03018.5160,E,1.94,84.4,230394,,\r\n',
      receivedAt: 1739318404000,
    });

    expect(onFix).toHaveBeenCalledTimes(2);
    const payload = onFix.mock.calls[1]?.[0];
    expect(payload.source).toBe('GNSS');
    expect(payload.received_at).toBe(1739318404000);
    expect(payload.lat).toBeCloseTo(59.9376, 5);
    expect(payload.lon).toBeCloseTo(30.3086, 5);
    expect(payload.speed).toBeGreaterThan(11);
    expect(payload.speed).toBeLessThan(11.3);
    expect(payload.course).toBeCloseTo(0, 0);
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

  it('prioritizes fresh HDT heading for course and falls back to COG after 5 seconds', async () => {
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

    api.emitData({
      message: '$HEHDT,120.0,T*2C\r\n',
      receivedAt: 1739318400000,
    });

    api.emitData({
      message: '$GPRMC,123519,A,5956.2500,N,03018.5160,E,0.00,0.0,230394,,\r\n',
      receivedAt: 1739318401000,
    });
    api.emitData({
      message: '$GPRMC,123520,A,5956.2560,N,03018.5160,E,0.00,0.0,230394,,\r\n',
      receivedAt: 1739318402000,
    });

    expect(onFix).toHaveBeenCalledTimes(2);
    const freshHeadingFix = onFix.mock.calls[1]?.[0];
    expect(freshHeadingFix.course).toBe(120);
    expect(freshHeadingFix.heading).toBe(120);
    expect(freshHeadingFix.speed).toBeGreaterThan(11);

    api.emitData({
      message: '$GPRMC,123526,A,5956.2620,N,03018.5160,E,0.00,0.0,230394,,\r\n',
      receivedAt: 1739318407000,
    });

    expect(onFix).toHaveBeenCalledTimes(3);
    const staleHeadingFix = onFix.mock.calls[2]?.[0];
    expect(staleHeadingFix.heading).toBeNull();
    expect(staleHeadingFix.course).toBeCloseTo(0, 0);
    expect(staleHeadingFix.speed).toBeGreaterThan(2);
    expect(staleHeadingFix.speed).toBeLessThan(2.4);

    provider.stop();
    await flushMicrotasks();
    setElectronApi(undefined);
  });
});

describe('electron gnss-com telemetry provider', () => {
  it('starts bridge and emits fix from RMC line with selected source id', async () => {
    const api = createMockGnssApi();
    setElectronApi({ gnssCom: api });

    const provider = createElectronGnssComTelemetryProvider({
      readConfig: async () => ({
        autoDetectPort: true,
        comPort: '',
        baudRate: 115200,
        navigationSourceId: 'device-gnss-com-1',
      }),
    });

    const onFix = vi.fn();
    provider.onFix(onFix);

    provider.start();
    provider.setEnabled(true);
    await flushMicrotasks();

    expect(api.start).toHaveBeenCalledTimes(1);
    expect(api.start).toHaveBeenCalledWith({
      autoDetectPort: true,
      comPort: '',
      baudRate: 115200,
    });

    api.emitData({
      message: '$GPRMC,123519,A,5956.2500,N,03018.5160,E,1.94,84.4,230394,,*1B\r\n',
      receivedAt: 1739318403000,
    });

    expect(onFix).toHaveBeenCalledTimes(1);
    const payload = onFix.mock.calls[0]?.[0];
    expect(payload.source).toBe('GNSS');
    expect(payload.navigation_source_id).toBe('device-gnss-com-1');
    expect(payload.received_at).toBe(1739318403000);
    expect(payload.lat).toBeCloseTo(59.9375, 5);
    expect(payload.lon).toBeCloseTo(30.3086, 5);

    provider.stop();
    await flushMicrotasks();
    expect(api.stop).toHaveBeenCalledTimes(1);
    setElectronApi(undefined);
  });
});

describe('electron rwlt-com telemetry provider', () => {
  it('emits base-station from PUWV5 and pinger agent COG/SOG from sequential points in pinger mode', async () => {
    const api = createMockGnssApi();
    setElectronApi({ rwltCom: api });

    const onBuoyUpdate = vi.fn();
    const provider = createElectronRwltComTelemetryProvider({
      readConfig: async () => ({
        autoDetectPort: true,
        comPort: '',
        baudRate: 38400,
        mode: 'pinger',
        navigationSourceId: 'rwlt-instance-1',
      }),
      resolveDiver: () => null,
      onBuoyUpdate,
    });

    const onFix = vi.fn();
    provider.onFix(onFix);
    provider.start();
    provider.setEnabled(true);
    await flushMicrotasks();

    expect(api.start).toHaveBeenCalledWith({
      autoDetectPort: true,
      comPort: '',
      baudRate: 38400,
      mode: 'pinger',
    });

    api.emitData({
      message: `${withChecksum('PUWV5,59.9000,30.3000,270.0,7.2')}\r\n`,
      receivedAt: 1739318403000,
    });
    api.emitData({
      message: `${withChecksum('GNGGA,120000.000,5954.0000,N,03020.0000,E,1,04,1.5,-12.3,M,,,,')}\r\n`,
      receivedAt: 1739318403050,
    });
    api.emitData({
      message: `${withChecksum('GNRMC,120001.000,A,5954.0000,N,03020.0060,E,3.50,123.4,010101,,,A')}\r\n`,
      receivedAt: 1739318404050,
    });
    api.emitData({
      message: `${withChecksum('PRWLA,1,59.9000,30.3000,1.5,12.4,0,3.1,25.0')}\r\n`,
      receivedAt: 1739318403100,
    });

    expect(onFix).toHaveBeenCalledTimes(3);
    expect(onFix.mock.calls[0]?.[0]).toMatchObject({
      source: 'RWLT',
      entity_type: 'base_station',
      navigation_source_id: 'rwlt-instance-1',
      lat: 59.9,
      lon: 30.3,
      course: 270,
      speed: 2,
      depth: 0,
    });
    expect(onFix.mock.calls[1]?.[0]).toMatchObject({
      source: 'RWLT',
      entity_type: 'agent',
      entity_id: 'rwlt-pinger-agent',
      navigation_source_id: 'rwlt-instance-1',
      depth: 12.3,
    });
    const pingerRmcFix = onFix.mock.calls[2]?.[0];
    expect(pingerRmcFix.source).toBe('RWLT');
    expect(pingerRmcFix.entity_type).toBe('agent');
    expect(pingerRmcFix.entity_id).toBe('rwlt-pinger-agent');
    expect(pingerRmcFix.navigation_source_id).toBe('rwlt-instance-1');
    expect(pingerRmcFix.course).toBeCloseTo(90, 0);
    expect(pingerRmcFix.speed).toBeGreaterThan(5);
    expect(pingerRmcFix.speed).toBeLessThan(6);
    expect(pingerRmcFix.depth).toBe(12.3);
    expect(onBuoyUpdate).toHaveBeenCalledTimes(1);

    provider.stop();
    await flushMicrotasks();
    setElectronApi(undefined);
  });

  it('emits diver fixes in divers mode with resolver mapping and per-diver SOG', async () => {
    const api = createMockGnssApi();
    setElectronApi({ rwltCom: api });

    const provider = createElectronRwltComTelemetryProvider({
      readConfig: async () => ({
        autoDetectPort: false,
        comPort: 'COM7',
        baudRate: 38400,
        mode: 'divers',
        navigationSourceId: 'rwlt-instance-2',
      }),
      resolveDiver: (tId) => (tId === 5 ? { uid: 'diver-uid-5', id: '5' } : null),
      onBuoyUpdate: () => {
        // noop
      },
    });

    const onFix = vi.fn();
    provider.onFix(onFix);
    provider.start();
    provider.setEnabled(true);
    await flushMicrotasks();

    api.emitData({
      message: `${withChecksum('PUWV3,5,59.9000,30.3000,12.5,270.0,2.3,5')}\r\n`,
      receivedAt: 1739318403200,
    });
    api.emitData({
      message: `${withChecksum('PUWV3,5,59.9001,30.3000,12.0,275.0,2.3,5')}\r\n`,
      receivedAt: 1739318404200,
    });

    expect(onFix).toHaveBeenCalledTimes(2);
    expect(onFix.mock.calls[0]?.[0]).toMatchObject({
      source: 'RWLT',
      entity_type: 'diver',
      entity_id: 'diver-uid-5',
      navigation_source_id: 'rwlt-instance-2',
      depth: 12.5,
      course: 270,
      speed: 0,
    });
    const secondFix = onFix.mock.calls[1]?.[0];
    expect(secondFix.source).toBe('RWLT');
    expect(secondFix.entity_type).toBe('diver');
    expect(secondFix.entity_id).toBe('diver-uid-5');
    expect(secondFix.navigation_source_id).toBe('rwlt-instance-2');
    expect(secondFix.depth).toBe(12);
    expect(secondFix.course).toBe(275);
    expect(secondFix.speed).toBeGreaterThan(10.5);
    expect(secondFix.speed).toBeLessThan(11.5);

    provider.stop();
    await flushMicrotasks();
    setElectronApi(undefined);
  });
});
