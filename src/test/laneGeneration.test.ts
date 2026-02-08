import { generateLanesForZone } from '@/features/mission';

const createRectangleZone = () => [
  { lat: 59.934, lon: 30.335 },
  { lat: 59.934, lon: 30.3358 },
  { lat: 59.9343, lon: 30.3358 },
  { lat: 59.9343, lon: 30.335 },
];

const isMostlyEastWest = (coordinates: [number, number][]): boolean => {
  const [start, end] = coordinates;
  const lonDelta = Math.abs(end[0] - start[0]);
  const latDelta = Math.abs(end[1] - start[1]);
  return lonDelta > latDelta;
};

describe('lane generation', () => {
  it('generates lane features with parent linkage and sequential indexes', () => {
    const lanes = generateLanesForZone({
      parentAreaId: 'zone-1',
      points: createRectangleZone(),
      laneAngleDeg: 0,
      laneWidthM: 10,
      timestamp: '2026-02-08T12:00:00.000Z',
    });

    expect(lanes.length).toBeGreaterThan(0);
    expect(lanes[0].properties.parent_area_id).toBe('zone-1');
    expect(lanes[0].properties.kind).toBe('lane');
    expect(lanes.map((lane) => lane.properties.lane_index)).toEqual(
      Array.from({ length: lanes.length }, (_, index) => index + 1),
    );
  });

  it('changes lane orientation when angle switches from 0 to 90 degrees', () => {
    const lanes0 = generateLanesForZone({
      parentAreaId: 'zone-1',
      points: createRectangleZone(),
      laneAngleDeg: 0,
      laneWidthM: 10,
    });
    const lanes90 = generateLanesForZone({
      parentAreaId: 'zone-1',
      points: createRectangleZone(),
      laneAngleDeg: 90,
      laneWidthM: 10,
    });

    expect(lanes0.length).toBeGreaterThan(0);
    expect(lanes90.length).toBeGreaterThan(0);

    const lane0IsEastWest = isMostlyEastWest(lanes0[0].geometry.coordinates);
    const lane90IsEastWest = isMostlyEastWest(lanes90[0].geometry.coordinates);
    expect(lane0IsEastWest).not.toBe(lane90IsEastWest);
  });
});
