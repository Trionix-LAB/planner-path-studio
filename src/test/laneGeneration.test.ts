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

  it('supports lane bearing to override auto axis', () => {
    const lanesNorthSouth = generateLanesForZone({
      parentAreaId: 'zone-1',
      points: createRectangleZone(),
      laneAngleDeg: 0,
      laneWidthM: 10,
      laneBearingDeg: 0,
    });
    const lanesEastWest = generateLanesForZone({
      parentAreaId: 'zone-1',
      points: createRectangleZone(),
      laneAngleDeg: 0,
      laneWidthM: 10,
      laneBearingDeg: 90,
    });

    expect(lanesNorthSouth.length).toBeGreaterThan(0);
    expect(lanesEastWest.length).toBeGreaterThan(0);

    expect(isMostlyEastWest(lanesNorthSouth[0].geometry.coordinates)).toBe(false);
    expect(isMostlyEastWest(lanesEastWest[0].geometry.coordinates)).toBe(true);
  });

  it('orders lanes from the start side when start point is provided', () => {
    const southStart = { lat: 59.934, lon: 30.335 };
    const northStart = { lat: 59.9343, lon: 30.3358 };

    const lanesFromSouth = generateLanesForZone({
      parentAreaId: 'zone-1',
      points: createRectangleZone(),
      laneAngleDeg: 0,
      laneWidthM: 10,
      start: southStart,
    });
    const lanesFromNorth = generateLanesForZone({
      parentAreaId: 'zone-1',
      points: createRectangleZone(),
      laneAngleDeg: 0,
      laneWidthM: 10,
      start: northStart,
    });

    expect(lanesFromSouth.length).toBeGreaterThan(0);
    expect(lanesFromNorth.length).toBeGreaterThan(0);

    const southFirst = lanesFromSouth[0].geometry.coordinates;
    const northFirst = lanesFromNorth[0].geometry.coordinates;
    const southFirstLat = (southFirst[0][1] + southFirst[1][1]) / 2;
    const northFirstLat = (northFirst[0][1] + northFirst[1][1]) / 2;
    expect(northFirstLat).toBeGreaterThan(southFirstLat);
  });

  it('generates fewer lanes when lane width grows', () => {
    const narrow = generateLanesForZone({
      parentAreaId: 'zone-1',
      points: createRectangleZone(),
      laneAngleDeg: 0,
      laneWidthM: 5,
    });
    const wide = generateLanesForZone({
      parentAreaId: 'zone-1',
      points: createRectangleZone(),
      laneAngleDeg: 0,
      laneWidthM: 20,
    });

    expect(narrow.length).toBeGreaterThan(0);
    expect(wide.length).toBeGreaterThan(0);
    expect(narrow.length).toBeGreaterThan(wide.length);
  });
});
