import { describe, expect, it } from 'vitest';
import { parseZimaLine, splitZimaDatagram } from '@/features/devices/zima2r/protocol';

describe('zima protocol parser', () => {
  it('parses AZMLOC telemetry line', () => {
    const line =
      '@AZMLOC,981.5,-0.3,20.2,-60.8,-42.7,0.0,48.123456,44.123456,,,,0.0,0.9,';
    const parsed = parseZimaLine(line);

    expect(parsed.kind).toBe('AZMLOC');
    if (parsed.kind !== 'AZMLOC') return;
    expect(parsed.lat).toBeCloseTo(48.123456);
    expect(parsed.lon).toBeCloseTo(44.123456);
    expect(parsed.course).toBe(0);
    expect(parsed.speed).toBe(0);
    expect(parsed.heading).toBeCloseTo(0);
    expect(parsed.depth).toBeCloseTo(-0.3);
  });

  it('parses AZMREM message', () => {
    const line =
      '@AZMREM,0,0.5,3.0,0.0004,21.5,0.0,0.0,0.0,0.5,0.0,0.5,0.0,3.0,0.0,-3.0,0.0,,,,,48.123460,44.123456,0.0,183.0,0.0,,,False,';
    const parsed = parseZimaLine(line);

    expect(parsed.kind).toBe('AZMREM');
    if (parsed.kind !== 'AZMREM') return;
    expect(parsed.remoteAddress).toBe(0);
    expect(parsed.beaconId).toBe('0');
    expect(parsed.lat).toBeCloseTo(48.12346);
    expect(parsed.lon).toBeCloseTo(44.123456);
    expect(parsed.depth).toBeCloseTo(0);
    expect(parsed.isTimeout).toBe(false);
  });

  it('parses AZMREM message without Z_m field in tail', () => {
    const line =
      '@AZMREM,3,120.3,45.2,0.7,24.5,0,5.2,0,120.3,0,30.1,0,80.4,0,20.0,0,9.9,0,14.3,0,59.9301,30.3002,0,100.5,0,msg,0,1,2,false';
    const parsed = parseZimaLine(line);

    expect(parsed.kind).toBe('AZMREM');
    if (parsed.kind !== 'AZMREM') return;
    expect(parsed.remoteAddress).toBe(3);
    expect(parsed.beaconId).toBe('3');
    expect(parsed.lat).toBeCloseTo(59.9301);
    expect(parsed.lon).toBeCloseTo(30.3002);
    expect(parsed.isTimeout).toBe(false);
  });

  it('returns UNKNOWN for incomplete AZMREM without timeout marker', () => {
    const line =
      '@AZMREM,1,120.3,45.2,0.7,24.5,0,5.2,0,120.3,0,30.1,0,80.4,0,20.0,0,9.9,0,14.3,0,59.9301,30.3002,0,100.5,0,msg,0,1,2';
    const parsed = parseZimaLine(line);
    expect(parsed.kind).toBe('UNKNOWN');
  });

  it('splits datagram by CRLF and filters empty lines', () => {
    const lines = splitZimaDatagram('@AZMLOC,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18\r\n\r\n@AZMREM,1\r\n');
    expect(lines.length).toBe(2);
    expect(lines[0].startsWith('@AZMLOC')).toBe(true);
    expect(lines[1].startsWith('@AZMREM')).toBe(true);
  });
});
