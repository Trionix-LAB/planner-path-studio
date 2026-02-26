import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAP_SCALE,
  computeScaleFromMetersPerPixel,
  computeScaleRatioFromMetersPerPixel,
  formatScaleRatio,
} from '@/components/map/scaleUtils';

describe('scale utils', () => {
  it('returns default scale for invalid meters-per-pixel values', () => {
    expect(computeScaleFromMetersPerPixel(0)).toEqual(DEFAULT_MAP_SCALE);
    expect(computeScaleFromMetersPerPixel(Number.NaN)).toEqual(DEFAULT_MAP_SCALE);
  });

  it('keeps rendered width inside configured bounds', () => {
    const metersPerPixelSamples = [0.2, 1, 5, 20, 250, 50000];

    for (const metersPerPx of metersPerPixelSamples) {
      const scale = computeScaleFromMetersPerPixel(metersPerPx);
      expect(scale.widthPx).toBeGreaterThanOrEqual(60);
      expect(scale.widthPx).toBeLessThanOrEqual(150);
    }
  });

  it('formats kilometer labels for large distances', () => {
    const scale = computeScaleFromMetersPerPixel(20);
    expect(scale.distanceM).toBe(2000);
    expect(scale.label).toBe('2 км');
  });

  it('reduces scale distance monotonically when zooming in by full steps', () => {
    const metersPerPixelByStep = [1000, 500, 250, 125, 62.5, 31.25, 15.625, 7.8125];
    const distances = metersPerPixelByStep.map((metersPerPx) => computeScaleFromMetersPerPixel(metersPerPx).distanceM);
    for (let i = 1; i < distances.length; i += 1) {
      expect(distances[i]).toBeLessThan(distances[i - 1]);
    }
  });

  it('computes and formats scale ratio labels', () => {
    const denominator = computeScaleRatioFromMetersPerPixel(1);
    expect(denominator).toBe(3780);
    expect(formatScaleRatio(denominator ?? 0)).toBe('1:3 780');
  });

  it('returns null ratio for invalid inputs', () => {
    expect(computeScaleRatioFromMetersPerPixel(0)).toBeNull();
    expect(computeScaleRatioFromMetersPerPixel(Number.NaN)).toBeNull();
  });
});
