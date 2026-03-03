import { describe, expect, it } from 'vitest';
import { utmToWgs84 } from '@/features/geo/utm';
import { parseDxfToWgs84 } from '@/features/map/dxfOverlay/parseDxf';

const joinDxf = (lines: string[]): string => lines.join('\n');

describe('parseDxfToWgs84', () => {
  it('parses LINE entity and converts UTM points into WGS84', () => {
    const dxf = joinDxf([
      '0',
      'SECTION',
      '2',
      'ENTITIES',
      '0',
      'LINE',
      '10',
      '500000',
      '20',
      '5410000',
      '11',
      '500100',
      '21',
      '5410100',
      '0',
      'ENDSEC',
      '0',
      'EOF',
    ]);

    const result = parseDxfToWgs84(dxf, { zone: 37, hemisphere: 'north' });
    expect(result.features).toHaveLength(1);
    expect(result.features[0]?.type).toBe('polyline');
    if (result.features[0]?.type !== 'polyline') return;

    const expectedA = utmToWgs84({ easting: 500000, northing: 5410000, zone: 37, hemisphere: 'north' });
    const expectedB = utmToWgs84({ easting: 500100, northing: 5410100, zone: 37, hemisphere: 'north' });

    expect(result.features[0].points[0].lat).toBeCloseTo(expectedA.lat, 7);
    expect(result.features[0].points[0].lon).toBeCloseTo(expectedA.lon, 7);
    expect(result.features[0].points[1].lat).toBeCloseTo(expectedB.lat, 7);
    expect(result.features[0].points[1].lon).toBeCloseTo(expectedB.lon, 7);
  });

  it('parses closed LWPOLYLINE and appends closing vertex', () => {
    const dxf = joinDxf([
      '0',
      'SECTION',
      '2',
      'ENTITIES',
      '0',
      'LWPOLYLINE',
      '90',
      '3',
      '70',
      '1',
      '10',
      '500000',
      '20',
      '5410000',
      '10',
      '500100',
      '20',
      '5410000',
      '10',
      '500100',
      '20',
      '5410100',
      '0',
      'ENDSEC',
      '0',
      'EOF',
    ]);

    const result = parseDxfToWgs84(dxf, { zone: 37, hemisphere: 'north' });
    expect(result.features).toHaveLength(1);
    expect(result.features[0]?.type).toBe('polyline');
    if (result.features[0]?.type !== 'polyline') return;
    expect(result.features[0].points).toHaveLength(4);
    expect(result.features[0].points[0]).toEqual(result.features[0].points[3]);
  });

  it('parses legacy POLYLINE + VERTEX sequence', () => {
    const dxf = joinDxf([
      '0',
      'SECTION',
      '2',
      'ENTITIES',
      '0',
      'POLYLINE',
      '70',
      '0',
      '0',
      'VERTEX',
      '10',
      '500000',
      '20',
      '5410000',
      '0',
      'VERTEX',
      '10',
      '500200',
      '20',
      '5410200',
      '0',
      'SEQEND',
      '0',
      'ENDSEC',
      '0',
      'EOF',
    ]);

    const result = parseDxfToWgs84(dxf, { zone: 37, hemisphere: 'north' });
    expect(result.features).toHaveLength(1);
    expect(result.features[0]?.type).toBe('polyline');
  });

  it('rejects binary/DWG-like content', () => {
    expect(() => parseDxfToWgs84('AC1032\u0000BINARY', { zone: 37, hemisphere: 'north' })).toThrow(/DXF/iu);
  });

  it('ignores paper-space entities (layout/frame) and keeps model-space geometry', () => {
    const dxf = joinDxf([
      '0',
      'SECTION',
      '2',
      'ENTITIES',
      '0',
      'LINE',
      '67',
      '1',
      '10',
      '-1500',
      '20',
      '-3500',
      '11',
      '-1200',
      '21',
      '-3500',
      '0',
      'LINE',
      '10',
      '500000',
      '20',
      '5410000',
      '11',
      '500100',
      '21',
      '5410100',
      '0',
      'ENDSEC',
      '0',
      'EOF',
    ]);

    const result = parseDxfToWgs84(dxf, { zone: 37, hemisphere: 'north' });
    expect(result.features).toHaveLength(1);
    expect(result.features[0]?.type).toBe('polyline');
    if (result.features[0]?.type !== 'polyline') return;

    const expectedA = utmToWgs84({ easting: 500000, northing: 5410000, zone: 37, hemisphere: 'north' });
    expect(result.features[0].points[0].lat).toBeCloseTo(expectedA.lat, 7);
    expect(result.features[0].points[0].lon).toBeCloseTo(expectedA.lon, 7);
  });
});
