import type { DxfOverlayFeatureCollection } from '@/features/map/dxfOverlay/parseDxf';

export const VECTOR_OVERLAY_CACHE_SCHEMA_VERSION = 1;

export type VectorOverlayBounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

export type VectorOverlayMapData = {
  features: DxfOverlayFeatureCollection['features'];
  bounds: VectorOverlayBounds;
};

export type VectorOverlayCacheSourceMeta = {
  file: string;
  type: 'dxf' | 'dwg';
  fileEncoding: 'utf8' | 'base64';
  utmZone: number;
  utmHemisphere: 'N' | 'S';
};

type VectorOverlayCacheDocument = {
  schema_version: number;
  source_file: string;
  source_type: 'dxf' | 'dwg';
  source_encoding: 'utf8' | 'base64';
  utm_zone: number;
  utm_hemisphere: 'N' | 'S';
  bounds: VectorOverlayBounds;
  features: DxfOverlayFeatureCollection['features'];
};

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const isPoint = (value: unknown): value is { lat: number; lon: number } => {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return isFiniteNumber(candidate.lat) && isFiniteNumber(candidate.lon);
};

const isVectorOverlayBounds = (value: unknown): value is VectorOverlayBounds => {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    isFiniteNumber(candidate.north) &&
    isFiniteNumber(candidate.south) &&
    isFiniteNumber(candidate.east) &&
    isFiniteNumber(candidate.west)
  );
};

const isGeometry = (value: unknown): value is DxfOverlayFeatureCollection['features'][number] => {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.type === 'point') {
    return isPoint(candidate.point);
  }
  if (candidate.type === 'polyline') {
    return Array.isArray(candidate.points) && candidate.points.length >= 2 && candidate.points.every(isPoint);
  }
  return false;
};

const isVectorOverlayCacheDocument = (value: unknown): value is VectorOverlayCacheDocument => {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    isFiniteNumber(candidate.schema_version) &&
    typeof candidate.source_file === 'string' &&
    (candidate.source_type === 'dxf' || candidate.source_type === 'dwg') &&
    (candidate.source_encoding === 'utf8' || candidate.source_encoding === 'base64') &&
    Number.isInteger(candidate.utm_zone) &&
    Number(candidate.utm_zone) >= 1 &&
    Number(candidate.utm_zone) <= 60 &&
    (candidate.utm_hemisphere === 'N' || candidate.utm_hemisphere === 'S') &&
    isVectorOverlayBounds(candidate.bounds) &&
    Array.isArray(candidate.features) &&
    candidate.features.every(isGeometry)
  );
};

const hasMatchingSourceMeta = (doc: VectorOverlayCacheDocument, sourceMeta: VectorOverlayCacheSourceMeta): boolean =>
  doc.source_file === sourceMeta.file &&
  doc.source_type === sourceMeta.type &&
  doc.source_encoding === sourceMeta.fileEncoding &&
  doc.utm_zone === sourceMeta.utmZone &&
  doc.utm_hemisphere === sourceMeta.utmHemisphere;

export const serializeVectorOverlayCache = (
  sourceMeta: VectorOverlayCacheSourceMeta,
  data: VectorOverlayMapData,
): string => {
  const doc: VectorOverlayCacheDocument = {
    schema_version: VECTOR_OVERLAY_CACHE_SCHEMA_VERSION,
    source_file: sourceMeta.file,
    source_type: sourceMeta.type,
    source_encoding: sourceMeta.fileEncoding,
    utm_zone: sourceMeta.utmZone,
    utm_hemisphere: sourceMeta.utmHemisphere,
    bounds: data.bounds,
    features: data.features,
  };
  return JSON.stringify(doc);
};

export const parseVectorOverlayCache = (
  raw: string,
  sourceMeta: VectorOverlayCacheSourceMeta,
): VectorOverlayMapData | null => {
  if (typeof raw !== 'string' || raw.trim().length === 0) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isVectorOverlayCacheDocument(parsed)) return null;
    if (parsed.schema_version !== VECTOR_OVERLAY_CACHE_SCHEMA_VERSION) return null;
    if (!hasMatchingSourceMeta(parsed, sourceMeta)) return null;
    return {
      features: parsed.features,
      bounds: parsed.bounds,
    };
  } catch {
    return null;
  }
};
