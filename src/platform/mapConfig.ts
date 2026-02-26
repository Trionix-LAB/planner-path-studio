export type MapProviderId = 'osm' | 'openmarine';

export type MapConfig = {
  provider: MapProviderId;
  tileLayerUrl: string;
  tileLayerAttribution: string;
  maxNativeZoom: number;
  maxZoom: number;
  tileSubdomains?: string | string[];
  tileSize?: number;
  detectRetina?: boolean;
  overlayTileLayerUrl?: string;
  overlayTileLayerAttribution?: string;
  overlayMaxNativeZoom?: number;
  overlayMaxZoom?: number;
  overlayTileSubdomains?: string | string[];
  overlayTileSize?: number;
  overlayDetectRetina?: boolean;
  zoomSnap: number;
  zoomDelta: number;
  wheelPxPerZoomLevel: number;
};

type EnvSource = Record<string, string | undefined>;

const DEFAULT_ZOOM_SNAP = 1;
const DEFAULT_ZOOM_DELTA = 1;
const DEFAULT_WHEEL_PX_PER_ZOOM_LEVEL = 120;

const OSM_CONFIG: MapConfig = {
  provider: 'osm',
  tileLayerUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  tileLayerAttribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  maxNativeZoom: 19,
  maxZoom: 22,
  tileSubdomains: 'abc',
  tileSize: 256,
  detectRetina: true,
  zoomSnap: DEFAULT_ZOOM_SNAP,
  zoomDelta: DEFAULT_ZOOM_DELTA,
  wheelPxPerZoomLevel: DEFAULT_WHEEL_PX_PER_ZOOM_LEVEL,
};

const normalizeProvider = (value: string | undefined): MapProviderId => {
  if (value?.trim().toLowerCase() === 'openmarine') return 'openmarine';
  return 'osm';
};

const parseFiniteNumber = (
  value: string | undefined,
  fallback: number,
  constraints?: { min?: number; max?: number },
): number => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) return fallback;

  const min = constraints?.min;
  const max = constraints?.max;
  if (typeof min === 'number' && numeric < min) return fallback;
  if (typeof max === 'number' && numeric > max) return fallback;
  return numeric;
};

export const resolveMapConfig = (env: EnvSource): MapConfig => {
  const provider = normalizeProvider(env.VITE_MAP_PROVIDER);
  const zoomSnap = parseFiniteNumber(env.VITE_MAP_ZOOM_SNAP, DEFAULT_ZOOM_SNAP, { min: 0.01, max: 2 });
  const zoomDelta = parseFiniteNumber(env.VITE_MAP_ZOOM_DELTA, DEFAULT_ZOOM_DELTA, { min: 0.01, max: 4 });
  const wheelPxPerZoomLevel = parseFiniteNumber(
    env.VITE_MAP_WHEEL_PX_PER_ZOOM_LEVEL,
    DEFAULT_WHEEL_PX_PER_ZOOM_LEVEL,
    { min: 1, max: 1000 },
  );

  if (provider === 'openmarine') {
    return {
      ...OSM_CONFIG,
      provider: 'openmarine',
      overlayTileLayerUrl: 'https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png',
      overlayTileLayerAttribution:
        '&copy; <a href="https://www.openseamap.org">OpenSeaMap</a> contributors',
      overlayMaxNativeZoom: 18,
      overlayMaxZoom: 22,
      overlayTileSize: 256,
      overlayDetectRetina: false,
      zoomSnap,
      zoomDelta,
      wheelPxPerZoomLevel,
    };
  }

  return {
    ...OSM_CONFIG,
    zoomSnap,
    zoomDelta,
    wheelPxPerZoomLevel,
  };
};
