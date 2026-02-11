import { describe, expect, it } from 'vitest';
import { parseZimaLine, splitZimaDatagram } from '@/features/devices/zima2r/protocol';

describe('zima protocol parser', () => {
  it('parses AZMLOC telemetry line', () => {
    const line =
      '@AZMLOC,1013.2,10.5,12.3,0.1,-0.2,0,59.937500,30.308600,120.0,0.8,0,130.0,0,0,0,10.5,1.2,0';
    const parsed = parseZimaLine(line);

    expect(parsed.kind).toBe('AZMLOC');
    if (parsed.kind !== 'AZMLOC') return;
    expect(parsed.lat).toBeCloseTo(59.9375);
    expect(parsed.lon).toBeCloseTo(30.3086);
    expect(parsed.course).toBeCloseTo(120);
    expect(parsed.speed).toBeCloseTo(0.8);
    expect(parsed.depth).toBeCloseTo(10.5);
  });

  it('parses AZMREM message', () => {
    const line =
      '@AZMREM,1,120.3,45.2,0.7,24.5,0,5.2,0,120.3,0,30.1,0,80.4,0,20.0,0,9.9,0,14.3,0,59.9301,30.3002,0,100.5,0,msg,0,1,2,3,false';
    const parsed = parseZimaLine(line);

    expect(parsed.kind).toBe('AZMREM');
    if (parsed.kind !== 'AZMREM') return;
    expect(parsed.remoteAddress).toBe(1);
    expect(parsed.lat).toBeCloseTo(59.9301);
    expect(parsed.lon).toBeCloseTo(30.3002);
    expect(parsed.depth).toBeCloseTo(5.2);
    expect(parsed.isTimeout).toBe(false);
  });

  it('splits datagram by CRLF and filters empty lines', () => {
    const lines = splitZimaDatagram('@AZMLOC,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18\r\n\r\n@AZMREM,1\r\n');
    expect(lines.length).toBe(2);
    expect(lines[0].startsWith('@AZMLOC')).toBe(true);
    expect(lines[1].startsWith('@AZMREM')).toBe(true);
  });
});
