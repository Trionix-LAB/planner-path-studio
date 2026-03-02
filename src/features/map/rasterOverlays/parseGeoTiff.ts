type Endian = 'LE' | 'BE';

type TiffEntry = {
  tag: number;
  type: number;
  count: number;
  valueOffset: number;
};

const typeSize = (type: number): number => {
  if (type === 1 || type === 2 || type === 6 || type === 7) return 1;
  if (type === 3 || type === 8) return 2;
  if (type === 4 || type === 9 || type === 11) return 4;
  if (type === 5 || type === 10 || type === 12) return 8;
  throw new Error(`Неподдерживаемый TIFF type=${type}`);
};

const readU16 = (view: DataView, offset: number, endian: Endian): number =>
  view.getUint16(offset, endian === 'LE');
const readU32 = (view: DataView, offset: number, endian: Endian): number =>
  view.getUint32(offset, endian === 'LE');

const readValueArray = (view: DataView, entry: TiffEntry, endian: Endian): number[] => {
  const itemSize = typeSize(entry.type);
  const byteSize = itemSize * entry.count;
  const inline = byteSize <= 4;
  const baseOffset = inline ? entry.valueOffset : readU32(view, entry.valueOffset, endian);

  const out: number[] = [];
  for (let i = 0; i < entry.count; i += 1) {
    const o = baseOffset + i * itemSize;
    if (entry.type === 3) out.push(readU16(view, o, endian));
    else if (entry.type === 4) out.push(readU32(view, o, endian));
    else if (entry.type === 12) out.push(view.getFloat64(o, endian === 'LE'));
    else {
      throw new Error(`Неподдерживаемый TIFF type=${entry.type} для чтения значения`);
    }
  }
  return out;
};

const parseIfd = (view: DataView, ifdOffset: number, endian: Endian): TiffEntry[] => {
  const count = readU16(view, ifdOffset, endian);
  const entries: TiffEntry[] = [];
  let cursor = ifdOffset + 2;
  for (let i = 0; i < count; i += 1) {
    entries.push({
      tag: readU16(view, cursor, endian),
      type: readU16(view, cursor + 2, endian),
      count: readU32(view, cursor + 4, endian),
      valueOffset: cursor + 8,
    });
    cursor += 12;
  }
  return entries;
};

const findEntry = (entries: TiffEntry[], tag: number): TiffEntry | undefined => entries.find((e) => e.tag === tag);

const resolveEpsg = (view: DataView, entries: TiffEntry[], endian: Endian): number | null => {
  const geoKeyDirEntry = findEntry(entries, 34735);
  if (!geoKeyDirEntry) return null;
  const keys = readValueArray(view, geoKeyDirEntry, endian);
  if (keys.length < 4) return null;
  const keyCount = keys[3];
  for (let i = 0; i < keyCount; i += 1) {
    const idx = 4 + i * 4;
    const keyId = keys[idx];
    const tiffTagLocation = keys[idx + 1];
    const count = keys[idx + 2];
    const valueOffset = keys[idx + 3];
    if ((keyId === 2048 || keyId === 3072) && count >= 1) {
      if (tiffTagLocation === 0) return valueOffset;
      const refEntry = findEntry(entries, tiffTagLocation);
      if (!refEntry) return null;
      const refValues = readValueArray(view, refEntry, endian);
      return refValues[valueOffset] ?? null;
    }
  }
  return null;
};

const parseTiffStructure = (
  buffer: ArrayBuffer,
): {
  view: DataView;
  endian: Endian;
  entries: TiffEntry[];
  width: number;
  height: number;
} => {
  const view = new DataView(buffer);
  const byteOrderMark = String.fromCharCode(view.getUint8(0)) + String.fromCharCode(view.getUint8(1));
  const endian: Endian = byteOrderMark === 'II' ? 'LE' : byteOrderMark === 'MM' ? 'BE' : (() => {
    throw new Error('Некорректный TIFF заголовок');
  })();

  const magic = readU16(view, 2, endian);
  if (magic !== 42) {
    throw new Error('Неподдерживаемый TIFF формат (magic != 42)');
  }
  const ifdOffset = readU32(view, 4, endian);
  const entries = parseIfd(view, ifdOffset, endian);

  const widthEntry = findEntry(entries, 256);
  const heightEntry = findEntry(entries, 257);
  if (!widthEntry || !heightEntry) throw new Error('В TIFF отсутствуют размеры изображения');
  const width = readValueArray(view, widthEntry, endian)[0];
  const height = readValueArray(view, heightEntry, endian)[0];

  return { view, endian, entries, width, height };
};

export const parseGeoTiffMetadata = (
  buffer: ArrayBuffer,
): {
  width: number;
  height: number;
  bounds: { north: number; south: number; east: number; west: number };
  epsg: number | null;
} => {
  const { view, endian, entries, width, height } = parseTiffStructure(buffer);

  const scaleEntry = findEntry(entries, 33550);
  const tieEntry = findEntry(entries, 33922);
  if (!scaleEntry || !tieEntry) {
    throw new Error('В TIFF отсутствует геопривязка (ModelPixelScale/ModelTiepoint)');
  }

  const scale = readValueArray(view, scaleEntry, endian);
  const tie = readValueArray(view, tieEntry, endian);
  if (scale.length < 2 || tie.length < 6) {
    throw new Error('Некорректные параметры геопривязки TIFF');
  }

  const pixelScaleX = scale[0];
  const pixelScaleY = Math.abs(scale[1]);
  const tieI = tie[0];
  const tieJ = tie[1];
  const tieX = tie[3];
  const tieY = tie[4];

  const originX = tieX - tieI * pixelScaleX;
  const originY = tieY + tieJ * pixelScaleY;
  const west = originX;
  const east = originX + width * pixelScaleX;
  const north = originY;
  const south = originY - height * pixelScaleY;

  return {
    width,
    height,
    bounds: {
      north: Math.max(north, south),
      south: Math.min(north, south),
      east: Math.max(east, west),
      west: Math.min(east, west),
    },
    epsg: resolveEpsg(view, entries, endian),
  };
};

export const parseTiffCoreMetadata = (
  buffer: ArrayBuffer,
): {
  width: number;
  height: number;
  epsg: number | null;
} => {
  const { view, endian, entries, width, height } = parseTiffStructure(buffer);

  return {
    width,
    height,
    epsg: resolveEpsg(view, entries, endian),
  };
};
