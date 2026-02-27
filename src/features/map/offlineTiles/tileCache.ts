const DB_NAME = 'planner.tileCache.v1';
const DB_VERSION = 1;
const TILE_STORE = 'tiles';
const META_STORE = 'tileMeta';
const STATS_STORE = 'cacheStats';
const STATS_KEY = 'global';
const DEFAULT_MAX_CACHE_BYTES = 512 * 1024 * 1024;

type TileRecord = {
  key: string;
  blob: Blob;
};

type TileMetaRecord = {
  key: string;
  provider: string;
  url: string;
  z: number;
  x: number;
  y: number;
  sizeBytes: number;
  createdAt: number;
  lastAccess: number;
};

type CacheStatsRecord = {
  key: string;
  totalBytes: number;
  entries: number;
};

export type TileCacheStats = {
  totalBytes: number;
  entries: number;
  maxBytes: number;
  hits: number;
  misses: number;
};

type CachedTile = {
  key: string;
  blob: Blob;
  sizeBytes: number;
  lastAccess: number;
};

const requestToPromise = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });

const transactionDone = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
  });

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(TILE_STORE)) {
        db.createObjectStore(TILE_STORE, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        const meta = db.createObjectStore(META_STORE, { keyPath: 'key' });
        meta.createIndex('lastAccess', 'lastAccess', { unique: false });
      }
      if (!db.objectStoreNames.contains(STATS_STORE)) {
        db.createObjectStore(STATS_STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });

const createInitialStats = (): CacheStatsRecord => ({ key: STATS_KEY, entries: 0, totalBytes: 0 });

export interface TileCache {
  makeKey: (provider: string, z: number, x: number, y: number) => string;
  get: (key: string) => Promise<CachedTile | null>;
  put: (
    key: string,
    input: { provider: string; url: string; z: number; x: number; y: number; blob: Blob },
  ) => Promise<void>;
  remove: (key: string) => Promise<void>;
  clear: () => Promise<void>;
  getStats: () => Promise<TileCacheStats>;
  setMaxBytes: (value: number) => void;
}

class IndexedDbTileCache implements TileCache {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private maxBytes = DEFAULT_MAX_CACHE_BYTES;
  private hits = 0;
  private misses = 0;

  makeKey(provider: string, z: number, x: number, y: number): string {
    return `${provider}|${z}|${x}|${y}`;
  }

  setMaxBytes(value: number): void {
    if (!Number.isFinite(value)) return;
    this.maxBytes = Math.max(32 * 1024 * 1024, Math.trunc(value));
  }

  async get(key: string): Promise<CachedTile | null> {
    const db = await this.getDb();
    const tx = db.transaction([TILE_STORE, META_STORE], 'readwrite');
    const tiles = tx.objectStore(TILE_STORE);
    const meta = tx.objectStore(META_STORE);

    const tileRecord = (await requestToPromise(tiles.get(key))) as TileRecord | undefined;
    const metaRecord = (await requestToPromise(meta.get(key))) as TileMetaRecord | undefined;
    if (!tileRecord || !metaRecord) {
      this.misses += 1;
      await transactionDone(tx);
      return null;
    }

    metaRecord.lastAccess = Date.now();
    meta.put(metaRecord);
    this.hits += 1;
    await transactionDone(tx);

    return {
      key,
      blob: tileRecord.blob,
      sizeBytes: metaRecord.sizeBytes,
      lastAccess: metaRecord.lastAccess,
    };
  }

  async put(
    key: string,
    input: { provider: string; url: string; z: number; x: number; y: number; blob: Blob },
  ): Promise<void> {
    const db = await this.getDb();
    const tx = db.transaction([TILE_STORE, META_STORE, STATS_STORE], 'readwrite');
    const tiles = tx.objectStore(TILE_STORE);
    const meta = tx.objectStore(META_STORE);
    const stats = tx.objectStore(STATS_STORE);

    const now = Date.now();
    const sizeBytes = input.blob.size;

    const existingMeta = (await requestToPromise(meta.get(key))) as TileMetaRecord | undefined;
    const statsRecord =
      ((await requestToPromise(stats.get(STATS_KEY))) as CacheStatsRecord | undefined) ?? createInitialStats();

    tiles.put({ key, blob: input.blob } satisfies TileRecord);
    meta.put({
      key,
      provider: input.provider,
      url: input.url,
      z: input.z,
      x: input.x,
      y: input.y,
      sizeBytes,
      createdAt: existingMeta?.createdAt ?? now,
      lastAccess: now,
    } satisfies TileMetaRecord);

    const previousSize = existingMeta?.sizeBytes ?? 0;
    if (!existingMeta) {
      statsRecord.entries += 1;
    }
    statsRecord.totalBytes = Math.max(0, statsRecord.totalBytes + sizeBytes - previousSize);
    stats.put(statsRecord);
    await transactionDone(tx);

    if (statsRecord.totalBytes > this.maxBytes) {
      await this.evictLru();
    }
  }

  async clear(): Promise<void> {
    const db = await this.getDb();
    const tx = db.transaction([TILE_STORE, META_STORE, STATS_STORE], 'readwrite');
    tx.objectStore(TILE_STORE).clear();
    tx.objectStore(META_STORE).clear();
    tx.objectStore(STATS_STORE).put(createInitialStats());
    await transactionDone(tx);
    this.hits = 0;
    this.misses = 0;
  }

  async remove(key: string): Promise<void> {
    const db = await this.getDb();
    const tx = db.transaction([TILE_STORE, META_STORE, STATS_STORE], 'readwrite');
    const tiles = tx.objectStore(TILE_STORE);
    const meta = tx.objectStore(META_STORE);
    const stats = tx.objectStore(STATS_STORE);

    const existingMeta = (await requestToPromise(meta.get(key))) as TileMetaRecord | undefined;
    if (!existingMeta) {
      await transactionDone(tx);
      return;
    }

    const statsRecord =
      ((await requestToPromise(stats.get(STATS_KEY))) as CacheStatsRecord | undefined) ?? createInitialStats();

    tiles.delete(key);
    meta.delete(key);
    statsRecord.entries = Math.max(0, statsRecord.entries - 1);
    statsRecord.totalBytes = Math.max(0, statsRecord.totalBytes - existingMeta.sizeBytes);
    stats.put(statsRecord);
    await transactionDone(tx);
  }

  async getStats(): Promise<TileCacheStats> {
    const db = await this.getDb();
    const tx = db.transaction([STATS_STORE], 'readonly');
    const store = tx.objectStore(STATS_STORE);
    const record = ((await requestToPromise(store.get(STATS_KEY))) as CacheStatsRecord | undefined) ?? createInitialStats();
    await transactionDone(tx);
    return {
      totalBytes: record.totalBytes,
      entries: record.entries,
      maxBytes: this.maxBytes,
      hits: this.hits,
      misses: this.misses,
    };
  }

  private async evictLru(): Promise<void> {
    const db = await this.getDb();
    const readTx = db.transaction([META_STORE, STATS_STORE], 'readonly');
    const metaStore = readTx.objectStore(META_STORE);
    const statsStore = readTx.objectStore(STATS_STORE);
    const statsRecord =
      ((await requestToPromise(statsStore.get(STATS_KEY))) as CacheStatsRecord | undefined) ?? createInitialStats();
    const allMeta = (await requestToPromise(metaStore.getAll())) as TileMetaRecord[];
    await transactionDone(readTx);

    if (statsRecord.totalBytes <= this.maxBytes) return;

    const sorted = [...allMeta].sort((a, b) => a.lastAccess - b.lastAccess);
    let bytes = statsRecord.totalBytes;
    let entries = statsRecord.entries;
    const keysToDelete: string[] = [];

    for (const item of sorted) {
      if (bytes <= this.maxBytes) break;
      keysToDelete.push(item.key);
      bytes = Math.max(0, bytes - item.sizeBytes);
      entries = Math.max(0, entries - 1);
    }

    if (keysToDelete.length === 0) return;

    const writeTx = db.transaction([TILE_STORE, META_STORE, STATS_STORE], 'readwrite');
    const tileWrite = writeTx.objectStore(TILE_STORE);
    const metaWrite = writeTx.objectStore(META_STORE);
    const statsWrite = writeTx.objectStore(STATS_STORE);
    for (const key of keysToDelete) {
      tileWrite.delete(key);
      metaWrite.delete(key);
    }
    statsWrite.put({ key: STATS_KEY, totalBytes: bytes, entries } satisfies CacheStatsRecord);
    await transactionDone(writeTx);
  }

  private async getDb(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = openDb();
    }
    return this.dbPromise;
  }
}

let tileCacheSingleton: TileCache | null = null;

export const getTileCache = (): TileCache => {
  if (!tileCacheSingleton) {
    tileCacheSingleton = new IndexedDbTileCache();
  }
  return tileCacheSingleton;
};
