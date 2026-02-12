export type ZimaMessageKind = 'AZMLOC' | 'AZMREM' | 'UNKNOWN';

export type AzmLocMessage = {
  kind: 'AZMLOC';
  raw: string;
  lat: number;
  lon: number;
  heading: number;
  speed: number;
  course: number;
  depth: number;
};

export type AzmRemMessage = {
  kind: 'AZMREM';
  raw: string;
  remoteAddress: number | null;
  beaconId: string | null;
  lat: number | null;
  lon: number | null;
  depth: number | null;
  isTimeout: boolean | null;
};

export type UnknownZimaMessage = {
  kind: 'UNKNOWN';
  raw: string;
};

export type ParsedZimaMessage = AzmLocMessage | AzmRemMessage | UnknownZimaMessage;

const splitZimaFields = (line: string): string[] => {
  const parts = line.split(',');
  while (parts.length > 0 && parts[parts.length - 1]?.trim() === '') {
    parts.pop();
  }
  return parts;
};

const stripControlChars = (input: string): string => {
  let output = '';
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    if ((code >= 0 && code <= 31) || code === 127) {
      continue;
    }
    output += input[index];
  }
  return output;
};

const normalizeZimaLine = (line: string): string => {
  const cleaned = stripControlChars(line).trim();
  if (!cleaned) return '';

  const azmLocIndex = cleaned.indexOf('@AZMLOC');
  const azmRemIndex = cleaned.indexOf('@AZMREM');
  let startIndex = -1;

  if (azmLocIndex >= 0 && azmRemIndex >= 0) {
    startIndex = Math.min(azmLocIndex, azmRemIndex);
  } else if (azmLocIndex >= 0) {
    startIndex = azmLocIndex;
  } else if (azmRemIndex >= 0) {
    startIndex = azmRemIndex;
  }

  if (startIndex > 0) {
    return cleaned.slice(startIndex).trim();
  }
  return cleaned;
};

const parseNumber = (value: string | undefined): number | null => {
  if (typeof value !== 'string') return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
};

const parseInteger = (value: string | undefined): number | null => {
  const parsed = parseNumber(value);
  if (parsed === null || !Number.isInteger(parsed)) return null;
  return parsed;
};

const parseRemAddress = (value: string | undefined): number | null => {
  const parsed = parseInteger(value);
  if (parsed === null || parsed < 0 || parsed > 15) return null;
  return parsed;
};

const parseBoolean = (value: string | undefined): boolean | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  return null;
};

const isValidLatLon = (lat: number | null, lon: number | null): lat is number =>
  lat !== null &&
  lon !== null &&
  lat >= -90 &&
  lat <= 90 &&
  lon >= -180 &&
  lon <= 180 &&
  !(lat === 0 && lon === 0);

const parseAzmLoc = (line: string): ParsedZimaMessage => {
  const parts = splitZimaFields(line);
  if (parts.length < 9) return { kind: 'UNKNOWN', raw: line };

  const lat = parseNumber(parts[7]);
  const lon = parseNumber(parts[8]);
  const course = parseNumber(parts[9]);
  const speed = parseNumber(parts[10]);
  const heading = parseNumber(parts[12]);
  const depth = parseNumber(parts[2]);

  if (!isValidLatLon(lat, lon)) {
    return { kind: 'UNKNOWN', raw: line };
  }

  return {
    kind: 'AZMLOC',
    raw: line,
    lat,
    lon: lon as number,
    heading: heading ?? 0,
    speed: speed ?? 0,
    course: course ?? 0,
    depth: depth ?? 0,
  };
};

const parseAzmRem = (line: string): ParsedZimaMessage => {
  const parts = splitZimaFields(line);
  if (parts.length < 24) {
    return { kind: 'UNKNOWN', raw: line };
  }

  const remoteAddress = parseRemAddress(parts[1]);
  if (remoteAddress === null) {
    return { kind: 'UNKNOWN', raw: line };
  }

  const timeoutFieldIndex = parts.length - 1;
  const isTimeout = parseBoolean(parts[timeoutFieldIndex]);
  if (isTimeout === null || timeoutFieldIndex <= 22) {
    return { kind: 'UNKNOWN', raw: line };
  }

  return {
    kind: 'AZMREM',
    raw: line,
    remoteAddress,
    beaconId: String(remoteAddress),
    lat: parseNumber(parts[21]),
    lon: parseNumber(parts[22]),
    depth: parseNumber(parts[7]),
    isTimeout,
  };
};

export const parseZimaLine = (line: string): ParsedZimaMessage => {
  const trimmed = normalizeZimaLine(line);
  if (!trimmed) return { kind: 'UNKNOWN', raw: line };

  if (trimmed.startsWith('@AZMLOC')) {
    return parseAzmLoc(trimmed);
  }
  if (trimmed.startsWith('@AZMREM')) {
    return parseAzmRem(trimmed);
  }
  return { kind: 'UNKNOWN', raw: trimmed };
};

export const splitZimaDatagram = (datagram: string): string[] => {
  return datagram
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
};
