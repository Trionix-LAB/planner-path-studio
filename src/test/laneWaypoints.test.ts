import type { LaneFeature } from '@/features/mission';
import { buildLaneTraversal } from '@/features/mission';

const lane = (id: string, laneIndex: number, coords: [number, number][], parent = 'zone-1'): LaneFeature => ({
  type: 'Feature',
  geometry: {
    type: 'LineString',
    coordinates: coords,
  },
  properties: {
    id,
    kind: 'lane',
    name: `Lane ${laneIndex}`,
    note: null,
    created_at: '2026-02-08T12:00:00.000Z',
    updated_at: '2026-02-08T12:00:00.000Z',
    parent_area_id: parent,
    lane_index: laneIndex,
  },
});

describe('lane waypoints', () => {
  it('returns 2N numbered waypoints in lane_index order', () => {
    const lanes: LaneFeature[] = [
      lane('l1', 1, [
        [30.0, 60.0],
        [30.1, 60.0],
      ]),
      lane('l2', 2, [
        [30.1, 60.01],
        [30.0, 60.01],
      ]),
      lane('l3', 3, [
        [30.0, 60.02],
        [30.1, 60.02],
      ]),
    ];

    const traversal = buildLaneTraversal(lanes, null, 90);
    expect(traversal.orderedLaneIds).toEqual(['l1', 'l2', 'l3']);
    expect(traversal.waypoints).toHaveLength(6);
    expect(traversal.waypoints.map((w) => w.index)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('can reverse traversal when start is closer to the end', () => {
    const lanes: LaneFeature[] = [
      lane('l1', 1, [
        [30.0, 60.0],
        [30.1, 60.0],
      ]),
      lane('l2', 2, [
        [30.0, 60.01],
        [30.1, 60.01],
      ]),
    ];

    const startNearEnd = { lat: 60.01, lon: 30.1 };
    const traversal = buildLaneTraversal(lanes, startNearEnd, 90);
    expect(traversal.orderedLaneIds).toEqual(['l2', 'l1']);
  });
});

