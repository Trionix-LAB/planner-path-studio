export type UtmHemisphere = 'north' | 'south';

export type UtmPoint = {
  easting: number;
  northing: number;
  zone: number;
  hemisphere: UtmHemisphere;
};

export type Wgs84Point = {
  lat: number;
  lon: number;
};

const WGS84_A = 6378137;
const WGS84_E = 0.08181919084262149;
const WGS84_E_SQ = WGS84_E * WGS84_E;
const WGS84_E1_SQ = WGS84_E_SQ / (1 - WGS84_E_SQ);
const UTM_K0 = 0.9996;

const toRadians = (deg: number): number => (deg * Math.PI) / 180;
const toDegrees = (rad: number): number => (rad * 180) / Math.PI;

const validateZone = (zone: number): void => {
  if (!Number.isInteger(zone) || zone < 1 || zone > 60) {
    throw new Error('Некорректная UTM зона: ожидается число от 1 до 60.');
  }
};

const validateFinite = (value: number, label: string): void => {
  if (!Number.isFinite(value)) {
    throw new Error(`Некорректная UTM координата: ${label} должно быть числом.`);
  }
};

export const utmToWgs84 = (point: UtmPoint): Wgs84Point => {
  validateZone(point.zone);
  validateFinite(point.easting, 'easting');
  validateFinite(point.northing, 'northing');

  const x = point.easting - 500000;
  const y = point.hemisphere === 'south' ? point.northing - 10000000 : point.northing;

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
    (d -
      ((1 + 2 * t1 + c1) * Math.pow(d, 3)) / 6 +
      ((5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * WGS84_E1_SQ + 24 * t1 * t1) * Math.pow(d, 5)) / 120) /
    cosFp;

  const lonOriginDeg = (point.zone - 1) * 6 - 180 + 3;
  const lon = toRadians(lonOriginDeg) + lonDiff;

  return {
    lat: toDegrees(lat),
    lon: toDegrees(lon),
  };
};

export const wgs84ToUtm = (point: Wgs84Point): UtmPoint => {
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) {
    throw new Error('Некорректные координаты WGS84: ожидаются числа.');
  }
  if (point.lat < -80 || point.lat > 84) {
    throw new Error('Координаты вне диапазона UTM: широта должна быть в пределах -80..84.');
  }
  if (point.lon < -180 || point.lon > 180) {
    throw new Error('Некорректная долгота WGS84: ожидается диапазон -180..180.');
  }

  const zone = Math.max(1, Math.min(60, Math.floor((point.lon + 180) / 6) + 1));
  const hemisphere: UtmHemisphere = point.lat < 0 ? 'south' : 'north';
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

  return {
    easting,
    northing,
    zone,
    hemisphere,
  };
};
