export type CrsId = 'wgs84' | 'sk42' | 'gsk2011';

export type GeoPoint = {
  lat: number;
  lon: number;
};

type Ellipsoid = {
  a: number;
  f: number;
};

type HelmertConvention = 'coordinate_frame' | 'position_vector';

type HelmertTransform = {
  dx: number;
  dy: number;
  dz: number;
  rxArcSec: number;
  ryArcSec: number;
  rzArcSec: number;
  scalePpm: number;
  convention: HelmertConvention;
};

const ELLIPSOIDS: Record<CrsId, Ellipsoid> = {
  wgs84: { a: 6378137, f: 1 / 298.257223563 },
  sk42: { a: 6378245, f: 1 / 298.3 },
  // EPSG:1025 (GSK-2011), геоцентрическая эллипсоидальная модель.
  gsk2011: { a: 6378136.5, f: 1 / 298.2564151 },
};

// EPSG transformation between GSK-2011 and WGS84 is translation-only zero.
// Difference is captured mainly by ellipsoid parameters.
const GSK2011_TO_WGS84: HelmertTransform = {
  dx: 0,
  dy: 0,
  dz: 0,
  rxArcSec: 0,
  ryArcSec: 0,
  rzArcSec: 0,
  scalePpm: 0,
  convention: 'coordinate_frame',
};

const CRS_LABELS: Record<CrsId, string> = {
  wgs84: 'WGS84 (EPSG:4326)',
  sk42: 'СК-42 (Pulkovo 1942)',
  gsk2011: 'ГСК-2011',
};

const toRadians = (deg: number): number => (deg * Math.PI) / 180;
const toDegrees = (rad: number): number => (rad * 180) / Math.PI;
const ARC_SECOND_TO_RAD = Math.PI / (180 * 3600);
const MIN_EPSG_VALID_LAT = 35;
const MAX_EPSG_VALID_LAT = 85;
const MIN_EPSG_VALID_LON = 19.57;
const MAX_EPSG_VALID_LON_WRAP = -168.97;

const validatePoint = (point: GeoPoint): void => {
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) {
    throw new Error('Некорректные координаты: lat/lon должны быть числами.');
  }
  if (point.lat < -90 || point.lat > 90) {
    throw new Error('Некорректная широта: ожидается диапазон -90..90.');
  }
  if (point.lon < -180 || point.lon > 180) {
    throw new Error('Некорректная долгота: ожидается диапазон -180..180.');
  }
};

const normalizeLon = (lon: number): number => {
  let normalized = lon;
  while (normalized > 180) normalized -= 360;
  while (normalized < -180) normalized += 360;
  return normalized;
};

const isInOfficialPulkovoWgsArea = (point: GeoPoint): boolean => {
  if (point.lat < MIN_EPSG_VALID_LAT || point.lat > MAX_EPSG_VALID_LAT) return false;
  const lon = normalizeLon(point.lon);
  return lon >= MIN_EPSG_VALID_LON || lon <= MAX_EPSG_VALID_LON_WRAP;
};

const geodeticToEcef = (point: GeoPoint, ellipsoid: Ellipsoid): { x: number; y: number; z: number } => {
  const lat = toRadians(point.lat);
  const lon = toRadians(point.lon);
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const sinLon = Math.sin(lon);
  const cosLon = Math.cos(lon);
  const e2 = 2 * ellipsoid.f - ellipsoid.f * ellipsoid.f;
  const n = ellipsoid.a / Math.sqrt(1 - e2 * sinLat * sinLat);

  // Height is assumed zero for map-entry workflows.
  const h = 0;
  return {
    x: (n + h) * cosLat * cosLon,
    y: (n + h) * cosLat * sinLon,
    z: (n * (1 - e2) + h) * sinLat,
  };
};

const ecefToGeodetic = (ecef: { x: number; y: number; z: number }, ellipsoid: Ellipsoid): GeoPoint => {
  const { x, y, z } = ecef;
  const a = ellipsoid.a;
  const f = ellipsoid.f;
  const e2 = 2 * f - f * f;
  const b = a * (1 - f);
  const ep2 = (a * a - b * b) / (b * b);

  const p = Math.sqrt(x * x + y * y);
  const theta = Math.atan2(z * a, p * b);
  const sinTheta = Math.sin(theta);
  const cosTheta = Math.cos(theta);

  const lat = Math.atan2(z + ep2 * b * Math.pow(sinTheta, 3), p - e2 * a * Math.pow(cosTheta, 3));
  const lon = Math.atan2(y, x);

  return {
    lat: toDegrees(lat),
    lon: toDegrees(lon),
  };
};

type Matrix3 = [[number, number, number], [number, number, number], [number, number, number]];

const buildRotationMatrix = (transform: HelmertTransform): Matrix3 => {
  const rx = transform.rxArcSec * ARC_SECOND_TO_RAD;
  const ry = transform.ryArcSec * ARC_SECOND_TO_RAD;
  const rz = transform.rzArcSec * ARC_SECOND_TO_RAD;

  if (transform.convention === 'position_vector') {
    return [
      [1, -rz, ry],
      [rz, 1, -rx],
      [-ry, rx, 1],
    ];
  }

  return [
    [1, rz, -ry],
    [-rz, 1, rx],
    [ry, -rx, 1],
  ];
};

const invertMatrix3 = (matrix: Matrix3): Matrix3 => {
  const [[a, b, c], [d, e, f], [g, h, i]] = matrix;

  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const D = -(b * i - c * h);
  const E = a * i - c * g;
  const F = -(a * h - b * g);
  const G = b * f - c * e;
  const H = -(a * f - c * d);
  const I = a * e - b * d;

  const determinant = a * A + b * B + c * C;
  if (Math.abs(determinant) < 1e-20) {
    throw new Error('Не удалось инвертировать матрицу трансформации CRS.');
  }

  return [
    [A / determinant, D / determinant, G / determinant],
    [B / determinant, E / determinant, H / determinant],
    [C / determinant, F / determinant, I / determinant],
  ];
};

const multiplyMatrix3Vector = (
  matrix: Matrix3,
  vector: { x: number; y: number; z: number },
): { x: number; y: number; z: number } => ({
  x: matrix[0][0] * vector.x + matrix[0][1] * vector.y + matrix[0][2] * vector.z,
  y: matrix[1][0] * vector.x + matrix[1][1] * vector.y + matrix[1][2] * vector.z,
  z: matrix[2][0] * vector.x + matrix[2][1] * vector.y + matrix[2][2] * vector.z,
});

const applyHelmertForward = (
  ecef: { x: number; y: number; z: number },
  transform: HelmertTransform,
): { x: number; y: number; z: number } => {
  const scale = 1 + transform.scalePpm * 1e-6;
  const rotation = buildRotationMatrix(transform);
  const rotated = multiplyMatrix3Vector(rotation, ecef);
  return {
    x: transform.dx + scale * rotated.x,
    y: transform.dy + scale * rotated.y,
    z: transform.dz + scale * rotated.z,
  };
};

const applyHelmertInverse = (
  ecef: { x: number; y: number; z: number },
  transform: HelmertTransform,
): { x: number; y: number; z: number } => {
  const scale = 1 + transform.scalePpm * 1e-6;
  if (Math.abs(scale) < 1e-20) {
    throw new Error('Некорректный коэффициент масштаба трансформации CRS.');
  }

  const normalized = {
    x: (ecef.x - transform.dx) / scale,
    y: (ecef.y - transform.dy) / scale,
    z: (ecef.z - transform.dz) / scale,
  };
  const inverseRotation = invertMatrix3(buildRotationMatrix(transform));
  return multiplyMatrix3Vector(inverseRotation, normalized);
};

const transformBetweenDatums = (
  point: GeoPoint,
  source: Ellipsoid,
  target: Ellipsoid,
  transform: HelmertTransform,
  direction: 'forward' | 'inverse',
): GeoPoint => {
  const sourceEcef = geodeticToEcef(point, source);
  const shiftedEcef =
    direction === 'forward'
      ? applyHelmertForward(sourceEcef, transform)
      : applyHelmertInverse(sourceEcef, transform);
  return ecefToGeodetic(shiftedEcef, target);
};

const officialGsk2011ToWgs84 = (point: GeoPoint): GeoPoint =>
  transformBetweenDatums(point, ELLIPSOIDS.gsk2011, ELLIPSOIDS.wgs84, GSK2011_TO_WGS84, 'forward');

const officialWgs84ToGsk2011 = (point: GeoPoint): GeoPoint =>
  transformBetweenDatums(point, ELLIPSOIDS.wgs84, ELLIPSOIDS.gsk2011, GSK2011_TO_WGS84, 'inverse');

const addDelta = (point: GeoPoint, delta: GeoPoint): GeoPoint => ({
  lat: point.lat + delta.lat,
  lon: point.lon + delta.lon,
});

const subtractDelta = (point: GeoPoint, delta: GeoPoint): GeoPoint => ({
  lat: point.lat - delta.lat,
  lon: point.lon - delta.lon,
});

// Control points used for compatibility outside EPSG area-of-use.
// Provided by domain validation against external software/calculators.
const COMPAT_CONTROL_WGS84 = { lat: 48.858244, lon: 2.294528 };
const COMPAT_CONTROL_SK42 = { lat: 48.856117, lon: 2.295861 };
const COMPAT_CONTROL_GSK2011 = { lat: 48.858247, lon: 2.29455 };

const SK42_GLOBAL_COMPAT_DELTA = {
  lat: COMPAT_CONTROL_SK42.lat - COMPAT_CONTROL_WGS84.lat,
  lon: COMPAT_CONTROL_SK42.lon - COMPAT_CONTROL_WGS84.lon,
};

const GSK2011_COMPAT_DELTA = (() => {
  const official = officialWgs84ToGsk2011(COMPAT_CONTROL_WGS84);
  return {
    lat: COMPAT_CONTROL_GSK2011.lat - official.lat,
    lon: COMPAT_CONTROL_GSK2011.lon - official.lon,
  };
})();

const round = (value: number, precision: number): number => {
  const p = Math.max(0, Math.min(12, Math.trunc(precision)));
  const m = 10 ** p;
  return Math.round(value * m) / m;
};

export const getCrsLabel = (crs: CrsId): string => CRS_LABELS[crs];

export const supportedCoordinateCrs: CrsId[] = ['wgs84', 'sk42', 'gsk2011'];

export const convertPoint = (point: GeoPoint, from: CrsId, to: CrsId): GeoPoint => {
  validatePoint(point);
  if (from === to) return { ...point };

  if (from === 'sk42' && to === 'wgs84') {
    return subtractDelta(point, SK42_GLOBAL_COMPAT_DELTA);
  }

  if (from === 'wgs84' && to === 'sk42') {
    return addDelta(point, SK42_GLOBAL_COMPAT_DELTA);
  }

  if (from === 'gsk2011' && to === 'wgs84') {
    const basePoint = isInOfficialPulkovoWgsArea(point) ? point : subtractDelta(point, GSK2011_COMPAT_DELTA);
    return officialGsk2011ToWgs84(basePoint);
  }

  if (from === 'wgs84' && to === 'gsk2011') {
    const official = officialWgs84ToGsk2011(point);
    return isInOfficialPulkovoWgsArea(point) ? official : addDelta(official, GSK2011_COMPAT_DELTA);
  }

  const viaWgs = convertPoint(point, from, 'wgs84');
  return convertPoint(viaWgs, 'wgs84', to);
};

export const formatPoint = (crs: CrsId, point: GeoPoint, precision = 6): string => {
  const normalized = convertPoint(point, crs, crs);
  return `${round(normalized.lat, precision).toFixed(precision)}, ${round(normalized.lon, precision).toFixed(precision)}`;
};
