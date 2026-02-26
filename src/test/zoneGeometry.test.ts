import { isConvexZonePolygon, toConvexZonePolygon } from '@/features/mission';

describe('isConvexZonePolygon', () => {
  it('returns true for convex quadrilateral', () => {
    expect(
      isConvexZonePolygon([
        { lat: 59.934, lon: 30.335 },
        { lat: 59.934, lon: 30.336 },
        { lat: 59.935, lon: 30.336 },
        { lat: 59.935, lon: 30.335 },
      ]),
    ).toBe(true);
  });

  it('returns false for concave polygon', () => {
    expect(
      isConvexZonePolygon([
        { lat: 59.934, lon: 30.335 },
        { lat: 59.934, lon: 30.337 },
        { lat: 59.9345, lon: 30.336 },
        { lat: 59.935, lon: 30.337 },
        { lat: 59.935, lon: 30.335 },
      ]),
    ).toBe(false);
  });

  it('returns false for self-intersecting polygon', () => {
    expect(
      isConvexZonePolygon([
        { lat: 59.934, lon: 30.335 },
        { lat: 59.935, lon: 30.336 },
        { lat: 59.934, lon: 30.336 },
        { lat: 59.935, lon: 30.335 },
      ]),
    ).toBe(false);
  });

  it('accepts closed ring input', () => {
    expect(
      isConvexZonePolygon([
        { lat: 59.934, lon: 30.335 },
        { lat: 59.934, lon: 30.336 },
        { lat: 59.935, lon: 30.336 },
        { lat: 59.935, lon: 30.335 },
        { lat: 59.934, lon: 30.335 },
      ]),
    ).toBe(true);
  });
});

describe('toConvexZonePolygon', () => {
  it('returns convex hull for concave points', () => {
    const result = toConvexZonePolygon([
      { lat: 59.934, lon: 30.335 },
      { lat: 59.934, lon: 30.337 },
      { lat: 59.9345, lon: 30.336 },
      { lat: 59.935, lon: 30.337 },
      { lat: 59.935, lon: 30.335 },
    ]);

    expect(result).toHaveLength(4);
    expect(isConvexZonePolygon(result)).toBe(true);
  });

  it('returns convex hull for self-intersecting input order', () => {
    const result = toConvexZonePolygon([
      { lat: 59.934, lon: 30.335 },
      { lat: 59.935, lon: 30.336 },
      { lat: 59.934, lon: 30.336 },
      { lat: 59.935, lon: 30.335 },
    ]);

    expect(result).toHaveLength(4);
    expect(isConvexZonePolygon(result)).toBe(true);
  });
});
