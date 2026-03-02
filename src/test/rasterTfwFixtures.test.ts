import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseTiffCoreMetadata } from '@/features/map/rasterOverlays/parseGeoTiff';
import { convertUtmBoundsToEpsg4326 } from '@/features/map/rasterOverlays/projection';
import { computeBoundsFromTfw, parseTfw } from '@/features/map/rasterOverlays/parseTfw';

const toArrayBuffer = (buffer: Buffer): ArrayBuffer =>
  buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;

describe('tfw fixtures (tools/test_tifs)', () => {
  it('parses test.tif + test.tfw with standard 6-line world file contract', async () => {
    const tifPath = resolve(process.cwd(), 'tools/test_tifs/test.tif');
    const tfwPath = resolve(process.cwd(), 'tools/test_tifs/test.tfw');

    const [tifBytes, tfwText] = await Promise.all([readFile(tifPath), readFile(tfwPath, 'utf8')]);
    const core = parseTiffCoreMetadata(toArrayBuffer(tifBytes));
    const tfw = parseTfw(tfwText);
    const rawBounds = computeBoundsFromTfw(tfw, core.width, core.height);

    expect(core.width).toBe(5469);
    expect(core.height).toBe(2925);
    expect(rawBounds).toEqual({
      north: 6626162.082318116,
      south: 6625869.582318116,
      east: 580597.0418276978,
      west: 580050.1418276977,
    });

    const geographic = convertUtmBoundsToEpsg4326(rawBounds, 37, 'north');
    expect(geographic.north).toBeGreaterThan(59);
    expect(geographic.north).toBeLessThan(60);
    expect(geographic.south).toBeLessThan(geographic.north);
    expect(geographic.east).toBeGreaterThan(40);
    expect(geographic.west).toBeGreaterThan(40);
    expect(geographic.west).toBeLessThan(geographic.east);
  });
});
