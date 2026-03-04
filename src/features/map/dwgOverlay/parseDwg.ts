import { Dwg_File_Type, LibreDwg, type LibreDwgEx } from '@mlightcad/libredwg-web';
import { utmToWgs84, type UtmHemisphere } from '@/features/geo/utm';
import type { DxfOverlayFeatureCollection, DxfOverlayGeometry } from '@/features/map/dxfOverlay/parseDxf';

type RawPoint = { x: number; y: number };
type RawEntity = {
  type?: unknown;
  isInPaperSpace?: unknown;
  ownerBlockRecordSoftId?: unknown;
  startPoint?: RawPoint;
  endPoint?: RawPoint;
  vertices?: RawPoint[];
  flag?: unknown;
  position?: RawPoint;
  insertionPoint?: RawPoint;
};

type RawBlockRecordEntry = {
  name?: unknown;
  handle?: unknown;
};

let libredwgPromise: Promise<LibreDwgEx> | null = null;

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const isRawPoint = (value: unknown): value is RawPoint => {
  if (typeof value !== 'object' || value === null) return false;
  const point = value as Record<string, unknown>;
  return isFiniteNumber(point.x) && isFiniteNumber(point.y);
};

const isNodeRuntime = (): boolean => {
  const candidate = (globalThis as { process?: { versions?: { node?: string } } }).process;
  return typeof candidate?.versions?.node === 'string' && candidate.versions.node.length > 0;
};

const getNodeWasmDir = (): string => {
  try {
    // In Node/Electron main process, resolve relative to this module's location
    const mod = (globalThis as unknown as { require?: { resolve?: (id: string) => string } }).require;
    if (mod?.resolve) {
      const resolved = mod.resolve('@mlightcad/libredwg-web');
      const dir = resolved.replace(/\\/g, '/').replace(/\/[^/]+$/, '');
      return `${dir}/wasm`;
    }
  } catch {
    // fallback
  }
  return `${process.cwd().replace(/\\/g, '/')}/node_modules/@mlightcad/libredwg-web/wasm`;
};

const getLibreDwg = async (): Promise<LibreDwgEx> => {
  if (!libredwgPromise) {
    libredwgPromise = (isNodeRuntime() ? LibreDwg.create(getNodeWasmDir()) : LibreDwg.create()).catch((error) => {
      libredwgPromise = null;
      throw error;
    });
  }
  return libredwgPromise;
};

const toWgsPoint = (point: RawPoint, zone: number, hemisphere: UtmHemisphere): { lat: number; lon: number } =>
  utmToWgs84({
    easting: point.x,
    northing: point.y,
    zone,
    hemisphere,
  });

const mapPolylinePoints = (
  source: RawPoint[],
  zone: number,
  hemisphere: UtmHemisphere,
  closed: boolean,
): DxfOverlayGeometry | null => {
  const points = source.filter(isRawPoint).map((item) => toWgsPoint(item, zone, hemisphere));
  if (points.length < 2) return null;
  if (closed && points.length > 2) {
    const first = points[0];
    const last = points[points.length - 1];
    const alreadyClosed = Math.abs(first.lat - last.lat) < 1e-12 && Math.abs(first.lon - last.lon) < 1e-12;
    if (!alreadyClosed) points.push(first);
  }
  return {
    type: 'polyline',
    points,
  };
};

const normalizeHandle = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.toUpperCase() : null;
};

const toModelSpaceOwners = (data: unknown): Set<string> => {
  const owners = new Set<string>();
  if (!data || typeof data !== 'object') return owners;

  const tables = (data as { tables?: unknown }).tables;
  if (!tables || typeof tables !== 'object') return owners;

  const blockRecord = (tables as { BLOCK_RECORD?: unknown }).BLOCK_RECORD;
  if (!blockRecord || typeof blockRecord !== 'object') return owners;

  const entries = (blockRecord as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) return owners;

  for (const entry of entries as RawBlockRecordEntry[]) {
    const name = typeof entry?.name === 'string' ? entry.name.toUpperCase() : '';
    if (!name.includes('MODEL_SPACE')) continue;
    const handle = normalizeHandle(entry?.handle);
    if (handle) owners.add(handle);
  }

  return owners;
};

const parseEntity = (
  entity: RawEntity,
  options: { zone: number; hemisphere: UtmHemisphere },
  modelSpaceOwners: Set<string>,
): DxfOverlayGeometry | null => {
  if (entity.isInPaperSpace === true || entity.isInPaperSpace === 1) {
    return null;
  }
  if (modelSpaceOwners.size > 0) {
    const owner = normalizeHandle(entity.ownerBlockRecordSoftId);
    if (owner && !modelSpaceOwners.has(owner)) {
      return null;
    }
  }

  const type = typeof entity.type === 'string' ? entity.type : '';
  if (type === 'LINE') {
    if (!isRawPoint(entity.startPoint) || !isRawPoint(entity.endPoint)) return null;
    return {
      type: 'polyline',
      points: [toWgsPoint(entity.startPoint, options.zone, options.hemisphere), toWgsPoint(entity.endPoint, options.zone, options.hemisphere)],
    };
  }

  if (type === 'LWPOLYLINE' || type === 'POLYLINE2D' || type === 'POLYLINE3D') {
    const vertices = Array.isArray(entity.vertices) ? entity.vertices : [];
    const flag = Number.isInteger(entity.flag) ? Number(entity.flag) : 0;
    return mapPolylinePoints(vertices, options.zone, options.hemisphere, (flag & 1) === 1);
  }

  if (type === 'POINT' && isRawPoint(entity.position)) {
    return {
      type: 'point',
      point: toWgsPoint(entity.position, options.zone, options.hemisphere),
    };
  }

  if (type === 'INSERT' && isRawPoint(entity.insertionPoint)) {
    return {
      type: 'point',
      point: toWgsPoint(entity.insertionPoint, options.zone, options.hemisphere),
    };
  }

  return null;
};

const toRawEntities = (data: unknown): RawEntity[] => {
  if (!data || typeof data !== 'object') return [];
  const entities = (data as { entities?: unknown }).entities;
  return Array.isArray(entities) ? (entities as RawEntity[]) : [];
};

export const parseDwgToWgs84 = async (
  input: ArrayBuffer | SharedArrayBuffer | Uint8Array,
  options: { zone: number; hemisphere: UtmHemisphere },
): Promise<DxfOverlayFeatureCollection> => {
  const normalizedInput = (() => {
    if (ArrayBuffer.isView(input)) {
      const view = input as ArrayBufferView;
      return new Uint8Array(view.buffer, view.byteOffset, view.byteLength).slice().buffer;
    }
    if (input && typeof input === 'object' && typeof (input as { byteLength?: unknown }).byteLength === 'number') {
      try {
        return new Uint8Array(input as ArrayBufferLike).slice().buffer;
      } catch {
        return null;
      }
    }
    return null;
  })();

  if (!normalizedInput || normalizedInput.byteLength === 0) {
    throw new Error('Файл DWG пустой или поврежден.');
  }

  const libredwg = await getLibreDwg().catch((error) => {
    const message = error instanceof Error ? error.message : 'Не удалось инициализировать DWG-парсер.';
    throw new Error(`Не удалось инициализировать DWG-парсер: ${message}`);
  });

  let dataPtr: number | undefined;
  try {
    dataPtr = libredwg.dwg_read_data(normalizedInput, Dwg_File_Type.DWG);
    if (!Number.isInteger(dataPtr) || Number(dataPtr) <= 0) {
      throw new Error('DWG-парсер не вернул данные модели.');
    }

    const database = libredwg.convert(dataPtr);
    const modelSpaceOwners = toModelSpaceOwners(database);
    const features = toRawEntities(database)
      .map((entity) => parseEntity(entity, options, modelSpaceOwners))
      .filter((entity): entity is DxfOverlayGeometry => entity !== null);

    if (features.length === 0) {
      throw new Error('В DWG не найдена поддерживаемая геометрия (LINE/LWPOLYLINE/POLYLINE/POINT/INSERT).');
    }

    return { features };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось обработать DWG.';
    throw new Error(`Не удалось обработать DWG: ${message}`);
  } finally {
    if (typeof dataPtr === 'number' && Number.isFinite(dataPtr) && dataPtr > 0) {
      try {
        libredwg.dwg_free(dataPtr);
      } catch {
        // no-op
      }
    }
  }
};
