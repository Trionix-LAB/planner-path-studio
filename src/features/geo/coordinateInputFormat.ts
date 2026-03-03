export type CoordinateInputFormat = 'dd' | 'dm' | 'dms';
export type CoordinateAxis = 'lat' | 'lon';

export type ParsedCoordinate =
  | { ok: true; value: number }
  | { ok: false; reason: 'invalid' | 'out_of_range' };

const AXIS_LIMITS: Record<CoordinateAxis, number> = {
  lat: 90,
  lon: 180,
};

const INT_DIGITS_BY_AXIS: Record<CoordinateAxis, number> = {
  // Allow one extra digit so out-of-range values are not silently truncated by mask.
  lat: 3,
  lon: 4,
};

const FORMAT_LABELS: Record<CoordinateInputFormat, string> = {
  dd: 'Десятичные градусы',
  dm: 'Градусы и десятичные минуты',
  dms: 'Градусы, минуты и секунды',
};

const FORMAT_MASK_LABELS: Record<CoordinateInputFormat, string> = {
  dd: '±DD.DDDDDD° / ±DDD.DDDDDD°',
  dm: '±DD° MM.MMMM′ / ±DDD° MM.MMMM′',
  dms: '±DD° MM′ SS.SS″ / ±DDD° MM′ SS.SS″',
};

const FORMAT_PLACEHOLDERS: Record<CoordinateInputFormat, Record<CoordinateAxis, string>> = {
  dd: {
    lat: '55.755800°',
    lon: '37.617300°',
  },
  dm: {
    lat: '55° 45.3480′',
    lon: '37° 37.0380′',
  },
  dms: {
    lat: '55° 45′ 20.88″',
    lon: '37° 37′ 02.28″',
  },
};

export const coordinateInputFormats: CoordinateInputFormat[] = ['dd', 'dm', 'dms'];

const normalizeForMask = (raw: string): string =>
  raw
    .replace(/,/g, '.')
    .replace(/\s+/g, ' ')
    .trimStart();

const normalizeCoordinateSymbols = (raw: string): string =>
  raw
    .replace(/[°º˚]/g, ' ')
    .replace(/['’′]/g, ' ')
    .replace(/["”″]/g, ' ');

const sanitizeSignedInteger = (raw: string, maxDigits: number): string => {
  const onlyAllowed = raw.replace(/[^\d-]/g, '');
  const hasMinus = onlyAllowed.startsWith('-');
  const digits = onlyAllowed.replace(/-/g, '').slice(0, maxDigits);
  if (hasMinus) return digits.length > 0 ? `-${digits}` : '-';
  return digits;
};

const sanitizeUnsignedInteger = (raw: string, maxDigits: number): string => raw.replace(/[^\d]/g, '').slice(0, maxDigits);

const sanitizeSignedDecimal = (raw: string, maxIntDigits: number, maxFracDigits: number): string => {
  const normalized = normalizeForMask(raw).replace(/[^0-9.-]/g, '');
  const hasMinus = normalized.startsWith('-');
  const withoutMinus = normalized.replace(/-/g, '');
  const [intPartRaw, ...rest] = withoutMinus.split('.');
  const intPart = intPartRaw.replace(/\D/g, '').slice(0, maxIntDigits);
  const fracPart = rest.join('').replace(/\D/g, '').slice(0, maxFracDigits);

  if (intPart.length === 0 && fracPart.length === 0) {
    return hasMinus ? '-' : '';
  }

  const sign = hasMinus ? '-' : '';
  if (fracPart.length > 0 || normalized.includes('.')) {
    return `${sign}${intPart || '0'}.${fracPart}`;
  }
  return `${sign}${intPart}`;
};

const sanitizeUnsignedDecimal = (raw: string, maxIntDigits: number, maxFracDigits: number): string => {
  const normalized = normalizeForMask(raw).replace(/[^0-9.]/g, '');
  const [intPartRaw, ...rest] = normalized.split('.');
  const intPart = intPartRaw.replace(/\D/g, '').slice(0, maxIntDigits);
  const fracPart = rest.join('').replace(/\D/g, '').slice(0, maxFracDigits);
  if (intPart.length === 0 && fracPart.length === 0) return '';
  if (fracPart.length > 0 || normalized.includes('.')) {
    return `${intPart || '0'}.${fracPart}`;
  }
  return intPart;
};

const parseNumber = (value: string): number | null => {
  const normalized = value.trim().replace(',', '.');
  if (normalized.length === 0) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
};

const clampRoundingOverflow = (
  degrees: number,
  minutes: number,
  seconds: number,
): { degrees: number; minutes: number; seconds: number } => {
  let d = degrees;
  let m = minutes;
  let s = seconds;
  if (s >= 60) {
    s = 0;
    m += 1;
  }
  if (m >= 60) {
    m = 0;
    d += 1;
  }
  return { degrees: d, minutes: m, seconds: s };
};

export const getCoordinateInputFormatLabel = (format: CoordinateInputFormat): string => FORMAT_LABELS[format];

export const getCoordinateInputMaskLabel = (format: CoordinateInputFormat): string => FORMAT_MASK_LABELS[format];

export const getCoordinatePlaceholder = (format: CoordinateInputFormat, axis: CoordinateAxis): string =>
  FORMAT_PLACEHOLDERS[format][axis];

export const sanitizeCoordinateInput = (
  raw: string,
  format: CoordinateInputFormat,
  axis: CoordinateAxis,
): string => {
  const intDigits = INT_DIGITS_BY_AXIS[axis];
  if (format === 'dd') {
    const numeric = sanitizeSignedDecimal(raw, intDigits, 8);
    if (numeric === '' || numeric === '-') return numeric;
    return `${numeric}°`;
  }

  const normalized = normalizeForMask(normalizeCoordinateSymbols(raw)).replace(/[^0-9.\s-]/g, '');
  const parts = normalized.split(' ').filter((part) => part.length > 0);

  if (format === 'dm') {
    const deg = sanitizeSignedInteger(parts[0] ?? '', intDigits);
    const min = sanitizeUnsignedDecimal(parts[1] ?? '', 2, 6);
    if (deg === '' && min === '') return '';
    if (deg === '-') return '-';
    if (deg && min) return `${deg}° ${min}′`;
    if (deg) return `${deg}°`;
    return `${min}′`;
  }

  const deg = sanitizeSignedInteger(parts[0] ?? '', intDigits);
  const min = sanitizeUnsignedInteger(parts[1] ?? '', 2);
  const sec = sanitizeUnsignedDecimal(parts[2] ?? '', 2, 4);
  if (deg === '' && min === '' && sec === '') return '';
  if (deg === '-') return '-';
  if (deg && min && sec) return `${deg}° ${min}′ ${sec}″`;
  if (deg && min) return `${deg}° ${min}′`;
  if (deg) return `${deg}°`;
  if (min && sec) return `${min}′ ${sec}″`;
  if (min) return `${min}′`;
  return `${sec}″`;
};

const isOutOfRange = (value: number, axis: CoordinateAxis): boolean => {
  const limit = AXIS_LIMITS[axis];
  return value < -limit || value > limit;
};

export const parseCoordinateInput = (
  raw: string,
  format: CoordinateInputFormat,
  axis: CoordinateAxis,
): ParsedCoordinate => {
  const limit = AXIS_LIMITS[axis];
  const normalized = normalizeCoordinateSymbols(raw).trim().replace(/\s+/g, ' ').replace(',', '.');
  if (normalized.length === 0) return { ok: false, reason: 'invalid' };

  if (format === 'dd') {
    const value = parseNumber(normalized);
    if (value === null) return { ok: false, reason: 'invalid' };
    if (isOutOfRange(value, axis)) return { ok: false, reason: 'out_of_range' };
    return { ok: true, value };
  }

  if (format === 'dm') {
    const parts = normalized.split(' ');
    if (parts.length !== 2) return { ok: false, reason: 'invalid' };
    const degValue = parseNumber(parts[0]);
    const minValue = parseNumber(parts[1]);
    if (degValue === null || minValue === null || !Number.isInteger(degValue)) return { ok: false, reason: 'invalid' };
    if (minValue < 0 || minValue >= 60) return { ok: false, reason: 'invalid' };

    const sign = degValue < 0 ? -1 : 1;
    const absDeg = Math.abs(degValue);
    if (absDeg > limit) return { ok: false, reason: 'out_of_range' };

    const value = sign * (absDeg + minValue / 60);
    if (isOutOfRange(value, axis)) return { ok: false, reason: 'out_of_range' };
    return { ok: true, value };
  }

  const parts = normalized.split(' ');
  if (parts.length !== 3) return { ok: false, reason: 'invalid' };
  const degValue = parseNumber(parts[0]);
  const minValue = parseNumber(parts[1]);
  const secValue = parseNumber(parts[2]);
  if (
    degValue === null ||
    minValue === null ||
    secValue === null ||
    !Number.isInteger(degValue) ||
    !Number.isInteger(minValue)
  ) {
    return { ok: false, reason: 'invalid' };
  }
  if (minValue < 0 || minValue >= 60 || secValue < 0 || secValue >= 60) {
    return { ok: false, reason: 'invalid' };
  }

  const sign = degValue < 0 ? -1 : 1;
  const absDeg = Math.abs(degValue);
  if (absDeg > limit) return { ok: false, reason: 'out_of_range' };

  const value = sign * (absDeg + minValue / 60 + secValue / 3600);
  if (isOutOfRange(value, axis)) return { ok: false, reason: 'out_of_range' };
  return { ok: true, value };
};

export const formatCoordinateForInput = (
  value: number,
  format: CoordinateInputFormat,
): string => {
  if (!Number.isFinite(value)) return '';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);

  if (format === 'dd') {
    return `${value.toFixed(6)}°`;
  }

  if (format === 'dm') {
    const degrees = Math.floor(abs);
    const minutesRaw = (abs - degrees) * 60;
    const minutes = Number(minutesRaw.toFixed(4));
    const normalized = clampRoundingOverflow(degrees, minutes, 0);
    return `${sign}${normalized.degrees}° ${normalized.minutes.toFixed(4)}′`;
  }

  const degrees = Math.floor(abs);
  const minutesFloat = (abs - degrees) * 60;
  const minutes = Math.floor(minutesFloat);
  const secondsRaw = (minutesFloat - minutes) * 60;
  const seconds = Number(secondsRaw.toFixed(2));
  const normalized = clampRoundingOverflow(degrees, minutes, seconds);
  return `${sign}${normalized.degrees}° ${String(normalized.minutes).padStart(2, '0')}′ ${normalized.seconds.toFixed(2)}″`;
};

export const reformatCoordinateValue = (
  raw: string,
  fromFormat: CoordinateInputFormat,
  toFormat: CoordinateInputFormat,
  axis: CoordinateAxis,
): string => {
  const parsed = parseCoordinateInput(raw, fromFormat, axis);
  if (!parsed.ok) return raw;
  return formatCoordinateForInput(parsed.value, toFormat);
};
