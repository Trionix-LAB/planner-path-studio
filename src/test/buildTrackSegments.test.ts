import { buildTrackSegments, type TrackPoint } from '@/features/mission';

describe('buildTrackSegments', () => {
  it('splits segments by segment_id across tracks', () => {
    const pointsByTrackId: Record<string, TrackPoint[]> = {
      'track-1': [
        { timestamp: '2026-02-08T10:00:00.000Z', lat: 59.9, lon: 30.3, segment_id: 1 },
        { timestamp: '2026-02-08T10:00:01.000Z', lat: 59.9001, lon: 30.3001, segment_id: 1 },
        { timestamp: '2026-02-08T10:00:02.000Z', lat: 59.9002, lon: 30.3002, segment_id: 2 },
        { timestamp: '2026-02-08T10:00:03.000Z', lat: 59.9003, lon: 30.3003, segment_id: 2 },
      ],
      'track-2': [
        { timestamp: '2026-02-08T10:01:00.000Z', lat: 59.91, lon: 30.31, segment_id: 1 },
        { timestamp: '2026-02-08T10:01:01.000Z', lat: 59.9101, lon: 30.3101, segment_id: 1 },
      ],
    };

    const segments = buildTrackSegments(pointsByTrackId);
    expect(segments).toHaveLength(3);
    expect(segments[0]).toEqual({
      trackId: 'track-1',
      points: [
        [59.9, 30.3],
        [59.9001, 30.3001],
      ],
    });
    expect(segments[1]).toEqual({
      trackId: 'track-1',
      points: [
        [59.9002, 30.3002],
        [59.9003, 30.3003],
      ],
    });
    expect(segments[2]).toEqual({
      trackId: 'track-2',
      points: [
        [59.91, 30.31],
        [59.9101, 30.3101],
      ],
    });
  });

  it('drops single-point segments', () => {
    const pointsByTrackId: Record<string, TrackPoint[]> = {
      'track-1': [
        { timestamp: '2026-02-08T10:00:00.000Z', lat: 59.9, lon: 30.3, segment_id: 1 },
        { timestamp: '2026-02-08T10:00:01.000Z', lat: 59.9001, lon: 30.3001, segment_id: 2 },
      ],
    };

    const segments = buildTrackSegments(pointsByTrackId);
    expect(segments).toEqual([]);
  });
});
