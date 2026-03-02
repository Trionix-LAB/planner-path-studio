import { describe, expect, it } from 'vitest';
import { assertBoundsWithinEpsg4326, isBoundsWithinEpsg4326 } from '@/features/map/rasterOverlays/bounds';

describe('raster bounds validation (EPSG:4326)', () => {
  it('accepts valid WGS84 bounds', () => {
    const bounds = {
      north: 60,
      south: 59.9,
      east: 30.2,
      west: 30.1,
    };

    expect(isBoundsWithinEpsg4326(bounds)).toBe(true);
    expect(() => assertBoundsWithinEpsg4326(bounds, 'TFW')).not.toThrow();
  });

  it('rejects projected coordinates outside WGS84 range', () => {
    const projectedBounds = {
      north: 6626162.08,
      south: 6625869.58,
      east: 580597.04,
      west: 580050.14,
    };

    expect(isBoundsWithinEpsg4326(projectedBounds)).toBe(false);
    expect(() => assertBoundsWithinEpsg4326(projectedBounds, 'TFW')).toThrow(/EPSG:4326/i);
  });
});
