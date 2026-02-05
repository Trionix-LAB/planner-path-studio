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
};
