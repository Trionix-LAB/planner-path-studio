import { describe, expect, it } from 'vitest';
import { utmToWgs84, wgs84ToUtm } from '@/features/geo/utm';

describe('UTM <-> WGS84 conversion', () => {
  it('keeps coordinates stable on round-trip for multiple zones/hemispheres', () => {
    const controlPoints = [
      { lat: 48.858244, lon: 2.294528, zone: 31, hemisphere: 'north' as const },
      { lat: 59.93863, lon: 30.31413, zone: 36, hemisphere: 'north' as const },
      { lat: 40.689249, lon: -74.0445, zone: 18, hemisphere: 'north' as const },
      { lat: -33.856784, lon: 151.215297, zone: 56, hemisphere: 'south' as const },
      { lat: -34.603722, lon: -58.381592, zone: 21, hemisphere: 'south' as const },
    ];

    for (const point of controlPoints) {
      const utm = wgs84ToUtm(point);
      expect(utm.zone).toBe(point.zone);
      expect(utm.hemisphere).toBe(point.hemisphere);
      expect(Number.isFinite(utm.easting)).toBe(true);
      expect(Number.isFinite(utm.northing)).toBe(true);

      const restored = utmToWgs84(utm);
      expect(Math.abs(restored.lat - point.lat)).toBeLessThan(1e-5);
      expect(Math.abs(restored.lon - point.lon)).toBeLessThan(1e-5);
    }
  });

  it('rejects invalid UTM zones', () => {
    expect(() =>
      utmToWgs84({
        easting: 500000,
        northing: 5000000,
        zone: 0,
        hemisphere: 'north',
      }),
    ).toThrow(/UTM зона/iu);
  });

  it('rejects out-of-range WGS84 latitude for UTM projection', () => {
    expect(() => wgs84ToUtm({ lat: 85, lon: 0 })).toThrow(/-80\.\.84/iu);
  });
});
