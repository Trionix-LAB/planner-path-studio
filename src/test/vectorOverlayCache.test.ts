import { describe, expect, it } from 'vitest';
import {
  parseVectorOverlayCache,
  serializeVectorOverlayCache,
  VECTOR_OVERLAY_CACHE_SCHEMA_VERSION,
  type VectorOverlayCacheSourceMeta,
  type VectorOverlayMapData,
} from '@/features/map/vectorOverlays/cache';

const sourceMeta: VectorOverlayCacheSourceMeta = {
  file: 'overlays/overlay-1.dxf',
  type: 'dxf',
  fileEncoding: 'utf8',
  utmZone: 37,
  utmHemisphere: 'N',
};

const data: VectorOverlayMapData = {
  bounds: { north: 59.94, south: 59.93, east: 30.34, west: 30.33 },
  features: [
    {
      type: 'polyline',
      points: [
        { lat: 59.93, lon: 30.33 },
        { lat: 59.94, lon: 30.34 },
      ],
    },
    {
      type: 'point',
      point: { lat: 59.935, lon: 30.335 },
    },
  ],
};

describe('vector overlay cache', () => {
  it('serializes and parses valid cache payload', () => {
    const raw = serializeVectorOverlayCache(sourceMeta, data);
    const parsed = parseVectorOverlayCache(raw, sourceMeta);
    expect(parsed).not.toBeNull();
    expect(parsed).toEqual(data);
  });

  it('rejects cache when source metadata does not match', () => {
    const raw = serializeVectorOverlayCache(sourceMeta, data);
    const parsed = parseVectorOverlayCache(raw, {
      ...sourceMeta,
      utmZone: 38,
    });
    expect(parsed).toBeNull();
  });

  it('rejects cache with unsupported schema version', () => {
    const raw = serializeVectorOverlayCache(sourceMeta, data);
    const doc = JSON.parse(raw) as Record<string, unknown>;
    doc.schema_version = VECTOR_OVERLAY_CACHE_SCHEMA_VERSION + 1;
    const parsed = parseVectorOverlayCache(JSON.stringify(doc), sourceMeta);
    expect(parsed).toBeNull();
  });

  it('rejects cache with invalid feature payload', () => {
    const raw = serializeVectorOverlayCache(sourceMeta, data);
    const doc = JSON.parse(raw) as Record<string, unknown>;
    doc.features = [{ type: 'polyline', points: [{ lat: 59.93 }] }];
    const parsed = parseVectorOverlayCache(JSON.stringify(doc), sourceMeta);
    expect(parsed).toBeNull();
  });
});
