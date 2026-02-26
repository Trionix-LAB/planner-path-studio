export const DIVER_MARKER_SIZE_MIN_PX = 1;
export const DIVER_MARKER_SIZE_MAX_PX = 256;
export const DIVER_MARKER_SIZE_DEFAULT_PX = 32;

export const clampDiverMarkerSizePx = (value: unknown, fallback = DIVER_MARKER_SIZE_DEFAULT_PX): number => {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(DIVER_MARKER_SIZE_MIN_PX, Math.min(DIVER_MARKER_SIZE_MAX_PX, Math.trunc(n)));
};
