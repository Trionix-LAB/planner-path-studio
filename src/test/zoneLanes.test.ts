import type { MapObject } from '@/features/map/model/types';
import type { LaneFeature } from '@/features/mission';
import {
  cascadeDeleteZone,
  clearZoneLanesOutdated,
  didZoneLaneInputsChange,
  markZoneLanesOutdated,
  replaceZoneLanes,
} from '@/features/mission';

const createZone = (id: string): MapObject => ({
  id,
  type: 'zone',
  name: `Zone ${id}`,
  visible: true,
  laneAngle: 0,
  laneWidth: 5,
  geometry: {
    type: 'zone',
    points: [
      { lat: 59.934, lon: 30.335 },
      { lat: 59.9342, lon: 30.3358 },
      { lat: 59.9346, lon: 30.3351 },
    ],
  },
});

const createRoute = (id: string): MapObject => ({
  id,
  type: 'route',
  name: `Route ${id}`,
  visible: true,
  geometry: {
    type: 'route',
    points: [
      { lat: 59.934, lon: 30.335 },
      { lat: 59.935, lon: 30.336 },
    ],
  },
});

const createLane = (id: string, parentAreaId: string, laneIndex: number): LaneFeature => ({
  type: 'Feature',
  geometry: {
    type: 'LineString',
    coordinates: [
      [30.335, 59.934],
      [30.336, 59.935],
    ],
  },
  properties: {
    id,
    kind: 'lane',
    name: `Lane ${laneIndex}`,
    note: null,
    created_at: '2026-02-08T12:00:00.000Z',
    updated_at: '2026-02-08T12:00:00.000Z',
    parent_area_id: parentAreaId,
    lane_index: laneIndex,
  },
});

describe('zone lanes state helpers', () => {
  it('treats geometry/lane params change as lane invalidation trigger', () => {
    const zone = createZone('zone-1');

    expect(
      didZoneLaneInputsChange(zone, {
        geometry: {
          type: 'zone',
          points: [
            { lat: 59.934, lon: 30.335 },
            { lat: 59.934, lon: 30.336 },
            { lat: 59.935, lon: 30.336 },
          ],
        },
      }),
    ).toBe(true);
    expect(didZoneLaneInputsChange(zone, { laneAngle: 90 })).toBe(true);
    expect(didZoneLaneInputsChange(zone, { laneWidth: 12 })).toBe(true);
    expect(didZoneLaneInputsChange(zone, { name: 'Renamed zone' })).toBe(false);
  });

  it('marks and clears outdated zones', () => {
    const marked = markZoneLanesOutdated({}, 'zone-1');
    expect(marked).toEqual({ 'zone-1': true });

    const cleared = clearZoneLanesOutdated(marked, 'zone-1');
    expect(cleared).toEqual({});
  });

  it('replaces only lanes of the target zone', () => {
    const initial = [
      createLane('lane-a1', 'zone-a', 1),
      createLane('lane-a2', 'zone-a', 2),
      createLane('lane-b1', 'zone-b', 1),
    ];
    const regenerated = [createLane('lane-a3', 'zone-a', 1)];

    const next = replaceZoneLanes(initial, 'zone-a', regenerated);

    expect(next.map((lane) => lane.properties.id)).toEqual(['lane-b1', 'lane-a3']);
  });

  it('deletes zone with all child lanes and clears outdated flag', () => {
    const result = cascadeDeleteZone({
      objects: [createZone('zone-1'), createRoute('route-1')],
      laneFeatures: [
        createLane('lane-z1-1', 'zone-1', 1),
        createLane('lane-z1-2', 'zone-1', 2),
        createLane('lane-z2-1', 'zone-2', 1),
      ],
      outdatedZoneIds: {
        'zone-1': true,
        'zone-2': true,
      },
      zoneId: 'zone-1',
    });

    expect(result.objects.map((obj) => obj.id)).toEqual(['route-1']);
    expect(result.removedLaneCount).toBe(2);
    expect(result.laneFeatures.map((lane) => lane.properties.id)).toEqual(['lane-z2-1']);
    expect(result.outdatedZoneIds).toEqual({ 'zone-2': true });
  });
});
