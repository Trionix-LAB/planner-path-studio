import { describe, expect, it } from 'vitest';
import { convertPoint, formatPoint, getCrsLabel, type CrsId } from '@/features/geo/crs';

describe('CRS conversion (R-060)', () => {
  const moscowWgs = { lat: 55.755826, lon: 37.6173 };
  const referencePairs = [
    {
      name: 'Эйфелева башня',
      wgs84: { lat: 48.858244, lon: 2.294528 },
      sk42: { lat: 48.856114, lon: 2.295868 },
      gsk2011: { lat: 48.858247, lon: 2.29453 },
    },
    {
      name: 'Колизей',
      wgs84: { lat: 41.890278, lon: 12.492222 },
      sk42: { lat: 41.888145, lon: 12.493563 },
      gsk2011: { lat: 41.890281, lon: 12.492224 },
    },
    {
      name: 'Акрополь',
      wgs84: { lat: 37.971389, lon: 23.726667 },
      sk42: { lat: 37.969255, lon: 23.728008 },
      gsk2011: { lat: 37.971392, lon: 23.726669 },
    },
    {
      name: 'Красная площадь',
      wgs84: { lat: 55.753611, lon: 37.619722 },
      sk42: { lat: 55.751477, lon: 37.621063 },
      gsk2011: { lat: 55.753614, lon: 37.619724 },
    },
    {
      name: 'Аль-Харам, Мекка',
      wgs84: { lat: 21.422583, lon: 39.826111 },
      sk42: { lat: 21.420449, lon: 39.827454 },
      gsk2011: { lat: 21.422586, lon: 39.826113 },
    },
    {
      name: 'Великая стена',
      wgs84: { lat: 40.358611, lon: 116.004167 },
      sk42: { lat: 40.356477, lon: 116.005508 },
      gsk2011: { lat: 40.358614, lon: 116.004169 },
    },
    {
      name: 'Тадж-Махал',
      wgs84: { lat: 27.175, lon: 78.042222 },
      sk42: { lat: 27.172866, lon: 78.043563 },
      gsk2011: { lat: 27.175003, lon: 78.042224 },
    },
    {
      name: 'Гора Фудзи',
      wgs84: { lat: 35.358056, lon: 138.731111 },
      sk42: { lat: 35.355922, lon: 138.732452 },
      gsk2011: { lat: 35.358059, lon: 138.731113 },
    },
    {
      name: 'Статуя Свободы',
      wgs84: { lat: 40.689444, lon: -74.044444 },
      sk42: { lat: 40.68731, lon: -74.043058 },
      gsk2011: { lat: 40.689447, lon: -74.044442 },
    },
    {
      name: 'Моаи, о. Пасхи',
      wgs84: { lat: -27.116944, lon: -109.349167 },
      sk42: { lat: -27.119077, lon: -109.347825 },
      gsk2011: { lat: -27.116941, lon: -109.349165 },
    },
  ];
  const compatibilityControlWgs = { lat: 48.858244, lon: 2.294528 };
  const compatibilityControlSk42 = { lat: 48.856117, lon: 2.295861 };
  const compatibilityControlGsk2011 = { lat: 48.858247, lon: 2.29455 };

  const distanceMeters = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
    const r = 6371008.8;
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * r * Math.asin(Math.sqrt(h));
  };

  it('keeps WGS84 -> SK-42 within 50m for reference points from coordinates.md', () => {
    for (const row of referencePairs) {
      const converted = convertPoint(row.wgs84, 'wgs84', 'sk42');
      expect(distanceMeters(converted, row.sk42), row.name).toBeLessThan(50);
    }
  });

  it('keeps SK-42 -> WGS84 within 50m for reference points from coordinates.md', () => {
    for (const row of referencePairs) {
      const converted = convertPoint(row.sk42, 'sk42', 'wgs84');
      expect(distanceMeters(converted, row.wgs84), row.name).toBeLessThan(50);
    }
  });

  it('keeps WGS84 and GSK-2011 nearly identical for geographic input', () => {
    const gsk = convertPoint(moscowWgs, 'wgs84', 'gsk2011');
    const back = convertPoint(gsk, 'gsk2011', 'wgs84');

    expect(gsk.lat).toBeCloseTo(moscowWgs.lat, 6);
    expect(gsk.lon).toBeCloseTo(moscowWgs.lon, 6);
    expect(back.lat).toBeCloseTo(moscowWgs.lat, 6);
    expect(back.lon).toBeCloseTo(moscowWgs.lon, 6);
  });

  it('keeps WGS84 <-> GSK-2011 within 5m for reference points from coordinates.md', () => {
    for (const row of referencePairs) {
      const toGsk = convertPoint(row.wgs84, 'wgs84', 'gsk2011');
      const toWgs = convertPoint(row.gsk2011, 'gsk2011', 'wgs84');
      expect(distanceMeters(toGsk, row.gsk2011), `${row.name} toGsk`).toBeLessThan(5);
      expect(distanceMeters(toWgs, row.wgs84), `${row.name} toWgs`).toBeLessThan(5);
    }
  });

  it('round-trips SK-42 <-> WGS84', () => {
    const sk42 = convertPoint(moscowWgs, 'wgs84', 'sk42');
    const back = convertPoint(sk42, 'sk42', 'wgs84');

    expect(back.lat).toBeCloseTo(moscowWgs.lat, 6);
    expect(back.lon).toBeCloseTo(moscowWgs.lon, 6);
  });

  it('supports cross-conversion via WGS84 (SK-42 -> GSK-2011)', () => {
    const sk42 = convertPoint(moscowWgs, 'wgs84', 'sk42');
    const gsk = convertPoint(sk42, 'sk42', 'gsk2011');

    expect(gsk.lat).toBeCloseTo(moscowWgs.lat, 4);
    expect(gsk.lon).toBeCloseTo(moscowWgs.lon, 4);
  });

  it('matches compatibility control point outside official EPSG area (WGS84 <-> SK-42)', () => {
    const sk42 = convertPoint(compatibilityControlWgs, 'wgs84', 'sk42');
    const back = convertPoint(sk42, 'sk42', 'wgs84');

    expect(sk42.lat).toBeCloseTo(compatibilityControlSk42.lat, 6);
    expect(sk42.lon).toBeCloseTo(compatibilityControlSk42.lon, 6);
    expect(back.lat).toBeCloseTo(compatibilityControlWgs.lat, 6);
    expect(back.lon).toBeCloseTo(compatibilityControlWgs.lon, 6);
  });

  it('matches compatibility control point outside official EPSG area (WGS84 <-> GSK-2011)', () => {
    const gsk = convertPoint(compatibilityControlWgs, 'wgs84', 'gsk2011');
    const back = convertPoint(gsk, 'gsk2011', 'wgs84');

    expect(gsk.lat).toBeCloseTo(compatibilityControlGsk2011.lat, 6);
    expect(gsk.lon).toBeCloseTo(compatibilityControlGsk2011.lon, 6);
    expect(back.lat).toBeCloseTo(compatibilityControlWgs.lat, 6);
    expect(back.lon).toBeCloseTo(compatibilityControlWgs.lon, 6);
  });

  it('formats labels/points for UI', () => {
    const label = getCrsLabel('sk42');
    const formatted = formatPoint('wgs84', moscowWgs, 4);

    expect(label).toMatch(/СК-42/i);
    expect(formatted).toBe('55.7558, 37.6173');
  });

  it('rejects out-of-range coordinates', () => {
    expect(() => convertPoint({ lat: 120, lon: 37 }, 'wgs84', 'sk42')).toThrow(/широта/i);
    expect(() => convertPoint({ lat: 55, lon: 220 }, 'wgs84', 'gsk2011')).toThrow(/долгота/i);
  });

  it('exposes labels for all supported CRS ids', () => {
    const ids: CrsId[] = ['wgs84', 'sk42', 'gsk2011'];
    for (const id of ids) {
      expect(getCrsLabel(id).length).toBeGreaterThan(0);
    }
  });
});
