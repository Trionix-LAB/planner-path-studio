import L from 'leaflet';

export type MapScale = {
  widthPx: number;
  distanceM: number;
  label: string;
};

type ScaleOptions = {
  targetWidthPx?: number;
  minWidthPx?: number;
  maxWidthPx?: number;
};

const EARTH_RADIUS_M = 6378137;
const DEG_TO_RAD = Math.PI / 180;
const NICE_FACTORS = [1, 2, 5];

const DEFAULT_TARGET_WIDTH_PX = 100;
const DEFAULT_MIN_WIDTH_PX = 60;
const DEFAULT_MAX_WIDTH_PX = 150;
const DEFAULT_SCREEN_DPI = 96;
const METERS_PER_INCH = 0.0254;

export const DEFAULT_SCALE_RATIO_LABEL = '1:--';

export const DEFAULT_MAP_SCALE: MapScale = {
  widthPx: 96,
  distanceM: 100,
  label: '100 м',
};

export const haversineDistanceMeters = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number => {
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLon = (lon2 - lon1) * DEG_TO_RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const formatDistanceLabel = (meters: number): string => {
  if (meters >= 1000) {
    return meters % 1000 === 0 ? `${meters / 1000} км` : `${(meters / 1000).toFixed(1)} км`;
  }
  return `${meters} м`;
};

const buildNiceStepsInRange = (minDistance: number, maxDistance: number): number[] => {
  if (!Number.isFinite(minDistance) || !Number.isFinite(maxDistance) || maxDistance < minDistance) {
    return [];
  }

  const steps = new Set<number>();
  const startExp = Math.floor(Math.log10(Math.max(1, minDistance))) - 1;
  const endExp = Math.ceil(Math.log10(Math.max(1, maxDistance))) + 1;

  for (let exp = startExp; exp <= endExp; exp += 1) {
    const base = 10 ** exp;
    for (const factor of NICE_FACTORS) {
      const value = factor * base;
      if (value >= minDistance && value <= maxDistance) {
        steps.add(Math.round(value));
      }
    }
  }

  return Array.from(steps).sort((a, b) => a - b);
};

const pickClosest = (values: number[], target: number): number => {
  if (values.length === 0) return Math.max(1, Math.round(target));
  let winner = values[0];
  let bestDelta = Math.abs(values[0] - target);
  for (let i = 1; i < values.length; i += 1) {
    const delta = Math.abs(values[i] - target);
    if (delta < bestDelta) {
      bestDelta = delta;
      winner = values[i];
    }
  }
  return winner;
};

export const computeScaleFromMetersPerPixel = (
  metersPerPx: number,
  options?: ScaleOptions,
): MapScale => {
  if (!Number.isFinite(metersPerPx) || metersPerPx <= 0) {
    return DEFAULT_MAP_SCALE;
  }

  const targetWidthPx = options?.targetWidthPx ?? DEFAULT_TARGET_WIDTH_PX;
  const minWidthPx = options?.minWidthPx ?? DEFAULT_MIN_WIDTH_PX;
  const maxWidthPx = options?.maxWidthPx ?? DEFAULT_MAX_WIDTH_PX;

  const minDistance = Math.max(1, metersPerPx * minWidthPx);
  const maxDistance = Math.max(minDistance, metersPerPx * maxWidthPx);
  const preferredDistance = metersPerPx * targetWidthPx;

  const candidates = buildNiceStepsInRange(minDistance, maxDistance);
  const distanceM = pickClosest(candidates, preferredDistance);
  const widthPx = distanceM / metersPerPx;

  return {
    widthPx,
    distanceM,
    label: formatDistanceLabel(distanceM),
  };
};

export const computeScaleFromMap = (map: L.Map, options?: ScaleOptions): MapScale => {
  const metersPerPx = computeMetersPerPixelFromMap(map, options?.targetWidthPx);
  return computeScaleFromMetersPerPixel(metersPerPx, options);
};

export const computeMetersPerPixelFromMap = (map: L.Map, targetWidthPx = DEFAULT_TARGET_WIDTH_PX): number => {
  if (!Number.isFinite(targetWidthPx) || targetWidthPx <= 0) {
    return Number.NaN;
  }
  const center = map.getCenter();
  const centerPoint = map.latLngToContainerPoint(center);
  const rightPoint = centerPoint.add([targetWidthPx, 0]);
  const rightLatLng = map.containerPointToLatLng(rightPoint);
  const targetDistanceM = haversineDistanceMeters(center.lat, center.lng, rightLatLng.lat, rightLatLng.lng);
  return targetDistanceM / targetWidthPx;
};

export const computeScaleRatioFromMetersPerPixel = (
  metersPerPx: number,
  screenDpi = DEFAULT_SCREEN_DPI,
): number | null => {
  if (!Number.isFinite(metersPerPx) || metersPerPx <= 0 || !Number.isFinite(screenDpi) || screenDpi <= 0) {
    return null;
  }

  const denominator = metersPerPx * (screenDpi / METERS_PER_INCH);
  if (!Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }
  return Math.round(denominator);
};

export const formatScaleRatio = (denominator: number): string => {
  if (!Number.isFinite(denominator) || denominator <= 0) {
    return DEFAULT_SCALE_RATIO_LABEL;
  }
  return `1:${Math.round(denominator).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`;
};

export const computeScaleRatioLabelFromMap = (map: L.Map): string => {
  const metersPerPx = computeMetersPerPixelFromMap(map);
  const denominator = computeScaleRatioFromMetersPerPixel(metersPerPx);
  if (!denominator) {
    return DEFAULT_SCALE_RATIO_LABEL;
  }
  return formatScaleRatio(denominator);
};
