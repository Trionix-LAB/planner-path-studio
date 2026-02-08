import type { GeoPoint } from '@/features/map/model/types';
import type { LaneFeature } from './types';

type PointXY = {
  x: number;
  y: number;
};

type ZoneLaneGenerationInput = {
  parentAreaId: string;
  points: GeoPoint[];
  laneAngleDeg: 0 | 90;
  laneWidthM: number;
  timestamp?: string;
};

const EARTH_RADIUS_M = 6378137;
const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;
const EPS = 1e-9;

const createId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const dot = (a: PointXY, b: PointXY): number => a.x * b.x + a.y * b.y;

const toClosedRing = (points: GeoPoint[]): GeoPoint[] => {
  if (points.length < 3) return [];
  const first = points[0];
  const last = points[points.length - 1];
  const isClosed = Math.abs(first.lat - last.lat) < EPS && Math.abs(first.lon - last.lon) < EPS;
  if (isClosed) return [...points];
  return [...points, first];
};

const computeCenter = (points: GeoPoint[]): { lat0: number; lon0: number } => {
  const count = points.length;
  const sum = points.reduce(
    (acc, point) => ({ lat: acc.lat + point.lat, lon: acc.lon + point.lon }),
    { lat: 0, lon: 0 },
  );
  return {
    lat0: sum.lat / count,
    lon0: sum.lon / count,
  };
};

const projectPoint = (point: GeoPoint, lat0: number, lon0: number): PointXY => {
  const lat0Rad = lat0 * DEG_TO_RAD;
  const cosLat0 = Math.max(Math.cos(lat0Rad), 1e-6);
  const x = (point.lon - lon0) * DEG_TO_RAD * EARTH_RADIUS_M * cosLat0;
  const y = (point.lat - lat0) * DEG_TO_RAD * EARTH_RADIUS_M;
  return { x, y };
};

const unprojectPoint = (point: PointXY, lat0: number, lon0: number): [number, number] => {
  const lat0Rad = lat0 * DEG_TO_RAD;
  const cosLat0 = Math.max(Math.cos(lat0Rad), 1e-6);
  const lat = lat0 + (point.y / EARTH_RADIUS_M) * RAD_TO_DEG;
  const lon = lon0 + (point.x / (EARTH_RADIUS_M * cosLat0)) * RAD_TO_DEG;
  return [lon, lat];
};

const principalDirection = (points: PointXY[]): PointXY => {
  if (points.length < 2) return { x: 1, y: 0 };

  let meanX = 0;
  let meanY = 0;
  for (const point of points) {
    meanX += point.x;
    meanY += point.y;
  }
  meanX /= points.length;
  meanY /= points.length;

  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const point of points) {
    const dx = point.x - meanX;
    const dy = point.y - meanY;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }

  if (Math.abs(sxx) < EPS && Math.abs(syy) < EPS && Math.abs(sxy) < EPS) {
    return { x: 1, y: 0 };
  }

  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const x = Math.cos(theta);
  const y = Math.sin(theta);
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
};

const uniqueIntersections = (points: PointXY[], dir: PointXY): PointXY[] => {
  const sorted = [...points].sort((a, b) => dot(a, dir) - dot(b, dir));
  const result: PointXY[] = [];
  for (const point of sorted) {
    const prev = result[result.length - 1];
    if (!prev) {
      result.push(point);
      continue;
    }
    if (Math.hypot(point.x - prev.x, point.y - prev.y) > 0.01) {
      result.push(point);
    }
  }
  return result;
};

export const generateLanesForZone = (input: ZoneLaneGenerationInput): LaneFeature[] => {
  const ring = toClosedRing(input.points);
  if (ring.length < 4) return [];

  const { lat0, lon0 } = computeCenter(ring.slice(0, -1));
  const ringXY = ring.map((point) => projectPoint(point, lat0, lon0));
  const hullPoints = ringXY.slice(0, -1);
  const axis = principalDirection(hullPoints);
  const laneDirection = input.laneAngleDeg === 90 ? { x: -axis.y, y: axis.x } : axis;
  const normal = { x: -laneDirection.y, y: laneDirection.x };
  const laneStep = Number.isFinite(input.laneWidthM) ? Math.max(1, input.laneWidthM) : 5;

  const normalOffsets = hullPoints.map((point) => dot(point, normal));
  const minOffset = Math.min(...normalOffsets);
  const maxOffset = Math.max(...normalOffsets);
  if (!Number.isFinite(minOffset) || !Number.isFinite(maxOffset)) return [];

  const offsets: number[] = [];
  for (let offset = minOffset; offset <= maxOffset + EPS; offset += laneStep) {
    offsets.push(offset);
  }
  if (offsets.length === 0) {
    offsets.push((minOffset + maxOffset) / 2);
  }

  const timestamp = input.timestamp ?? new Date().toISOString();
  const lanes: LaneFeature[] = [];
  let laneIndex = 1;

  for (const offset of offsets) {
    const intersections: PointXY[] = [];

    for (let i = 0; i < ringXY.length - 1; i += 1) {
      const a = ringXY[i];
      const b = ringXY[i + 1];
      const da = dot(a, normal) - offset;
      const db = dot(b, normal) - offset;

      if (Math.abs(da) <= EPS && Math.abs(db) <= EPS) {
        intersections.push(a, b);
        continue;
      }
      if (Math.abs(da) <= EPS) {
        intersections.push(a);
        continue;
      }
      if (Math.abs(db) <= EPS) {
        intersections.push(b);
        continue;
      }
      if ((da > 0) !== (db > 0)) {
        const t = da / (da - db);
        intersections.push({
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
        });
      }
    }

    const lineIntersections = uniqueIntersections(intersections, laneDirection);
    for (let i = 0; i + 1 < lineIntersections.length; i += 2) {
      const start = lineIntersections[i];
      const end = lineIntersections[i + 1];
      if (Math.hypot(end.x - start.x, end.y - start.y) < 0.25) {
        continue;
      }

      lanes.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [unprojectPoint(start, lat0, lon0), unprojectPoint(end, lat0, lon0)],
        },
        properties: {
          id: createId(),
          kind: 'lane',
          name: `Галс ${laneIndex}`,
          note: null,
          created_at: timestamp,
          updated_at: timestamp,
          parent_area_id: input.parentAreaId,
          lane_index: laneIndex,
        },
      });
      laneIndex += 1;
    }
  }

  return lanes;
};
