import type { Platform } from '@/platform/contracts';

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
  };
  settings: {
    readJson: <T>(key: string) => Promise<T | null>;
    writeJson: (key: string, value: unknown) => Promise<void>;
    remove: (key: string) => Promise<void>;
  };
};

const getApi = (): ElectronApi | null => {
  const w = window as unknown as { electronAPI?: ElectronApi };
  return w.electronAPI ?? null;
};

const normalizeStorePath = (value: string): string => value.replace(/\\/g, '/').trim();

export const electronPlatform: Platform = {
  runtime: {
    isElectron: true,
  },
  paths: {
    defaultMissionsDir: () => readRememberedPath('planner.missionsDir') ?? DEFAULT_MISSIONS_DIR,
    defaultExportsDir: () => readRememberedPath('planner.exportsDir') ?? DEFAULT_EXPORTS_DIR,
  },
  map: {
    tileLayerUrl: () => 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    tileLayerAttribution: () => '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
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
  },
};
