import { describe, expect, it } from 'vitest';
import { parseRwltLine, splitRwltDatagram } from '@/features/devices/rwlt-com/protocol';

const withChecksum = (payload: string): string => {
  let checksum = 0;
  for (let i = 0; i < payload.length; i += 1) {
    checksum ^= payload.charCodeAt(i);
  }
  return `$${payload}*${checksum.toString(16).toUpperCase().padStart(2, '0')}`;
};

describe('rwlt protocol parser', () => {
  it('parses GGA and normalizes depth from negative altitude', () => {
    const parsed = parseRwltLine(withChecksum('GNGGA,120000.000,5954.0000,N,03020.0000,E,1,04,1.5,-15.3,M,,,,'));
    expect(parsed.kind).toBe('GGA');
    if (parsed.kind !== 'GGA') return;
    expect(parsed.hasFix).toBe(true);
    expect(parsed.lat).toBeCloseTo(59.9, 4);
    expect(parsed.lon).toBeCloseTo(30.333333, 4);
    expect(parsed.depthM).toBeCloseTo(15.3, 3);
    expect(parsed.radialErrorM).toBeCloseTo(1.5, 3);
  });

  it('parses GGA without fix and clamps positive altitude to zero depth', () => {
    const noFix = parseRwltLine(withChecksum('GNGGA,120000.000,0000.0000,N,00000.0000,E,0,00,0.0,0.0,M,,,,'));
    expect(noFix.kind).toBe('GGA');
    if (noFix.kind !== 'GGA') return;
    expect(noFix.hasFix).toBe(false);
    expect(noFix.depthM).toBe(0);

    const positiveAlt = parseRwltLine(withChecksum('GNGGA,120000.000,5954.0000,N,03020.0000,E,1,04,1.5,5.0,M,,,,'));
    expect(positiveAlt.kind).toBe('GGA');
    if (positiveAlt.kind !== 'GGA') return;
    expect(positiveAlt.depthM).toBe(0);
  });

  it('parses RMC with valid and void statuses', () => {
    const valid = parseRwltLine(withChecksum('GNRMC,120000.000,A,5954.0000,N,03020.0000,E,3.5,45.0,010101,,,A'));
    expect(valid.kind).toBe('RMC');
    if (valid.kind !== 'RMC') return;
    expect(valid.hasFix).toBe(true);
    expect(valid.courseDeg).toBe(45);
    expect(valid.speedMps).toBeCloseTo(1.800554, 6);

    const voidStatus = parseRwltLine(withChecksum('GNRMC,120000.000,V,5954.0000,N,03020.0000,E,0.0,0.0,010101,,,V'));
    expect(voidStatus.kind).toBe('RMC');
    if (voidStatus.kind !== 'RMC') return;
    expect(voidStatus.hasFix).toBe(false);
    expect(voidStatus.speedMps).toBe(0);
  });

  it('parses PUWV3 and PRWLA payloads', () => {
    const diver = parseRwltLine(withChecksum('PUWV3,1,59.9000,30.3000,12.5,270.0,2.3,5'));
    expect(diver.kind).toBe('PUWV3');
    if (diver.kind !== 'PUWV3') return;
    expect(diver.targetId).toBe(1);
    expect(diver.lat).toBeCloseTo(59.9, 6);
    expect(diver.lon).toBeCloseTo(30.3, 6);
    expect(diver.depthM).toBeCloseTo(12.5, 6);

    const buoy = parseRwltLine(withChecksum('PRWLA,1,59.9000,30.3000,1.5,12.4,0,3.1,25.0'));
    expect(buoy.kind).toBe('PRWLA');
    if (buoy.kind !== 'PRWLA') return;
    expect(buoy.buoyId).toBe(1);
    expect(buoy.batteryV).toBeCloseTo(12.4, 3);
  });

  it('returns UNKNOWN for invalid PRWLA and checksum errors', () => {
    const invalidCoords = parseRwltLine(withChecksum('PRWLA,4,0.0,0.0,0.0,0.0,0,0.0,0.0'));
    expect(invalidCoords.kind).toBe('UNKNOWN');

    const invalidBuoy = parseRwltLine(withChecksum('PRWLA,5,59.9,30.3,1.5,12.4,0,3.1,25.0'));
    expect(invalidBuoy.kind).toBe('UNKNOWN');

    const badChecksum = parseRwltLine('$GNGGA,120000.000,5954.0000,N,03020.0000,E,1,04,1.5,-15.3,M,,,,*00');
    expect(badChecksum.kind).toBe('UNKNOWN');
  });

  it('recognizes non-MVP sentence kinds, parses PUWV5 payload, and splits datagrams', () => {
    expect(parseRwltLine(withChecksum('PUWV4,1,2,3,4,5,6,7')).kind).toBe('PUWV4');
    const base = parseRwltLine(withChecksum('PUWV5,59.9000,30.3000,270.0,7.2'));
    expect(base.kind).toBe('PUWV5');
    if (base.kind !== 'PUWV5') return;
    expect(base.lat).toBeCloseTo(59.9, 6);
    expect(base.lon).toBeCloseTo(30.3, 6);
    expect(base.courseDeg).toBe(270);
    expect(base.speedKmh).toBeCloseTo(7.2, 6);
    expect(parseRwltLine(withChecksum('PUWV6,1,2')).kind).toBe('PUWV6');
    expect(parseRwltLine(withChecksum('PUNV0,1,2,3')).kind).toBe('PUNV0');
    expect(parseRwltLine('')).toEqual({ kind: 'UNKNOWN', raw: '' });
    expect(parseRwltLine('junk')).toEqual({ kind: 'UNKNOWN', raw: 'junk' });

    const lines = splitRwltDatagram(`${withChecksum('PUWV4,1,2,3,4,5,6,7')}\r\n\r\n${withChecksum('PUNV0,1,2,3')}\r\n`);
    expect(lines).toHaveLength(2);
  });
});
