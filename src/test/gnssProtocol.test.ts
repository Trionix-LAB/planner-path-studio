import { describe, expect, it } from 'vitest';
import { parseNmeaLine, splitNmeaDatagram } from '@/features/devices/gnss-udp/protocol';

describe('gnss nmea protocol parser', () => {
  it('parses RMC line and converts speed from knots to m/s', () => {
    const parsed = parseNmeaLine('$GPRMC,123519,A,5956.2500,N,03018.5160,E,1.94,84.4,230394,,*1B');
    expect(parsed.kind).toBe('RMC');
    if (parsed.kind !== 'RMC') return;

    expect(parsed.hasFix).toBe(true);
    expect(parsed.lat).toBeCloseTo(59.9375, 5);
    expect(parsed.lon).toBeCloseTo(30.3086, 5);
    expect(parsed.speedMps).toBeCloseTo(0.998, 3);
    expect(parsed.courseDeg).toBeCloseTo(84.4, 3);
  });

  it('parses GGA fix and validates quality', () => {
    const parsed = parseNmeaLine('$GPGGA,123520,5956.2504,N,03018.5168,E,1,08,0.9,12.3,M,0.0,M,,*48');
    expect(parsed.kind).toBe('GGA');
    if (parsed.kind !== 'GGA') return;

    expect(parsed.hasFix).toBe(true);
    expect(parsed.lat).toBeCloseTo(59.937506, 5);
    expect(parsed.lon).toBeCloseTo(30.308613, 5);
  });

  it('parses HDT heading line', () => {
    const parsed = parseNmeaLine('$HEHDT,120.0,T*2C');
    expect(parsed.kind).toBe('HDT');
    if (parsed.kind !== 'HDT') return;
    expect(parsed.headingDeg).toBe(120);
  });

  it('returns UNKNOWN for invalid checksum and splits datagram lines', () => {
    const invalid = parseNmeaLine('$GPRMC,123519,A,5956.2500,N,03018.5160,E,1.94,84.4,230394,,*00');
    expect(invalid.kind).toBe('UNKNOWN');

    const lines = splitNmeaDatagram('$HEHDT,120.0,T*2C\r\n\r\n$HEHDT,121.0,T*2D\r\n');
    expect(lines).toEqual(['$HEHDT,120.0,T*2C', '$HEHDT,121.0,T*2D']);
  });
});
