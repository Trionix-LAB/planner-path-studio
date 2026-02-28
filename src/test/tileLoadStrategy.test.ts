import { describe, expect, it, vi } from 'vitest';
import { resolveTileCandidate } from '@/features/map/offlineTiles/tileLoadStrategy';

const blob = new Blob(['tile'], { type: 'image/png' });

describe('tile load strategy', () => {
  it('uses network first when online', async () => {
    const loadFromNetwork = vi.fn(async () => ({
      blob,
      request: { z: 10, x: 512, y: 340, scale: 1, childOffsetX: 0, childOffsetY: 0 },
      key: 'osm|10|512|340',
    }));
    const loadFromCacheHierarchy = vi.fn(async () => null);

    const resolved = await resolveTileCandidate({
      isOnline: true,
      loadFromNetwork,
      loadFromCacheHierarchy,
    });

    expect(loadFromNetwork).toHaveBeenCalledTimes(1);
    expect(loadFromCacheHierarchy).not.toHaveBeenCalled();
    expect(resolved?.source).toBe('network');
    expect(resolved?.candidate.key).toBe('osm|10|512|340');
  });

  it('falls back to cache when online request fails', async () => {
    const loadFromNetwork = vi.fn(async () => {
      throw new Error('network failed');
    });
    const loadFromCacheHierarchy = vi.fn(async () => ({
      blob,
      request: { z: 9, x: 256, y: 170, scale: 2, childOffsetX: 1, childOffsetY: 0 },
      key: 'osm|9|256|170',
    }));

    const resolved = await resolveTileCandidate({
      isOnline: true,
      loadFromNetwork,
      loadFromCacheHierarchy,
    });

    expect(loadFromNetwork).toHaveBeenCalledTimes(1);
    expect(loadFromCacheHierarchy).toHaveBeenCalledTimes(1);
    expect(resolved?.source).toBe('cache');
    expect(resolved?.candidate.key).toBe('osm|9|256|170');
  });

  it('uses cache only when offline', async () => {
    const loadFromNetwork = vi.fn(async () => ({
      blob,
      request: { z: 10, x: 512, y: 340, scale: 1, childOffsetX: 0, childOffsetY: 0 },
      key: 'osm|10|512|340',
    }));
    const loadFromCacheHierarchy = vi.fn(async () => ({
      blob,
      request: { z: 8, x: 128, y: 85, scale: 4, childOffsetX: 2, childOffsetY: 1 },
      key: 'osm|8|128|85',
    }));

    const resolved = await resolveTileCandidate({
      isOnline: false,
      loadFromNetwork,
      loadFromCacheHierarchy,
    });

    expect(loadFromNetwork).not.toHaveBeenCalled();
    expect(loadFromCacheHierarchy).toHaveBeenCalledTimes(1);
    expect(resolved?.source).toBe('cache');
    expect(resolved?.candidate.key).toBe('osm|8|128|85');
  });
});
