import { describe, expect, it } from 'vitest';
import { parseGeoTiffMetadata, parseTiffCoreMetadata } from '@/features/map/rasterOverlays/parseGeoTiff';

const createMinimalTiffWithoutGeoref = (width: number, height: number): ArrayBuffer => {
  const buffer = new ArrayBuffer(8 + 2 + 12 * 2 + 4);
  const view = new DataView(buffer);

  view.setUint8(0, 0x49); // I
  view.setUint8(1, 0x49); // I
  view.setUint16(2, 42, true); // TIFF magic
  view.setUint32(4, 8, true); // first IFD offset

  let offset = 8;
  view.setUint16(offset, 2, true); // entries count
  offset += 2;

  // ImageWidth (tag 256), LONG (4), count 1, value width
  view.setUint16(offset, 256, true);
  view.setUint16(offset + 2, 4, true);
  view.setUint32(offset + 4, 1, true);
  view.setUint32(offset + 8, width, true);
  offset += 12;

  // ImageLength (tag 257), LONG (4), count 1, value height
  view.setUint16(offset, 257, true);
  view.setUint16(offset + 2, 4, true);
  view.setUint32(offset + 4, 1, true);
  view.setUint32(offset + 8, height, true);
  offset += 12;

  // next IFD offset
  view.setUint32(offset, 0, true);

  return buffer;
};

describe('parseGeoTiff / parseTiffCoreMetadata', () => {
  it('reads TIFF dimensions even when georeference is absent', () => {
    const tiff = createMinimalTiffWithoutGeoref(300, 200);
    const core = parseTiffCoreMetadata(tiff);
    expect(core.width).toBe(300);
    expect(core.height).toBe(200);
    expect(core.epsg).toBeNull();
  });

  it('throws georeference error in GeoTIFF mode when tags are absent', () => {
    const tiff = createMinimalTiffWithoutGeoref(300, 200);
    expect(() => parseGeoTiffMetadata(tiff)).toThrow(/геопривязка/i);
  });
});

