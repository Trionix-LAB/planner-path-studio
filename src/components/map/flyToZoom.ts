import { computeScaleFromMetersPerPixel } from './scaleUtils';

const EARTH_RADIUS_M = 6378137;
const TILE_SIZE_PX = 256;
const DEG_TO_RAD = Math.PI / 180;

export const FLY_TO_GRID_STEP_METERS = 50;

type ResolveFlyToZoomOptions = {
  gridStepM?: number;
  zoomSnap: number;
  maxZoom: number;
  minZoom?: number;
};

export const computeMetersPerPixelAtZoom = (latitude: number, zoom: number): number => {
  const safeLat = Math.max(-85, Math.min(85, latitude));
  const cosLat = Math.cos(safeLat * DEG_TO_RAD);
  return (2 * Math.PI * EARTH_RADIUS_M * cosLat) / (TILE_SIZE_PX * 2 ** zoom);
};

export const resolveFlyToZoomForGridStep = (latitude: number, options: ResolveFlyToZoomOptions): number => {
  const gridStepM = Number.isFinite(options.gridStepM) && (options.gridStepM ?? 0) > 0
    ? options.gridStepM!
    : FLY_TO_GRID_STEP_METERS;
  const zoomSnap = Number.isFinite(options.zoomSnap) && options.zoomSnap > 0 ? options.zoomSnap : 1;
  const minZoom = Number.isFinite(options.minZoom) ? options.minZoom! : 0;
  const maxZoom = Number.isFinite(options.maxZoom) ? options.maxZoom : 22;
  if (!Number.isFinite(latitude) || maxZoom < minZoom) return 16;

  let bestZoom = minZoom;
  let bestDelta = Number.POSITIVE_INFINITY;
  const steps = Math.ceil((maxZoom - minZoom) / zoomSnap);

  for (let i = 0; i <= steps; i += 1) {
    const candidateZoom = Math.min(maxZoom, minZoom + i * zoomSnap);
    const metersPerPixel = computeMetersPerPixelAtZoom(latitude, candidateZoom);
    const gridDistanceM = computeScaleFromMetersPerPixel(metersPerPixel).distanceM;
    const delta = Math.abs(gridDistanceM - gridStepM);
    if (delta < bestDelta || (delta === bestDelta && candidateZoom > bestZoom)) {
      bestDelta = delta;
      bestZoom = candidateZoom;
    }
  }

  return bestZoom;
};

export const resolveFlyToZoomFor50mGrid = (
  latitude: number,
  options: Omit<ResolveFlyToZoomOptions, 'gridStepM'>,
): number => resolveFlyToZoomForGridStep(latitude, { ...options, gridStepM: FLY_TO_GRID_STEP_METERS });
