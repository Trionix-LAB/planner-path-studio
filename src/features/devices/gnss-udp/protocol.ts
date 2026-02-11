export type NmeaSentenceKind = 'RMC' | 'GGA' | 'GNS' | 'HDT' | 'UNKNOWN';

export type NmeaPositionSentence = {
  kind: 'RMC' | 'GGA' | 'GNS';
  raw: string;
  lat: number | null;
  lon: number | null;
  speedMps: number | null;
  courseDeg: number | null;
  hasFix: boolean;
};

export type NmeaHeadingSentence = {
  kind: 'HDT';
  raw: string;
  headingDeg: number | null;
};

export type UnknownNmeaSentence = {
  kind: 'UNKNOWN';
  raw: string;
};

export type ParsedNmeaSentence = NmeaPositionSentence | NmeaHeadingSentence | UnknownNmeaSentence;

const KNOTS_TO_MPS = 0.514444;

const parseNumber = (value: string | undefined): number | null => {
  if (typeof value !== 'string') return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeCourse = (value: number | null): number | null => {
  if (value === null) return null;
  if (!Number.isFinite(value)) return null;
  const normalized = ((value % 360) + 360) % 360;
  return normalized;
};

const parseCoordinate = (
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
  const degPart = value.slice(0, degDigits);
  const minPart = value.slice(degDigits);
  const degrees = Number(degPart);
  const minutes = Number(minPart);
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

const validateChecksum = (sentence: string): string | null => {
  const trimmed = sentence.trim();
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

const parsePosition = (
  raw: string,
  kind: 'RMC' | 'GGA' | 'GNS',
  fields: string[],
): ParsedNmeaSentence => {
  if (kind === 'RMC') {
    const status = (fields[2] ?? '').trim().toUpperCase();
    const lat = parseCoordinate(fields[3], fields[4], true);
    const lon = parseCoordinate(fields[5], fields[6], false);
    const speedKnots = parseNumber(fields[7]);
    const courseDeg = normalizeCourse(parseNumber(fields[8]));
    const hasFix = status === 'A' && lat !== null && lon !== null && !(lat === 0 && lon === 0);
    return {
      kind,
      raw,
      lat,
      lon,
      speedMps: speedKnots === null ? null : speedKnots * KNOTS_TO_MPS,
      courseDeg,
      hasFix,
    };
  }

  if (kind === 'GGA') {
    const lat = parseCoordinate(fields[2], fields[3], true);
    const lon = parseCoordinate(fields[4], fields[5], false);
    const fixQuality = parseNumber(fields[6]);
    const hasFix =
      fixQuality !== null &&
      fixQuality > 0 &&
      lat !== null &&
      lon !== null &&
      !(lat === 0 && lon === 0);
    return {
      kind,
      raw,
      lat,
      lon,
      speedMps: null,
      courseDeg: null,
      hasFix,
    };
  }

  const lat = parseCoordinate(fields[2], fields[3], true);
  const lon = parseCoordinate(fields[4], fields[5], false);
  const mode = (fields[6] ?? '').trim().toUpperCase();
  const hasFix =
    mode.length > 0 &&
    !mode.includes('N') &&
    lat !== null &&
    lon !== null &&
    !(lat === 0 && lon === 0);
  return {
    kind,
    raw,
    lat,
    lon,
    speedMps: null,
    courseDeg: null,
    hasFix,
  };
};

export const parseNmeaLine = (line: string): ParsedNmeaSentence => {
  const payload = validateChecksum(line);
  if (!payload) return { kind: 'UNKNOWN', raw: line };

  const fields = payload.split(',');
  const sentenceId = (fields[0] ?? '').trim().toUpperCase();
  if (sentenceId.length < 3) return { kind: 'UNKNOWN', raw: line };
  const sentenceType = sentenceId.slice(-3);

  if (sentenceType === 'RMC' || sentenceType === 'GGA' || sentenceType === 'GNS') {
    return parsePosition(line.trim(), sentenceType, fields);
  }

  if (sentenceType === 'HDT') {
    return {
      kind: 'HDT',
      raw: line.trim(),
      headingDeg: normalizeCourse(parseNumber(fields[1])),
    };
  }

  return { kind: 'UNKNOWN', raw: line.trim() };
};

export const splitNmeaDatagram = (datagram: string): string[] => {
  return datagram
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
};
