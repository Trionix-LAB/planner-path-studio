import type { Platform } from '@/platform/contracts';
import { resolveMapConfig } from '@/platform/mapConfig';

const readRememberedPath = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const rememberPath = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore
  }
};

const DEFAULT_MISSIONS_DIR = 'C:/Missions';
const DEFAULT_EXPORTS_DIR = 'C:/Exports';

type ElectronApi = {
  pickDirectory: (options?: { title?: string; defaultPath?: string }) => Promise<string | null>;
  fileStore: {
    exists: (path: string) => Promise<boolean>;
    readText: (path: string) => Promise<string | null>;
    writeText: (path: string, content: string) => Promise<void>;
    remove: (path: string) => Promise<void>;
    list: (prefix: string) => Promise<string[]>;
    stat: (path: string) => Promise<{ mtimeMs: number } | null>;
  };
  settings: {
    readJson: <T>(key: string) => Promise<T | null>;
    writeJson: (key: string, value: unknown) => Promise<void>;
    remove: (key: string) => Promise<void>;
  };
  zima?: {
    start: (config: {
      ipAddress: string;
      dataPort: number;
      commandPort: number;
      useCommandPort: boolean;
      useExternalGnss: boolean;
      latitude: number | null;
      longitude: number | null;
      azimuth: number | null;
    }) => Promise<unknown>;
    stop: () => Promise<unknown>;
    sendCommand: (command: string) => Promise<unknown>;
    status: () => Promise<unknown>;
    onData: (listener: (payload: { message?: string; receivedAt?: number }) => void) => () => void;
    onStatus: (listener: (payload: { status?: string }) => void) => () => void;
    onError: (listener: (payload: { message?: string }) => void) => () => void;
  };
  gnss?: {
    start: (config: {
      ipAddress: string;
      dataPort: number;
    }) => Promise<unknown>;
    stop: () => Promise<unknown>;
    status: () => Promise<unknown>;
    onData: (listener: (payload: { message?: string; receivedAt?: number }) => void) => () => void;
    onStatus: (listener: (payload: { status?: string }) => void) => () => void;
    onError: (listener: (payload: { message?: string }) => void) => () => void;
  };
  gnssCom?: {
    start: (config: {
      autoDetectPort: boolean;
      comPort: string;
      baudRate: number;
    }) => Promise<unknown>;
    stop: () => Promise<unknown>;
    status: () => Promise<unknown>;
    listPorts: () => Promise<Array<{ path?: string } | string>>;
    onData: (listener: (payload: { message?: string; receivedAt?: number; portPath?: string }) => void) => () => void;
    onStatus: (listener: (payload: { status?: string }) => void) => () => void;
    onError: (listener: (payload: { message?: string }) => void) => () => void;
  };
};

const getApi = (): ElectronApi | null => {
  const w = window as unknown as { electronAPI?: ElectronApi };
  return w.electronAPI ?? null;
};

const normalizeStorePath = (value: string): string => value.replace(/\\/g, '/').trim();
const mapConfig = resolveMapConfig(import.meta.env as Record<string, string | undefined>);

export const electronPlatform: Platform = {
  runtime: {
    isElectron: true,
  },
  paths: {
    defaultMissionsDir: () => readRememberedPath('planner.missionsDir') ?? DEFAULT_MISSIONS_DIR,
    defaultExportsDir: () => readRememberedPath('planner.exportsDir') ?? DEFAULT_EXPORTS_DIR,
  },
  map: {
    tileLayerUrl: () => mapConfig.tileLayerUrl,
    tileLayerAttribution: () => mapConfig.tileLayerAttribution,
    maxNativeZoom: () => mapConfig.maxNativeZoom,
    maxZoom: () => mapConfig.maxZoom,
    tileSubdomains: () => mapConfig.tileSubdomains,
    tileSize: () => mapConfig.tileSize,
    detectRetina: () => mapConfig.detectRetina,
    overlayTileLayerUrl: () => mapConfig.overlayTileLayerUrl,
    overlayTileLayerAttribution: () => mapConfig.overlayTileLayerAttribution,
    overlayMaxNativeZoom: () => mapConfig.overlayMaxNativeZoom,
    overlayMaxZoom: () => mapConfig.overlayMaxZoom,
    overlayTileSubdomains: () => mapConfig.overlayTileSubdomains,
    overlayTileSize: () => mapConfig.overlayTileSize,
    overlayDetectRetina: () => mapConfig.overlayDetectRetina,
    zoomSnap: () => mapConfig.zoomSnap,
    zoomDelta: () => mapConfig.zoomDelta,
    wheelPxPerZoomLevel: () => mapConfig.wheelPxPerZoomLevel,
  },
  fs: {
    pickDirectory: async (options) => {
      const api = getApi();
      if (!api) return null;

      const picked = await api.pickDirectory(options);
      if (!picked) return null;

      const title = (options?.title ?? '').toLowerCase();
      if (title.includes('мисси')) {
        rememberPath('planner.missionsDir', picked);
      }
      if (title.includes('экспорт')) {
        rememberPath('planner.exportsDir', picked);
      }

      return picked;
    },
  },
  settings: {
    readJson: async <T,>(key: string): Promise<T | null> => {
      const api = getApi();
      if (!api) return null;
      return api.settings.readJson<T>(key);
    },
    writeJson: async (key: string, value: unknown): Promise<void> => {
      const api = getApi();
      if (!api) return;
      await api.settings.writeJson(key, value);
    },
    remove: async (key: string): Promise<void> => {
      const api = getApi();
      if (!api) return;
      await api.settings.remove(key);
    },
  },
  fileStore: {
    exists: async (path) => {
      const api = getApi();
      if (!api) return false;
      return api.fileStore.exists(normalizeStorePath(path));
    },
    readText: async (path) => {
      const api = getApi();
      if (!api) return null;
      return api.fileStore.readText(normalizeStorePath(path));
    },
    writeText: async (path, content) => {
      const api = getApi();
      if (!api) return;
      await api.fileStore.writeText(normalizeStorePath(path), content);
    },
    remove: async (path) => {
      const api = getApi();
      if (!api) return;
      await api.fileStore.remove(normalizeStorePath(path));
    },
    list: async (prefix) => {
      const api = getApi();
      if (!api) return [];
      return api.fileStore.list(normalizeStorePath(prefix));
    },
    stat: async (path) => {
      const api = getApi();
      if (!api) return null;
      return api.fileStore.stat(normalizeStorePath(path));
    },
  },
};
