export type PickDirectoryOptions = {
  title?: string;
  defaultPath?: string;
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
};
