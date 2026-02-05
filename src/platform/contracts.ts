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
};

export type FileSystemBridge = {
  pickDirectory: (options?: PickDirectoryOptions) => Promise<string | null>;
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
  };
  fs: FileSystemBridge;
  fileStore: FileStoreBridge;
};
