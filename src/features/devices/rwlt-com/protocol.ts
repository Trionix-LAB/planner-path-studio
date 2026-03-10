export type RwltMessageKind =
  | 'GGA'
  | 'RMC'
  | 'PUWV3'
  | 'PRWLA'
  | 'PUWV4'
  | 'PUWV5'
  | 'PUWV6'
  | 'PUNV0'
  | 'UNKNOWN';

export type RwltGgaMessage = {
  kind: 'GGA';
  raw: string;
  lat: number;
  lon: number;
  depthM: number;
  radialErrorM: number | null;
  hasFix: boolean;
};

export type RwltRmcMessage = {
  kind: 'RMC';
  raw: string;
  lat: number;
  lon: number;
  courseDeg: number | null;
  speedMps: number | null;
  hasFix: boolean;
};

export type RwltPuwv3Message = {
  kind: 'PUWV3';
  raw: string;
  targetId: number;
  lat: number;
  lon: number;
  depthM: number;
  courseDeg: number | null;
  radialErrorM: number | null;
  ageSeconds: number | null;
};

export type RwltPrwlaMessage = {
  kind: 'PRWLA';
  raw: string;
  buoyId: number;
  lat: number;
  lon: number;
  antennaDepthM: number;
  batteryV: number | null;
  toaS: number | null;
  msrDb: number | null;
};

export type RwltPuwv4Message = { kind: 'PUWV4'; raw: string };
export type RwltPuwv5Message = {
  kind: 'PUWV5';
  raw: string;
  lat: number;
  lon: number;
  courseDeg: number | null;
  speedKmh: number | null;
};
export type RwltPuwv6Message = { kind: 'PUWV6'; raw: string };
export type RwltPunv0Message = { kind: 'PUNV0'; raw: string };
export type UnknownRwltMessage = { kind: 'UNKNOWN'; raw: string };

export type ParsedRwltMessage =
  | RwltGgaMessage
  | RwltRmcMessage
  | RwltPuwv3Message
  | RwltPrwlaMessage
  | RwltPuwv4Message
  | RwltPuwv5Message
  | RwltPuwv6Message
  | RwltPunv0Message
  | UnknownRwltMessage;

const parseNumber = (value: string | undefined): number | null => {
  if (typeof value !== 'string') return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
};

const parseInteger = (value: string | undefined): number | null => {
  const parsed = parseNumber(value);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
};

const normalizeCourse = (value: number | null): number | null => {
  if (value === null || !Number.isFinite(value)) return null;
  return ((value % 360) + 360) % 360;
};

const isValidLatLon = (lat: number, lon: number): boolean =>
  lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
const KNOT_TO_MPS = 0.514444;

export const parseCoordinate = (
  coordinate: string | undefined,
  hemisphere: string | undefined,
  isLatitude: boolean,
): number | null => {
  if (typeof coordinate !== 'string' || typeof hemisphere !== 'string') return null;
  const value = coordinate.trim();
  const hemi = hemisphere.trim().toUpperCase();
  if (!value) return null;

  const degDigits = isLatitude ? 2 : 3;
  if (value.length < degDigits + 3) return null;
  const degrees = Number(value.slice(0, degDigits));
  const minutes = Number(value.slice(degDigits));
  if (!Number.isFinite(degrees) || !Number.isFinite(minutes)) return null;
  if (minutes < 0 || minutes >= 60) return null;

  let decimal = degrees + minutes / 60;
  if ((isLatitude && hemi === 'S') || (!isLatitude && hemi === 'W')) {
    decimal *= -1;
  } else if ((isLatitude && hemi !== 'N') || (!isLatitude && hemi !== 'E')) {
    return null;
  }

  if (isLatitude && (decimal < -90 || decimal > 90)) return null;
  if (!isLatitude && (decimal < -180 || decimal > 180)) return null;
  if (decimal === 0) return 0;
  return decimal;
};

export const validateNmeaChecksum = (line: string): string | null => {
  const trimmed = line.trim();
  if (!trimmed.startsWith('$')) return null;

  const withoutPrefix = trimmed.slice(1);
  const starIndex = withoutPrefix.lastIndexOf('*');
  if (starIndex < 0) {
    return withoutPrefix;
  }

  const payload = withoutPrefix.slice(0, starIndex);
  const checksumRaw = withoutPrefix.slice(starIndex + 1).trim().toUpperCase();
  if (!/^[0-9A-F]{2}$/.test(checksumRaw)) return null;

  let checksum = 0;
  for (let i = 0; i < payload.length; i += 1) {
    checksum ^= payload.charCodeAt(i);
  }
  const expected = checksum.toString(16).toUpperCase().padStart(2, '0');
  if (expected !== checksumRaw) return null;
  return payload;
};

const parseGga = (raw: string, fields: string[]): ParsedRwltMessage => {
  const lat = parseCoordinate(fields[2], fields[3], true);
  const lon = parseCoordinate(fields[4], fields[5], false);
  if (lat === null || lon === null) return { kind: 'UNKNOWN', raw };

  const fixQuality = parseNumber(fields[6]);
  const hasFix =
    fixQuality !== null &&
    fixQuality > 0 &&
    !(lat === 0 && lon === 0);
  const altitude = parseNumber(fields[9]);
  return {
    kind: 'GGA',
    raw,
    lat,
    lon,
    depthM: altitude !== null && altitude < 0 ? -altitude : 0,
    radialErrorM: parseNumber(fields[8]),
    hasFix,
  };
};

const parseRmc = (raw: string, fields: string[]): ParsedRwltMessage => {
  const lat = parseCoordinate(fields[3], fields[4], true);
  const lon = parseCoordinate(fields[5], fields[6], false);
  if (lat === null || lon === null) return { kind: 'UNKNOWN', raw };

  const status = (fields[2] ?? '').trim().toUpperCase();
  return {
    kind: 'RMC',
    raw,
    lat,
    lon,
    courseDeg: normalizeCourse(parseNumber(fields[8])),
    speedMps: (() => {
      const speedKnots = parseNumber(fields[7]);
      if (speedKnots === null) return null;
      const speedMps = speedKnots * KNOT_TO_MPS;
      return Number.isFinite(speedMps) ? Math.max(0, speedMps) : null;
    })(),
    hasFix: status === 'A' && !(lat === 0 && lon === 0),
  };
};

const parsePuwv3 = (raw: string, fields: string[]): ParsedRwltMessage => {
  const targetId = parseInteger(fields[1]);
  const lat = parseNumber(fields[2]);
  const lon = parseNumber(fields[3]);
  if (targetId === null || targetId < 0 || targetId > 255 || lat === null || lon === null) {
    return { kind: 'UNKNOWN', raw };
  }
  if (!isValidLatLon(lat, lon)) return { kind: 'UNKNOWN', raw };

  return {
    kind: 'PUWV3',
    raw,
    targetId,
    lat,
    lon,
    depthM: parseNumber(fields[4]) ?? 0,
    courseDeg: normalizeCourse(parseNumber(fields[5])),
    radialErrorM: parseNumber(fields[6]),
    ageSeconds: parseNumber(fields[7]),
  };
};

const parsePrwla = (raw: string, fields: string[]): ParsedRwltMessage => {
  const buoyId = parseInteger(fields[1]);
  const lat = parseNumber(fields[2]);
  const lon = parseNumber(fields[3]);
  if (buoyId === null || buoyId < 0 || buoyId > 4 || lat === null || lon === null) {
    return { kind: 'UNKNOWN', raw };
  }
  if (!isValidLatLon(lat, lon) || (lat === 0 && lon === 0)) {
    return { kind: 'UNKNOWN', raw };
  }

  return {
    kind: 'PRWLA',
    raw,
    buoyId,
    lat,
    lon,
    antennaDepthM: parseNumber(fields[4]) ?? 0,
    batteryV: parseNumber(fields[5]),
    toaS: parseNumber(fields[7]),
    msrDb: parseNumber(fields[8]),
  };
};

const parsePuwv5 = (raw: string, fields: string[]): ParsedRwltMessage => {
  const lat = parseNumber(fields[1]);
  const lon = parseNumber(fields[2]);
  if (lat === null || lon === null || !isValidLatLon(lat, lon) || (lat === 0 && lon === 0)) {
    return { kind: 'UNKNOWN', raw };
  }

  return {
    kind: 'PUWV5',
    raw,
    lat,
    lon,
    courseDeg: normalizeCourse(parseNumber(fields[3])),
    speedKmh: parseNumber(fields[4]),
  };
};

export const parseRwltLine = (line: string): ParsedRwltMessage => {
  const raw = line.trim();
  if (!raw) return { kind: 'UNKNOWN', raw: line };

  const payload = validateNmeaChecksum(raw);
  if (!payload) return { kind: 'UNKNOWN', raw };

  const fields = payload.split(',');
  const sentenceId = (fields[0] ?? '').trim().toUpperCase();
  if (!sentenceId) return { kind: 'UNKNOWN', raw };

  if (sentenceId.endsWith('GGA')) {
    return parseGga(raw, fields);
  }
  if (sentenceId.endsWith('RMC')) {
    return parseRmc(raw, fields);
  }
  if (sentenceId === 'PUWV3' || sentenceId === 'PUNV3') {
    return parsePuwv3(raw, fields);
  }
  if (sentenceId === 'PRWLA') {
    return parsePrwla(raw, fields);
  }
  if (sentenceId === 'PUWV4' || sentenceId === 'PUNV4') {
    return { kind: 'PUWV4', raw };
  }
  if (sentenceId === 'PUWV5' || sentenceId === 'PUNV5') {
    return parsePuwv5(raw, fields);
  }
  if (sentenceId === 'PUWV6' || sentenceId === 'PUNV6') {
    return { kind: 'PUWV6', raw };
  }
  if (sentenceId === 'PUNV0') {
    return { kind: 'PUNV0', raw };
  }
  return { kind: 'UNKNOWN', raw };
};

export const splitRwltDatagram = (datagram: string): string[] =>
  datagram
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
