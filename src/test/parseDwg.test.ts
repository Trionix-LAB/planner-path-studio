import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDwgToWgs84 } from '@/features/map/dwgOverlay/parseDwg';

describe('parseDwgToWgs84', () => {
  it('parses test DWG and returns map features', async () => {
    const fixturePath = (() => {
      const root = process.cwd();
      const legacy = resolve(root, 'tools/test.dwg');
      const current = resolve(root, 'tools/test_vectors/test.dwg');
      try {
        readFileSync(legacy);
        return legacy;
      } catch {
        return current;
      }
    })();
    const fixture = readFileSync(fixturePath);
    const arrayBuffer = fixture.buffer.slice(fixture.byteOffset, fixture.byteOffset + fixture.byteLength);

    const result = await parseDwgToWgs84(arrayBuffer, {
      zone: 37,
      hemisphere: 'north',
    });

    expect(result.features.length).toBeGreaterThan(0);
    const latitudes = result.features.flatMap((feature) =>
      feature.type === 'point' ? [feature.point.lat] : feature.points.map((point) => point.lat),
    );
    expect(Math.min(...latitudes)).toBeGreaterThan(40);
  });

  it('rejects empty DWG payload', async () => {
    await expect(
      parseDwgToWgs84(new ArrayBuffer(0), {
        zone: 37,
        hemisphere: 'north',
      }),
    ).rejects.toThrow(/пустой|поврежден/iu);
  });
});
