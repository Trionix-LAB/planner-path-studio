import { describe, expect, it } from 'vitest';
import { filterVisibleTrackSegments, type ColoredTrackSegment } from '@/features/mission';

describe('track visibility filtering (T-101)', () => {
  it('filters out hidden track ids and keeps visible ones', () => {
    const segments: ColoredTrackSegment[] = [
      { trackId: 't1', points: [[1, 2]], color: '#111111' },
      { trackId: 't2', points: [[3, 4]], color: '#222222' },
      { trackId: 't3', points: [[5, 6]], color: '#333333' },
    ];
    const filtered = filterVisibleTrackSegments(segments, ['t2']);
    expect(filtered.map((item) => item.trackId)).toEqual(['t1', 't3']);
  });
});
