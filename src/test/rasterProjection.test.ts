import { describe, expect, it } from 'vitest';
import { convertUtmBoundsToEpsg4326, convertWebMercatorBoundsToEpsg4326 } from '@/features/map/rasterOverlays/projection';

describe('raster projection', () => {
  it('converts WebMercator meter bounds to EPSG:4326 bounds', () => {
    const projected = {
      north: 6626162.082318116,
      south: 6625869.582318116,
      east: 580597.0418276978,
      west: 580050.1418276977,
    };

    const geographic = convertWebMercatorBoundsToEpsg4326(projected);

    expect(geographic.north).toBeGreaterThan(50);
    expect(geographic.north).toBeLessThan(60);
    expect(geographic.south).toBeLessThan(geographic.north);
    expect(geographic.east).toBeGreaterThan(5);
    expect(geographic.west).toBeGreaterThan(5);
    expect(geographic.west).toBeLessThan(geographic.east);
  });

  it('rejects invalid bounds order', () => {
    expect(() =>
      convertWebMercatorBoundsToEpsg4326({
        north: 1,
        south: 2,
        east: 1,
        west: 2,
      }),
    ).toThrow(/порядок/iu);
  });

  it('converts UTM bounds to EPSG:4326 bounds', () => {
    const projectedUtm = {
      north: 6626162.082318116,
      south: 6625869.582318116,
      east: 580597.0418276978,
      west: 580050.1418276977,
    };

    const geographic = convertUtmBoundsToEpsg4326(projectedUtm, 37, 'north');

    expect(geographic.north).toBeGreaterThan(59);
    expect(geographic.north).toBeLessThan(61);
    expect(geographic.south).toBeLessThan(geographic.north);
    expect(geographic.east).toBeGreaterThan(39);
    expect(geographic.west).toBeGreaterThan(38);
    expect(geographic.west).toBeLessThan(geographic.east);
  });
});
