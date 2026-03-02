import type { RasterBounds } from '@/features/map/rasterOverlays/bounds';

const WEB_MERCATOR_MAX = 20037508.342789244;
const EARTH_RADIUS_M = 6378137;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const metersToLongitude = (x: number): number => (x / EARTH_RADIUS_M) * (180 / Math.PI);

const metersToLatitude = (y: number): number => {
  const normalized = clamp(y, -WEB_MERCATOR_MAX, WEB_MERCATOR_MAX) / EARTH_RADIUS_M;
  return (Math.atan(Math.sinh(normalized)) * 180) / Math.PI;
};

export const convertWebMercatorBoundsToEpsg4326 = (bounds: RasterBounds): RasterBounds => {
  if (
    !Number.isFinite(bounds.north) ||
    !Number.isFinite(bounds.south) ||
    !Number.isFinite(bounds.east) ||
    !Number.isFinite(bounds.west)
  ) {
    throw new Error('Некорректные координаты TFW (метры): обнаружены нечисловые значения.');
  }
  if (bounds.north < bounds.south || bounds.east < bounds.west) {
    throw new Error('Некорректные координаты TFW (метры): нарушен порядок границ.');
  }

  const north = metersToLatitude(bounds.north);
  const south = metersToLatitude(bounds.south);
  const east = metersToLongitude(bounds.east);
  const west = metersToLongitude(bounds.west);

  return {
    north: Math.max(north, south),
    south: Math.min(north, south),
    east: Math.max(east, west),
    west: Math.min(east, west),
  };
};

type UtmHemisphere = 'north' | 'south';

const WGS84_A = 6378137;
const WGS84_E = 0.08181919084262149;
const UTM_K0 = 0.9996;
const WGS84_E_SQ = WGS84_E * WGS84_E;
const WGS84_E1_SQ = WGS84_E_SQ / (1 - WGS84_E_SQ);

const utmToLatLon = (
  easting: number,
  northing: number,
  zone: number,
  hemisphere: UtmHemisphere,
): { lat: number; lon: number } => {
  const x = easting - 500000;
  const y = hemisphere === 'south' ? northing - 10000000 : northing;

  const m = y / UTM_K0;
  const mu =
    m /
    (WGS84_A *
      (1 - WGS84_E_SQ / 4 - (3 * WGS84_E_SQ * WGS84_E_SQ) / 64 - (5 * WGS84_E_SQ * WGS84_E_SQ * WGS84_E_SQ) / 256));

  const e1 = (1 - Math.sqrt(1 - WGS84_E_SQ)) / (1 + Math.sqrt(1 - WGS84_E_SQ));
  const j1 = (3 * e1) / 2 - (27 * Math.pow(e1, 3)) / 32;
  const j2 = (21 * e1 * e1) / 16 - (55 * Math.pow(e1, 4)) / 32;
  const j3 = (151 * Math.pow(e1, 3)) / 96;
  const j4 = (1097 * Math.pow(e1, 4)) / 512;

  const fp = mu + j1 * Math.sin(2 * mu) + j2 * Math.sin(4 * mu) + j3 * Math.sin(6 * mu) + j4 * Math.sin(8 * mu);

  const sinFp = Math.sin(fp);
  const cosFp = Math.cos(fp);
  const tanFp = Math.tan(fp);

  const c1 = WGS84_E1_SQ * cosFp * cosFp;
  const t1 = tanFp * tanFp;
  const n1 = WGS84_A / Math.sqrt(1 - WGS84_E_SQ * sinFp * sinFp);
  const r1 = (WGS84_A * (1 - WGS84_E_SQ)) / Math.pow(1 - WGS84_E_SQ * sinFp * sinFp, 1.5);
  const d = x / (n1 * UTM_K0);

  const lat =
    fp -
    ((n1 * tanFp) / r1) *
      (d * d / 2 -
        ((5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * WGS84_E1_SQ) * Math.pow(d, 4)) / 24 +
        ((61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * WGS84_E1_SQ - 3 * c1 * c1) * Math.pow(d, 6)) / 720);

  const lonDiff =
    (d - ((1 + 2 * t1 + c1) * Math.pow(d, 3)) / 6 + ((5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * WGS84_E1_SQ + 24 * t1 * t1) * Math.pow(d, 5)) / 120) /
    cosFp;

  const lonOriginDeg = (zone - 1) * 6 - 180 + 3;
  const lon = (lonOriginDeg * Math.PI) / 180 + lonDiff;

  return {
    lat: (lat * 180) / Math.PI,
    lon: (lon * 180) / Math.PI,
  };
};

export const convertUtmBoundsToEpsg4326 = (
  bounds: RasterBounds,
  zone: number,
  hemisphere: UtmHemisphere,
): RasterBounds => {
  if (!Number.isInteger(zone) || zone < 1 || zone > 60) {
    throw new Error('Некорректная UTM зона: ожидается число от 1 до 60.');
  }
  if (bounds.north < bounds.south || bounds.east < bounds.west) {
    throw new Error('Некорректные координаты TFW (UTM): нарушен порядок границ.');
  }

  const nw = utmToLatLon(bounds.west, bounds.north, zone, hemisphere);
  const ne = utmToLatLon(bounds.east, bounds.north, zone, hemisphere);
  const sw = utmToLatLon(bounds.west, bounds.south, zone, hemisphere);
  const se = utmToLatLon(bounds.east, bounds.south, zone, hemisphere);

  const lats = [nw.lat, ne.lat, sw.lat, se.lat];
  const lons = [nw.lon, ne.lon, sw.lon, se.lon];

  return {
    north: Math.max(...lats),
    south: Math.min(...lats),
    east: Math.max(...lons),
    west: Math.min(...lons),
  };
};
