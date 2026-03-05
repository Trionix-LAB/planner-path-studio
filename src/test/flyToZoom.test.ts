import { describe, expect, it } from 'vitest';
import { computeScaleFromMetersPerPixel } from '@/components/map/scaleUtils';
import {
  computeMetersPerPixelAtZoom,
  FLY_TO_GRID_STEP_METERS,
  resolveFlyToZoomFor50mGrid,
  resolveFlyToZoomForGridStep,
} from '@/components/map/flyToZoom';

describe('flyTo zoom for grid step', () => {
  it('returns snapped zoom that minimizes delta to target grid step', () => {
    const zoomSnap = 0.25;
    const minZoom = 0;
    const maxZoom = 22;
    const targetLat = 59.9343;
    const targetStep = 50;

    const zoom = resolveFlyToZoomForGridStep(targetLat, {
      gridStepM: targetStep,
      zoomSnap,
      minZoom,
      maxZoom,
    });

    expect(zoom).toBeGreaterThanOrEqual(minZoom);
    expect(zoom).toBeLessThanOrEqual(maxZoom);
    expect(Math.round(zoom / zoomSnap) * zoomSnap).toBeCloseTo(zoom, 6);

    const chosenDistance = computeScaleFromMetersPerPixel(computeMetersPerPixelAtZoom(targetLat, zoom)).distanceM;
    const chosenDelta = Math.abs(chosenDistance - targetStep);

    let minDelta = Number.POSITIVE_INFINITY;
    const steps = Math.ceil((maxZoom - minZoom) / zoomSnap);
    for (let i = 0; i <= steps; i += 1) {
      const candidateZoom = Math.min(maxZoom, minZoom + i * zoomSnap);
      const candidateDistance = computeScaleFromMetersPerPixel(
        computeMetersPerPixelAtZoom(targetLat, candidateZoom),
      ).distanceM;
      minDelta = Math.min(minDelta, Math.abs(candidateDistance - targetStep));
    }

    expect(chosenDelta).toBeCloseTo(minDelta, 6);
  });

  it('uses 50m target in the convenience wrapper', () => {
    const lat = 42;
    const options = { zoomSnap: 1, maxZoom: 22, minZoom: 0 };
    const fromGridStep = resolveFlyToZoomForGridStep(lat, { ...options, gridStepM: FLY_TO_GRID_STEP_METERS });
    const fromConvenience = resolveFlyToZoomFor50mGrid(lat, options);
    expect(fromConvenience).toBe(fromGridStep);
  });

  it('returns fallback zoom for invalid latitude', () => {
    const zoom = resolveFlyToZoomFor50mGrid(Number.NaN, { zoomSnap: 1, maxZoom: 22 });
    expect(zoom).toBe(16);
  });
});
