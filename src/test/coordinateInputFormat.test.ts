import { describe, expect, it } from 'vitest';
import {
  formatCoordinateForInput,
  parseCoordinateInput,
  reformatCoordinateValue,
  sanitizeCoordinateInput,
} from '@/features/geo/coordinateInputFormat';

describe('coordinate input format', () => {
  it('parses decimal degrees (dd)', () => {
    const parsed = parseCoordinateInput('48.858244°', 'dd', 'lat');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).toBeCloseTo(48.858244, 6);
  });

  it('parses degrees + decimal minutes (dm)', () => {
    const parsed = parseCoordinateInput('48° 51.4946′', 'dm', 'lat');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).toBeCloseTo(48.8582433333, 6);
  });

  it('parses degrees + minutes + seconds (dms)', () => {
    const parsed = parseCoordinateInput('48° 51′ 29.68″', 'dms', 'lat');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).toBeCloseTo(48.8582444444, 6);
  });

  it('returns out_of_range for invalid axis range', () => {
    const parsed = parseCoordinateInput('91° 00′ 00″', 'dms', 'lat');
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect('reason' in parsed ? parsed.reason : null).toBe('out_of_range');
  });

  it('sanitizes dm and dms masks', () => {
    expect(sanitizeCoordinateInput(' 4a8,, 51..49x46', 'dm', 'lat')).toBe('48° 51.4946′');
    expect(sanitizeCoordinateInput('4a8 5b1 2c9..68', 'dms', 'lat')).toBe('48° 51′ 29.68″');
  });

  it('reformats values between formats', () => {
    const dd = formatCoordinateForInput(48.858244, 'dd');
    const dm = reformatCoordinateValue(dd, 'dd', 'dm', 'lat');
    const dms = reformatCoordinateValue(dd, 'dd', 'dms', 'lat');

    expect(dd).toBe('48.858244°');
    expect(dm).toBe('48° 51.4946′');
    expect(dms).toBe('48° 51′ 29.68″');
  });

  it('parses coordinates.md representations consistently across DD/DM/DMS', () => {
    const parseOk = (raw: string, format: 'dd' | 'dm' | 'dms', axis: 'lat' | 'lon') => {
      const parsed = parseCoordinateInput(raw, format, axis);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return 0;
      return parsed.value;
    };

    const eiffelLatDd = parseOk('48.858244°', 'dd', 'lat');
    const eiffelLatDm = parseOk("48° 51.4946'", 'dm', 'lat');
    const eiffelLatDms = parseOk("48° 51' 29.68\"", 'dms', 'lat');
    expect(eiffelLatDm).toBeCloseTo(eiffelLatDd, 4);
    expect(eiffelLatDms).toBeCloseTo(eiffelLatDd, 4);

    const libertyLonDd = parseOk('-74.044444°', 'dd', 'lon');
    const libertyLonDm = parseOk("-74° 2.6667'", 'dm', 'lon');
    const libertyLonDms = parseOk("-74° 2' 40.00\"", 'dms', 'lon');
    expect(libertyLonDm).toBeCloseTo(libertyLonDd, 4);
    expect(libertyLonDms).toBeCloseTo(libertyLonDd, 4);
  });
});
