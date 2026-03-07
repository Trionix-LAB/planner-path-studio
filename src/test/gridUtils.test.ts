import { describe, expect, it } from 'vitest';
import { boundsToUtm, buildUtmGridLines, type GridLine } from '@/components/map/gridUtils';
import { wgs84ToUtm } from '@/features/geo/utm';

type Corner = { lat: number; lon: number };

const collectAxisAnchors = (lines: GridLine[]): { vertical: number[]; horizontal: number[] } => {
  const vertical: number[] = [];
  const horizontal: number[] = [];

  for (const [[lat1, lon1], [lat2, lon2]] of lines) {
    const start = wgs84ToUtm({ lat: lat1, lon: lon1 });
    const end = wgs84ToUtm({ lat: lat2, lon: lon2 });
    if (start.zone !== end.zone || start.hemisphere !== end.hemisphere) {
      continue;
    }

    const eastingSpan = Math.abs(start.easting - end.easting);
    const northingSpan = Math.abs(start.northing - end.northing);
    if (eastingSpan <= northingSpan) {
      vertical.push((start.easting + end.easting) / 2);
    } else {
      horizontal.push((start.northing + end.northing) / 2);
    }
  }

  return { vertical, horizontal };
};

const medianSpacing = (values: number[]): number | null => {
  if (values.length < 2) {
    return null;
  }

  const normalized = values.map((value) => Math.round(value * 1000) / 1000);
  const uniqueSorted = Array.from(new Set(normalized)).sort((a, b) => a - b);
  if (uniqueSorted.length < 2) {
    return null;
  }

  const deltas: number[] = [];
  for (let i = 1; i < uniqueSorted.length; i += 1) {
    const delta = uniqueSorted[i] - uniqueSorted[i - 1];
    if (delta > 0) {
      deltas.push(delta);
    }
  }
  if (deltas.length === 0) {
    return null;
  }

  const sortedDeltas = deltas.sort((a, b) => a - b);
  return sortedDeltas[Math.floor(sortedDeltas.length / 2)];
};

const assertSpacingWithinTolerance = (center: Corner, corners: Corner[], step: number): void => {
  const bounds = boundsToUtm(center.lat, center.lon, corners);
  expect(bounds).not.toBeNull();

  const lines = buildUtmGridLines(bounds!, step, 0);
  expect(lines.length).toBeGreaterThan(0);

  const anchors = collectAxisAnchors(lines);
  const verticalSpacing = medianSpacing(anchors.vertical);
  const horizontalSpacing = medianSpacing(anchors.horizontal);
  expect(verticalSpacing).not.toBeNull();
  expect(horizontalSpacing).not.toBeNull();

  const verticalError = Math.abs((verticalSpacing ?? step) - step) / step;
  const horizontalError = Math.abs((horizontalSpacing ?? step) - step) / step;
  expect(verticalError).toBeLessThanOrEqual(0.01);
  expect(horizontalError).toBeLessThanOrEqual(0.01);
};

describe('boundsToUtm', () => {
  it('returns center zone metadata for Saint Petersburg viewport', () => {
    const result = boundsToUtm(59.9, 30.3, [
      { lat: 60.0, lon: 30.0 },
      { lat: 60.0, lon: 30.6 },
      { lat: 59.8, lon: 30.0 },
      { lat: 59.8, lon: 30.6 },
    ]);

    expect(result).not.toBeNull();
    expect(result?.zone).toBe(36);
    expect(result?.hemisphere).toBe('north');
    expect((result?.minEasting ?? 0) < (result?.maxEasting ?? 0)).toBe(true);
    expect((result?.minNorthing ?? 0) < (result?.maxNorthing ?? 0)).toBe(true);
  });

  it('returns null when center latitude is outside UTM range', () => {
    expect(
      boundsToUtm(85, 0, [
        { lat: 85, lon: -1 },
        { lat: 85, lon: 1 },
        { lat: 84.5, lon: -1 },
        { lat: 84.5, lon: 1 },
      ]),
    ).toBeNull();

    expect(
      boundsToUtm(-81, 0, [
        { lat: -80.5, lon: -1 },
        { lat: -80.5, lon: 1 },
        { lat: -81, lon: -1 },
        { lat: -81, lon: 1 },
      ]),
    ).toBeNull();
  });
});

describe('buildUtmGridLines', () => {
  it('returns empty array for invalid step', () => {
    const bounds = boundsToUtm(59.9, 30.3, [
      { lat: 60.0, lon: 30.0 },
      { lat: 60.0, lon: 30.6 },
      { lat: 59.8, lon: 30.0 },
      { lat: 59.8, lon: 30.6 },
    ]);

    expect(bounds).not.toBeNull();
    expect(buildUtmGridLines(bounds!, 0)).toEqual([]);
    expect(buildUtmGridLines(bounds!, -100)).toEqual([]);
    expect(buildUtmGridLines(bounds!, Number.NaN)).toEqual([]);
  });

  it('keeps spacing error within 1% at ~60° latitude', () => {
    assertSpacingWithinTolerance(
      { lat: 59.9, lon: 30.3 },
      [
        { lat: 60.05, lon: 30.1 },
        { lat: 60.05, lon: 30.5 },
        { lat: 59.75, lon: 30.1 },
        { lat: 59.75, lon: 30.5 },
      ],
      100,
    );
  });

  it('keeps spacing error within 1% near equator', () => {
    assertSpacingWithinTolerance(
      { lat: 0.1, lon: 0.1 },
      [
        { lat: 0.2, lon: 0.0 },
        { lat: 0.2, lon: 0.2 },
        { lat: 0.0, lon: 0.0 },
        { lat: 0.0, lon: 0.2 },
      ],
      50,
    );
  });

  it('keeps spacing error within 1% in southern hemisphere', () => {
    assertSpacingWithinTolerance(
      { lat: -34.6, lon: -58.4 },
      [
        { lat: -34.5, lon: -58.5 },
        { lat: -34.5, lon: -58.3 },
        { lat: -34.7, lon: -58.5 },
        { lat: -34.7, lon: -58.3 },
      ],
      200,
    );
  });

  it('returns lines with exactly two coordinate points', () => {
    const bounds = boundsToUtm(59.9, 30.3, [
      { lat: 60.0, lon: 30.0 },
      { lat: 60.0, lon: 30.6 },
      { lat: 59.8, lon: 30.0 },
      { lat: 59.8, lon: 30.6 },
    ]);
    expect(bounds).not.toBeNull();

    const lines = buildUtmGridLines(bounds!, 100);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).toHaveLength(2);
      expect(line[0]).toHaveLength(2);
      expect(line[1]).toHaveLength(2);
    }
  });

  it('builds axis-aligned lines on map (strict vertical/horizontal)', () => {
    const bounds = boundsToUtm(59.9, 30.3, [
      { lat: 60.0, lon: 30.0 },
      { lat: 60.0, lon: 30.6 },
      { lat: 59.8, lon: 30.0 },
      { lat: 59.8, lon: 30.6 },
    ]);
    expect(bounds).not.toBeNull();

    const lines = buildUtmGridLines(bounds!, 100);
    expect(lines.length).toBeGreaterThan(0);

    for (const [[lat1, lon1], [lat2, lon2]] of lines) {
      const vertical = Math.abs(lon1 - lon2) < 1e-12;
      const horizontal = Math.abs(lat1 - lat2) < 1e-12;
      expect(vertical || horizontal).toBe(true);
    }
  });
});
