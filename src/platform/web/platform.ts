import type { Platform } from "@/platform/contracts";
import { detectElectron } from "@/platform/runtime";

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

const DEFAULT_MISSIONS_DIR = "C:/Missions";
const DEFAULT_EXPORTS_DIR = "C:/Exports";
const FILE_STORE_PREFIX = "planner.fs:";

const normalizePath = (path: string): string => path.replace(/\\/g, "/").replace(/\/+/g, "/").trim();
const toStorageKey = (path: string): string => `${FILE_STORE_PREFIX}${normalizePath(path)}`;

const listStoredKeys = (): string[] => {
  try {
    return Object.keys(window.localStorage).filter((key) => key.startsWith(FILE_STORE_PREFIX));
  } catch {
    return [];
  }
};

export const webPlatform: Platform = {
  runtime: {
    isElectron: detectElectron(),
  },
  paths: {
    defaultMissionsDir: () => readRememberedPath("planner.missionsDir") ?? DEFAULT_MISSIONS_DIR,
    defaultExportsDir: () => readRememberedPath("planner.exportsDir") ?? DEFAULT_EXPORTS_DIR,
  },
  map: {
    tileLayerUrl: () => "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    tileLayerAttribution: () => '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  fs: {
    pickDirectory: async (options) => {
      // Web fallback: we can't open a real folder picker without Electron.
      const title = options?.title ?? "Folder path";
      const defaultPath = options?.defaultPath ?? "";

      const value = window.prompt(title, defaultPath);
      if (!value) return null;

      const normalized = value.trim();
      if (!normalized) return null;

      if (title.toLowerCase().includes("мисси")) {
        rememberPath("planner.missionsDir", normalized);
      }
      if (title.toLowerCase().includes("экспорт")) {
        rememberPath("planner.exportsDir", normalized);
      }

      return normalized;
    },
  },
  settings: {
    readJson: async <T,>(key: string): Promise<T | null> => {
      try {
        const raw = window.localStorage.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    },
    writeJson: async (key: string, value: unknown): Promise<void> => {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // ignore
      }
    },
    remove: async (key: string): Promise<void> => {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // ignore
      }
    },
  },
  fileStore: {
    exists: async (path) => {
      try {
        return window.localStorage.getItem(toStorageKey(path)) !== null;
      } catch {
        return false;
      }
    },
    readText: async (path) => {
      try {
        return window.localStorage.getItem(toStorageKey(path));
      } catch {
        return null;
      }
    },
    writeText: async (path, content) => {
      window.localStorage.setItem(toStorageKey(path), content);
    },
    remove: async (path) => {
      try {
        window.localStorage.removeItem(toStorageKey(path));
      } catch {
        // ignore
      }
    },
    list: async (prefix) => {
      const normalizedPrefix = normalizePath(prefix);
      return listStoredKeys()
        .map((key) => key.slice(FILE_STORE_PREFIX.length))
        .filter((path) => path.startsWith(normalizedPrefix));
    },
  },
};
