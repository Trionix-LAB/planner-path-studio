import { describe, expect, it } from 'vitest';
import { decimateSegments, epsilonDegFromMetersPerPixel, rdpSimplify } from '@/features/mission/model/trackDecimation';
import type { TrackSegment } from '@/features/mission';

describe('track decimation', () => {
  describe('rdpSimplify', () => {
    it('returns source points when points length is less than or equal to two', () => {
      expect(rdpSimplify([], 0.001)).toEqual([]);
      expect(rdpSimplify([[59.9, 30.3]], 0.001)).toEqual([[59.9, 30.3]]);
      expect(rdpSimplify([[59.9, 30.3], [59.91, 30.31]], 0.001)).toEqual([[59.9, 30.3], [59.91, 30.31]]);
    });

    it('keeps all points when epsilon is zero', () => {
      const points: Array<[number, number]> = [
        [0, 0],
        [0, 0.001],
        [0.001, 0.001],
      ];
      expect(rdpSimplify(points, 0)).toEqual(points);
    });

    it('removes collinear points for sufficient epsilon', () => {
      const line: Array<[number, number]> = [
        [0, 0],
        [0, 0.001],
        [0, 0.002],
        [0, 0.003],
        [0, 0.004],
      ];
      expect(rdpSimplify(line, 0.0001)).toEqual([
        [0, 0],
        [0, 0.004],
      ]);
    });

    it('keeps significant line bend', () => {
      const line: Array<[number, number]> = [
        [0, 0],
        [0, 1],
        [1, 1],
      ];
      expect(rdpSimplify(line, 0.0001)).toEqual(line);
    });

    it('handles very large point arrays without stack overflow', () => {
      const points: Array<[number, number]> = Array.from({ length: 200_000 }, (_, index) => [0, index * 0.000001]);
      expect(() => rdpSimplify(points, 0.0001)).not.toThrow();
    });
  });

  describe('decimateSegments', () => {
    const sourceSegments: TrackSegment[] = [
      {
        trackId: 'track-1',
        points: [
          [0, 0],
          [0, 0.001],
          [0, 0.002],
        ],
      },
      {
        trackId: 'track-2',
        points: [
          [1, 1],
          [1, 1.001],
          [1, 1.002],
        ],
      },
    ];

    it('returns segments unchanged when epsilon is zero', () => {
      expect(decimateSegments(sourceSegments, 0)).toEqual(sourceSegments);
    });

    it('applies simplification to all segments and keeps metadata', () => {
      const result = decimateSegments(sourceSegments, 0.0001);
      expect(result).toHaveLength(2);
      expect(result[0]?.trackId).toBe('track-1');
      expect(result[1]?.trackId).toBe('track-2');
      expect(result[0]?.points).toEqual([
        [0, 0],
        [0, 0.002],
      ]);
      expect(result[1]?.points).toEqual([
        [1, 1],
        [1, 1.002],
      ]);
    });
  });

  describe('epsilonDegFromMetersPerPixel', () => {
    it('returns zero for non-positive metersPerPixel', () => {
      expect(epsilonDegFromMetersPerPixel(0)).toBe(0);
      expect(epsilonDegFromMetersPerPixel(-1)).toBe(0);
    });

    it('converts metersPerPixel to degrees', () => {
      const epsilon = epsilonDegFromMetersPerPixel(3);
      expect(epsilon).toBeCloseTo(3 / 111_320, 8);
    });
  });
});
