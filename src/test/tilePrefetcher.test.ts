import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prefetchTiles } from '@/features/map/offlineTiles/tilePrefetcher';
import type { TileCache } from '@/features/map/offlineTiles/tileCache';

type CacheRecord = {
  blob: Blob;
  lastAccess: number;
};

const createMemoryCache = (): TileCache & { entries: Map<string, CacheRecord> } => {
  const entries = new Map<string, CacheRecord>();
  return {
    entries,
    makeKey: (provider, z, x, y) => `${provider}|${z}|${x}|${y}`,
    get: async (key) => {
      const found = entries.get(key);
      if (!found) return null;
      found.lastAccess = Date.now();
      return { key, blob: found.blob, sizeBytes: found.blob.size, lastAccess: found.lastAccess };
    },
    put: async (key, input) => {
      entries.set(key, { blob: input.blob, lastAccess: Date.now() });
    },
    remove: async (key) => {
      entries.delete(key);
    },
    clear: async () => {
      entries.clear();
    },
    getStats: async () => ({
      totalBytes: Array.from(entries.values()).reduce((acc, item) => acc + item.blob.size, 0),
      entries: entries.size,
      maxBytes: 1024 * 1024,
      hits: 0,
      misses: 0,
    }),
    setMaxBytes: () => undefined,
  };
};

describe('tile prefetcher', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('downloads missing tiles and stores them in cache', async () => {
    const cache = createMemoryCache();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob(['tile-data']),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const progress = await prefetchTiles({
      cache,
      providerKey: 'osm',
      tileUrlTemplate: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      subdomains: 'abc',
      bbox: { north: 10, south: -10, west: -10, east: 10 },
      zoomMin: 0,
      zoomMax: 0,
      concurrency: 2,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(progress.total).toBe(1);
    expect(progress.downloaded).toBe(1);
    expect(progress.skipped).toBe(0);
    expect(cache.entries.size).toBe(1);
  });

  it('skips already cached tiles', async () => {
    const cache = createMemoryCache();
    const key = cache.makeKey('osm', 0, 0, 0);
    await cache.put(key, {
      provider: 'osm',
      url: 'https://a.tile.openstreetmap.org/0/0/0.png',
      z: 0,
      x: 0,
      y: 0,
      blob: new Blob(['cached']),
    });

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const progress = await prefetchTiles({
      cache,
      providerKey: 'osm',
      tileUrlTemplate: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      subdomains: 'abc',
      bbox: { north: 20, south: -20, west: -20, east: 20 },
      zoomMin: 0,
      zoomMax: 0,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(progress.total).toBe(1);
    expect(progress.skipped).toBe(1);
    expect(progress.downloaded).toBe(0);
  });

  it('retries failed network requests and completes download', async () => {
    const cache = createMemoryCache();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({
        ok: true,
        blob: async () => new Blob(['tile-data']),
      });
    vi.stubGlobal('fetch', fetchMock);

    const progress = await prefetchTiles({
      cache,
      providerKey: 'osm',
      tileUrlTemplate: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      subdomains: 'abc',
      bbox: { north: 10, south: -10, west: -10, east: 10 },
      zoomMin: 0,
      zoomMax: 0,
      retryCount: 2,
      retryDelayMs: 0,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(progress.total).toBe(1);
    expect(progress.downloaded).toBe(1);
    expect(progress.failed).toBe(0);
    expect(cache.entries.size).toBe(1);
  });

  it('skips unavailable tiles (404) without failing prefetch', async () => {
    const cache = createMemoryCache();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });
    vi.stubGlobal('fetch', fetchMock);

    const progress = await prefetchTiles({
      cache,
      providerKey: 'osm',
      tileUrlTemplate: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      subdomains: 'abc',
      bbox: { north: 10, south: -10, west: -10, east: 10 },
      zoomMin: 0,
      zoomMax: 0,
      retryCount: 2,
      retryDelayMs: 0,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(progress.total).toBe(1);
    expect(progress.completed).toBe(1);
    expect(progress.skipped).toBe(1);
    expect(progress.failed).toBe(0);
    expect(progress.downloaded).toBe(0);
    expect(cache.entries.size).toBe(0);
  });

  it('treats provider http errors as skipped after retries', async () => {
    const cache = createMemoryCache();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });
    vi.stubGlobal('fetch', fetchMock);

    const progress = await prefetchTiles({
      cache,
      providerKey: 'osm',
      tileUrlTemplate: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      subdomains: 'abc',
      bbox: { north: 10, south: -10, west: -10, east: 10 },
      zoomMin: 0,
      zoomMax: 0,
      retryCount: 2,
      retryDelayMs: 0,
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(progress.total).toBe(1);
    expect(progress.completed).toBe(1);
    expect(progress.skipped).toBe(1);
    expect(progress.failed).toBe(0);
    expect(progress.downloaded).toBe(0);
    expect(cache.entries.size).toBe(0);
  });

  it('re-downloads tile if cached blob is invalid', async () => {
    const cache = createMemoryCache();
    const key = cache.makeKey('osm', 0, 0, 0);
    await cache.put(key, {
      provider: 'osm',
      url: 'https://a.tile.openstreetmap.org/0/0/0.png',
      z: 0,
      x: 0,
      y: 0,
      blob: new Blob([], { type: 'image/png' }),
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'image/png' }),
      blob: async () => new Blob(['tile-data'], { type: 'image/png' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const progress = await prefetchTiles({
      cache,
      providerKey: 'osm',
      tileUrlTemplate: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      subdomains: 'abc',
      bbox: { north: 10, south: -10, west: -10, east: 10 },
      zoomMin: 0,
      zoomMax: 0,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(progress.downloaded).toBe(1);
    expect(progress.skipped).toBe(0);
    expect(cache.entries.size).toBe(1);
  });
});
