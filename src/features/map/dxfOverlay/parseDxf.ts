import { utmToWgs84, type UtmHemisphere } from '@/features/geo/utm';

type GroupPair = {
  code: number;
  value: string;
};

type ParsedEntity = {
  type: string;
  pairs: GroupPair[];
};

export type DxfOverlayGeometry =
  | {
      type: 'polyline';
      points: Array<{ lat: number; lon: number }>;
    }
  | {
      type: 'point';
      point: { lat: number; lon: number };
    };

export type DxfOverlayFeatureCollection = {
  features: DxfOverlayGeometry[];
};

const toUpper = (value: string): string => value.trim().toUpperCase();

const readPairs = (raw: string): GroupPair[] => {
  if (raw.includes('\u0000')) {
    throw new Error('Файл не является текстовым DXF.');
  }

  const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const pairs: GroupPair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const codeRaw = lines[i].trim();
    if (codeRaw.length === 0) continue;
    const code = Number.parseInt(codeRaw, 10);
    if (!Number.isFinite(code)) continue;
    pairs.push({
      code,
      value: lines[i + 1] ?? '',
    });
  }
  return pairs;
};

const collectEntities = (pairs: GroupPair[]): ParsedEntity[] => {
  const entities: ParsedEntity[] = [];
  let section: string | null = null;
  let waitSectionName = false;
  let current: ParsedEntity | null = null;

  const pushCurrent = () => {
    if (!current) return;
    entities.push(current);
    current = null;
  };

  for (const pair of pairs) {
    const value = toUpper(pair.value);

    if (pair.code === 0 && value === 'SECTION') {
      if (section === 'ENTITIES') {
        pushCurrent();
      }
      waitSectionName = true;
      continue;
    }

    if (waitSectionName && pair.code === 2) {
      section = toUpper(pair.value);
      waitSectionName = false;
      continue;
    }

    if (pair.code === 0 && value === 'ENDSEC') {
      if (section === 'ENTITIES') {
        pushCurrent();
      }
      section = null;
      continue;
    }

    if (section !== 'ENTITIES') {
      continue;
    }

    if (pair.code === 0) {
      pushCurrent();
      current = {
        type: value,
        pairs: [],
      };
      continue;
    }

    if (current) {
      current.pairs.push(pair);
    }
  }

  if (section === 'ENTITIES') {
    pushCurrent();
  }

  return entities;
};

const firstNumber = (pairs: GroupPair[], code: number): number | null => {
  for (const pair of pairs) {
    if (pair.code !== code) continue;
    const num = Number(pair.value.trim().replace(',', '.'));
    if (Number.isFinite(num)) return num;
  }
  return null;
};

const firstInteger = (pairs: GroupPair[], code: number): number | null => {
  for (const pair of pairs) {
    if (pair.code !== code) continue;
    const num = Number.parseInt(pair.value.trim(), 10);
    if (Number.isFinite(num)) return num;
  }
  return null;
};

const allNumbers = (pairs: GroupPair[], code: number): number[] =>
  pairs
    .filter((pair) => pair.code === code)
    .map((pair) => Number(pair.value.trim().replace(',', '.')))
    .filter((value) => Number.isFinite(value));

const toWgsPoint = (x: number, y: number, zone: number, hemisphere: UtmHemisphere): { lat: number; lon: number } =>
  utmToWgs84({ easting: x, northing: y, zone, hemisphere });

const parseLine = (entity: ParsedEntity, zone: number, hemisphere: UtmHemisphere): DxfOverlayGeometry | null => {
  const x1 = firstNumber(entity.pairs, 10);
  const y1 = firstNumber(entity.pairs, 20);
  const x2 = firstNumber(entity.pairs, 11);
  const y2 = firstNumber(entity.pairs, 21);
  if (x1 === null || y1 === null || x2 === null || y2 === null) return null;
  return {
    type: 'polyline',
    points: [toWgsPoint(x1, y1, zone, hemisphere), toWgsPoint(x2, y2, zone, hemisphere)],
  };
};

const parsePointLike = (entity: ParsedEntity, zone: number, hemisphere: UtmHemisphere): DxfOverlayGeometry | null => {
  const x = firstNumber(entity.pairs, 10);
  const y = firstNumber(entity.pairs, 20);
  if (x === null || y === null) return null;
  return {
    type: 'point',
    point: toWgsPoint(x, y, zone, hemisphere),
  };
};

const parseLwPolyline = (entity: ParsedEntity, zone: number, hemisphere: UtmHemisphere): DxfOverlayGeometry | null => {
  const xs = allNumbers(entity.pairs, 10);
  const ys = allNumbers(entity.pairs, 20);
  const count = Math.min(xs.length, ys.length);
  if (count < 2) return null;

  const points: Array<{ lat: number; lon: number }> = [];
  for (let i = 0; i < count; i += 1) {
    points.push(toWgsPoint(xs[i], ys[i], zone, hemisphere));
  }

  const flags = firstNumber(entity.pairs, 70) ?? 0;
  if ((Math.trunc(flags) & 1) === 1 && points.length > 2) {
    points.push(points[0]);
  }

  return { type: 'polyline', points };
};

const parseLegacyPolyline = (
  entities: ParsedEntity[],
  startIndex: number,
  zone: number,
  hemisphere: UtmHemisphere,
): { feature: DxfOverlayGeometry | null; nextIndex: number } => {
  const polylineEntity = entities[startIndex];
  const flags = firstNumber(polylineEntity.pairs, 70) ?? 0;
  const closed = (Math.trunc(flags) & 1) === 1;
  const points: Array<{ lat: number; lon: number }> = [];

  let index = startIndex + 1;
  while (index < entities.length) {
    const entity = entities[index];
    if (entity.type === 'VERTEX') {
      const x = firstNumber(entity.pairs, 10);
      const y = firstNumber(entity.pairs, 20);
      if (x !== null && y !== null) {
        points.push(toWgsPoint(x, y, zone, hemisphere));
      }
      index += 1;
      continue;
    }
    if (entity.type === 'SEQEND') {
      index += 1;
      break;
    }
    break;
  }

  if (closed && points.length > 2) {
    points.push(points[0]);
  }

  return {
    feature: points.length >= 2 ? { type: 'polyline', points } : null,
    nextIndex: index,
  };
};

const skipLegacyPolyline = (entities: ParsedEntity[], startIndex: number): number => {
  let index = startIndex + 1;
  while (index < entities.length) {
    const entity = entities[index];
    if (entity.type === 'VERTEX') {
      index += 1;
      continue;
    }
    if (entity.type === 'SEQEND') {
      index += 1;
      break;
    }
    break;
  }
  return index;
};

const isPaperSpaceEntity = (entity: ParsedEntity): boolean => {
  const paperSpaceFlag = firstInteger(entity.pairs, 67) ?? 0;
  return paperSpaceFlag === 1;
};

export const parseDxfToWgs84 = (
  raw: string,
  options: { zone: number; hemisphere: UtmHemisphere },
): DxfOverlayFeatureCollection => {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new Error('Файл DXF пустой или поврежден.');
  }

  const pairs = readPairs(raw);
  const entities = collectEntities(pairs);
  if (entities.length === 0) {
    throw new Error('В DXF не найден раздел ENTITIES.');
  }

  const features: DxfOverlayGeometry[] = [];

  for (let i = 0; i < entities.length; i += 1) {
    const entity = entities[i];
    if (isPaperSpaceEntity(entity)) {
      if (entity.type === 'POLYLINE') {
        i = skipLegacyPolyline(entities, i) - 1;
      }
      continue;
    }

    if (entity.type === 'LINE') {
      const feature = parseLine(entity, options.zone, options.hemisphere);
      if (feature) features.push(feature);
      continue;
    }

    if (entity.type === 'LWPOLYLINE') {
      const feature = parseLwPolyline(entity, options.zone, options.hemisphere);
      if (feature) features.push(feature);
      continue;
    }

    if (entity.type === 'POLYLINE') {
      const parsed = parseLegacyPolyline(entities, i, options.zone, options.hemisphere);
      if (parsed.feature) features.push(parsed.feature);
      i = parsed.nextIndex - 1;
      continue;
    }

    if (entity.type === 'POINT' || entity.type === 'INSERT') {
      const feature = parsePointLike(entity, options.zone, options.hemisphere);
      if (feature) features.push(feature);
    }
  }

  if (features.length === 0) {
    throw new Error('В DXF не найдена поддерживаемая геометрия (LINE/LWPOLYLINE/POLYLINE/POINT/INSERT).');
  }

  return { features };
};
