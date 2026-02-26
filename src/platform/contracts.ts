export type PickDirectoryOptions = {
  title?: string;
  defaultPath?: string;
};

export type FileStoreBridge = {
  exists: (path: string) => Promise<boolean>;
  readText: (path: string) => Promise<string | null>;
  writeText: (path: string, content: string) => Promise<void>;
  remove: (path: string) => Promise<void>;
  list: (prefix: string) => Promise<string[]>;
  stat: (path: string) => Promise<{ mtimeMs: number } | null>;
};

export type FileSystemBridge = {
  pickDirectory: (options?: PickDirectoryOptions) => Promise<string | null>;
};

export type SettingsBridge = {
  readJson: <T>(key: string) => Promise<T | null>;
  writeJson: (key: string, value: unknown) => Promise<void>;
  remove: (key: string) => Promise<void>;
};

export type PlatformRuntime = {
  isElectron: boolean;
};

export type PlatformPaths = {
  defaultMissionsDir: () => string;
  defaultExportsDir: () => string;
};

export type Platform = {
  runtime: PlatformRuntime;
  paths: PlatformPaths;
  map: {
    tileLayerUrl: () => string;
    tileLayerAttribution: () => string;
    maxNativeZoom: () => number;
    maxZoom: () => number;
  };
  fs: FileSystemBridge;
  settings: SettingsBridge;
  fileStore: FileStoreBridge;
};
