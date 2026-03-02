import { describe, expect, it } from 'vitest';
import { computeBoundsFromTfw, parseTfw } from '@/features/map/rasterOverlays/parseTfw';

describe('parseTfw', () => {
  it('parses 6-line world file and computes bounds', () => {
    const tfw = parseTfw(['1', '0', '0', '-1', '10.5', '20.5'].join('\n'));
    const bounds = computeBoundsFromTfw(tfw, 4, 3);
    expect(bounds).toEqual({
      north: 21,
      south: 18,
      west: 10,
      east: 14,
    });
  });

  it('rejects rotated tfw in MVP', () => {
    const tfw = parseTfw(['1', '0.1', '0', '-1', '10.5', '20.5'].join('\n'));
    expect(() => computeBoundsFromTfw(tfw, 4, 3)).toThrow(/Поворот/);
  });

  it('rejects tfw with non-standard number of rows', () => {
    expect(() => parseTfw(['1', '0', '0', '-1', '10.5', '20.5', '777'].join('\n'))).toThrow(/ровно 6 строк/i);
  });

  it('rejects tfw with blank row in the middle', () => {
    expect(() => parseTfw(['1', '0', '', '-1', '10.5', '20.5'].join('\n'))).toThrow(/Некорректное значение B|ровно 6 строк/i);
  });
});
