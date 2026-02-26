import type { GeoPoint } from '@/features/map/model/types';
import type { LaneFeature } from './types';
import { normalizeLaneAngleDeg } from './laneAngle';

type PointXY = {
  x: number;
  y: number;
};

type ZoneLaneGenerationInput = {
  parentAreaId: string;
  points: GeoPoint[];
  laneAngleDeg: number;
  laneWidthM: number;
  laneBearingDeg?: number;
  start?: GeoPoint;
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

const normalizeAngleDeg = (value: number): number => {
  const normalized = ((value % 360) + 360) % 360;
  return normalized;
};

// Bearing is degrees clockwise from North. We normalize to an undirected axis in [0, 180).
const toUndirectedBearingDeg = (value: number): number => {
  const normalized = normalizeAngleDeg(value);
  return normalized >= 180 ? normalized - 180 : normalized;
};

const bearingToUnitVector = (bearingDeg: number): PointXY => {
  const rad = bearingDeg * DEG_TO_RAD;
  // x = East, y = North
  const x = Math.sin(rad);
  const y = Math.cos(rad);
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
};

const rotate = (vector: PointXY, angleDeg: number): PointXY => {
  const rad = angleDeg * DEG_TO_RAD;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const x = vector.x * cos - vector.y * sin;
  const y = vector.x * sin + vector.y * cos;
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
};

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
  const baseAxis =
    typeof input.laneBearingDeg === 'number' && Number.isFinite(input.laneBearingDeg)
      ? bearingToUnitVector(toUndirectedBearingDeg(input.laneBearingDeg))
      : principalDirection(hullPoints);
  const laneDirection = rotate(baseAxis, normalizeLaneAngleDeg(input.laneAngleDeg));
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

  const startXY =
    input.start && Number.isFinite(input.start.lat) && Number.isFinite(input.start.lon)
      ? projectPoint(input.start, lat0, lon0)
      : null;
  if (startXY) {
    const startOffset = dot(startXY, normal);
    const nearMin = Math.abs(startOffset - minOffset) <= Math.abs(maxOffset - startOffset);
    if (!nearMin) offsets.reverse();
  }

  const timestamp = input.timestamp ?? new Date().toISOString();
  const lanes: LaneFeature[] = [];
  let laneIndex = 1;
  let initialForward: boolean | null = null;

  for (let rowIndex = 0; rowIndex < offsets.length; rowIndex += 1) {
    const offset = offsets[rowIndex];
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
    const segments: Array<{ a: PointXY; b: PointXY; midScore: number }> = [];
    for (let i = 0; i + 1 < lineIntersections.length; i += 2) {
      const a = lineIntersections[i];
      const b = lineIntersections[i + 1];
      if (Math.hypot(b.x - a.x, b.y - a.y) < 0.25) continue;
      const midScore = dot({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, laneDirection);
      segments.push({ a, b, midScore });
    }
    if (segments.length === 0) continue;

    if (initialForward === null) {
      if (!startXY) {
        initialForward = true;
      } else {
        const first = [...segments].sort((s1, s2) => s1.midScore - s2.midScore)[0];
        const aScore = dot(first.a, laneDirection);
        const bScore = dot(first.b, laneDirection);
        const low = aScore <= bScore ? first.a : first.b;
        const high = aScore <= bScore ? first.b : first.a;
        const distToLow = Math.hypot(startXY.x - low.x, startXY.y - low.y);
        const distToHigh = Math.hypot(startXY.x - high.x, startXY.y - high.y);
        initialForward = distToLow <= distToHigh;
      }
    }

    const rowForward = Boolean(initialForward) !== (rowIndex % 2 === 1);
    segments.sort((s1, s2) => (rowForward ? s1.midScore - s2.midScore : s2.midScore - s1.midScore));

    for (const seg of segments) {
      const aScore = dot(seg.a, laneDirection);
      const bScore = dot(seg.b, laneDirection);
      const low = aScore <= bScore ? seg.a : seg.b;
      const high = aScore <= bScore ? seg.b : seg.a;
      const start = rowForward ? low : high;
      const end = rowForward ? high : low;

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
