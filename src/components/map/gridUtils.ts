import { utmToWgs84, wgs84ToUtm, type UtmHemisphere } from '@/features/geo/utm';

export type GridLine = [[number, number], [number, number]];

export type GridBoundsUtm = {
  zone: number;
  hemisphere: UtmHemisphere;
  minEasting: number;
  maxEasting: number;
  minNorthing: number;
  maxNorthing: number;
};

type Wgs84Point = {
  lat: number;
  lon: number;
};

const WGS84_A = 6378137;
const WGS84_E = 0.08181919084262149;
const WGS84_E_SQ = WGS84_E * WGS84_E;
const WGS84_E1_SQ = WGS84_E_SQ / (1 - WGS84_E_SQ);
const UTM_K0 = 0.9996;

const toRadians = (deg: number): number => (deg * Math.PI) / 180;

const isFiniteNumber = (value: number): boolean => Number.isFinite(value);

const isUtmLatitude = (lat: number): boolean => lat >= -80 && lat <= 84;

const projectToUtmZone = (
  point: Wgs84Point,
  zone: number,
  hemisphere: UtmHemisphere,
): { easting: number; northing: number } => {
  const latRad = toRadians(point.lat);
  const lonRad = toRadians(point.lon);
  const lonOrigin = toRadians((zone - 1) * 6 - 180 + 3);

  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const tanLat = Math.tan(latRad);

  const n = WGS84_A / Math.sqrt(1 - WGS84_E_SQ * sinLat * sinLat);
  const t = tanLat * tanLat;
  const c = WGS84_E1_SQ * cosLat * cosLat;
  const a = cosLat * (lonRad - lonOrigin);

  const m =
    WGS84_A *
    ((1 - WGS84_E_SQ / 4 - (3 * WGS84_E_SQ * WGS84_E_SQ) / 64 - (5 * WGS84_E_SQ * WGS84_E_SQ * WGS84_E_SQ) / 256) * latRad -
      ((3 * WGS84_E_SQ) / 8 + (3 * WGS84_E_SQ * WGS84_E_SQ) / 32 + (45 * WGS84_E_SQ * WGS84_E_SQ * WGS84_E_SQ) / 1024) *
        Math.sin(2 * latRad) +
      ((15 * WGS84_E_SQ * WGS84_E_SQ) / 256 + (45 * WGS84_E_SQ * WGS84_E_SQ * WGS84_E_SQ) / 1024) *
        Math.sin(4 * latRad) -
      ((35 * WGS84_E_SQ * WGS84_E_SQ * WGS84_E_SQ) / 3072) * Math.sin(6 * latRad));

  const easting =
    UTM_K0 *
      n *
      (a + ((1 - t + c) * Math.pow(a, 3)) / 6 + ((5 - 18 * t + t * t + 72 * c - 58 * WGS84_E1_SQ) * Math.pow(a, 5)) / 120) +
    500000;

  let northing =
    UTM_K0 *
    (m +
      n *
        tanLat *
        (a * a / 2 +
          ((5 - t + 9 * c + 4 * c * c) * Math.pow(a, 4)) / 24 +
          ((61 - 58 * t + t * t + 600 * c - 330 * WGS84_E1_SQ) * Math.pow(a, 6)) / 720));

  if (hemisphere === 'south') {
    northing += 10000000;
  }

  return { easting, northing };
};

export const boundsToUtm = (
  centerLat: number,
  centerLon: number,
  corners: Array<{ lat: number; lon: number }>,
): GridBoundsUtm | null => {
  if (!isFiniteNumber(centerLat) || !isFiniteNumber(centerLon) || !isUtmLatitude(centerLat)) {
    return null;
  }
  if (corners.length === 0) {
    return null;
  }

  try {
    const centerUtm = wgs84ToUtm({ lat: centerLat, lon: centerLon });
    const projectedCorners = corners
      .filter((corner) => isFiniteNumber(corner.lat) && isFiniteNumber(corner.lon) && isUtmLatitude(corner.lat))
      .map((corner) => projectToUtmZone(corner, centerUtm.zone, centerUtm.hemisphere));

    if (projectedCorners.length !== corners.length) {
      return null;
    }

    const eastings = projectedCorners.map((point) => point.easting);
    const northings = projectedCorners.map((point) => point.northing);
    const minEasting = Math.min(...eastings);
    const maxEasting = Math.max(...eastings);
    const minNorthing = Math.min(...northings);
    const maxNorthing = Math.max(...northings);

    if (
      !isFiniteNumber(minEasting) ||
      !isFiniteNumber(maxEasting) ||
      !isFiniteNumber(minNorthing) ||
      !isFiniteNumber(maxNorthing) ||
      minEasting >= maxEasting ||
      minNorthing >= maxNorthing
    ) {
      return null;
    }

    return {
      zone: centerUtm.zone,
      hemisphere: centerUtm.hemisphere,
      minEasting,
      maxEasting,
      minNorthing,
      maxNorthing,
    };
  } catch {
    return null;
  }
};

const snapToGrid = (value: number, step: number): number => Math.floor(value / step) * step;

export const buildUtmGridLines = (
  utmBounds: GridBoundsUtm,
  step: number,
  padding = 1,
): GridLine[] => {
  if (!isFiniteNumber(step) || step <= 0) {
    return [];
  }

  const resolvedPadding = isFiniteNumber(padding) ? Math.max(0, Math.floor(padding)) : 1;
  const paddingMeters = resolvedPadding * step;
  const minEasting = utmBounds.minEasting - paddingMeters;
  const maxEasting = utmBounds.maxEasting + paddingMeters;
  const minNorthing = utmBounds.minNorthing - paddingMeters;
  const maxNorthing = utmBounds.maxNorthing + paddingMeters;

  if (
    !isFiniteNumber(minEasting) ||
    !isFiniteNumber(maxEasting) ||
    !isFiniteNumber(minNorthing) ||
    !isFiniteNumber(maxNorthing)
  ) {
    return [];
  }

  const startEasting = snapToGrid(minEasting, step);
  const startNorthing = snapToGrid(minNorthing, step);
  const epsilon = step * 1e-6;
  const lines: GridLine[] = [];

  for (let easting = startEasting; easting <= maxEasting + epsilon; easting += step) {
    try {
      const start = utmToWgs84({
        easting,
        northing: minNorthing,
        zone: utmBounds.zone,
        hemisphere: utmBounds.hemisphere,
      });
      const end = utmToWgs84({
        easting,
        northing: maxNorthing,
        zone: utmBounds.zone,
        hemisphere: utmBounds.hemisphere,
      });
      // Keep visual alignment with map axes while preserving UTM-based spacing.
      const verticalLon = (start.lon + end.lon) / 2;
      lines.push([[start.lat, verticalLon], [end.lat, verticalLon]]);
    } catch {
      // Skip broken lines to keep rendering resilient.
    }
  }

  for (let northing = startNorthing; northing <= maxNorthing + epsilon; northing += step) {
    try {
      const start = utmToWgs84({
        easting: minEasting,
        northing,
        zone: utmBounds.zone,
        hemisphere: utmBounds.hemisphere,
      });
      const end = utmToWgs84({
        easting: maxEasting,
        northing,
        zone: utmBounds.zone,
        hemisphere: utmBounds.hemisphere,
      });
      // Keep visual alignment with map axes while preserving UTM-based spacing.
      const horizontalLat = (start.lat + end.lat) / 2;
      lines.push([[horizontalLat, start.lon], [horizontalLat, end.lon]]);
    } catch {
      // Skip broken lines to keep rendering resilient.
    }
  }

  return lines;
};
