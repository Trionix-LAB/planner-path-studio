import type { GeoPoint } from '@/features/map/model/types';
import type { LaneFeature } from './types';

export type LaneWaypoint = {
  lat: number;
  lon: number;
  index: number;
};

export type LaneTraversal = {
  orderedLaneIds: string[];
  waypoints: LaneWaypoint[];
};

const EARTH_RADIUS_M = 6378137;
const DEG_TO_RAD = Math.PI / 180;

const distanceMeters = (a: GeoPoint, b: GeoPoint): number => {
  const lat1 = a.lat * DEG_TO_RAD;
  const lat2 = b.lat * DEG_TO_RAD;
  const dLat = (b.lat - a.lat) * DEG_TO_RAD;
  const dLon = (b.lon - a.lon) * DEG_TO_RAD;

  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLon / 2);
  const h = s1 * s1 + Math.cos(lat1) * Math.cos(lat2) * s2 * s2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
  return EARTH_RADIUS_M * c;
};

const toGeoPoint = (coord: [number, number]): GeoPoint => ({ lon: coord[0], lat: coord[1] });

export const buildLaneTraversal = (
  lanes: LaneFeature[],
  startPoint?: GeoPoint | null,
  _bearingDeg?: number,
): LaneTraversal => {
  const ordered = [...lanes]
    .filter((lane) => lane.properties.kind === 'lane')
    .sort((a, b) => a.properties.lane_index - b.properties.lane_index);

  if (ordered.length === 0) {
    return { orderedLaneIds: [], waypoints: [] };
  }

  let traverse = ordered;

  if (startPoint) {
    const first = traverse[0];
    const last = traverse[traverse.length - 1];
    const firstStart = toGeoPoint(first.geometry.coordinates[0]);
    const lastEnd = toGeoPoint(last.geometry.coordinates[last.geometry.coordinates.length - 1]);
    if (distanceMeters(startPoint, lastEnd) < distanceMeters(startPoint, firstStart)) {
      traverse = [...traverse].reverse();
    }
  }

  const waypoints: LaneWaypoint[] = [];
  let index = 1;
  for (const lane of traverse) {
    const coords = lane.geometry.coordinates;
    if (coords.length < 2) continue;
    const start = toGeoPoint(coords[0]);
    const end = toGeoPoint(coords[coords.length - 1]);
    waypoints.push({ lat: start.lat, lon: start.lon, index });
    index += 1;
    waypoints.push({ lat: end.lat, lon: end.lon, index });
    index += 1;
  }

  return {
    orderedLaneIds: traverse.map((lane) => lane.properties.id),
    waypoints,
  };
};

