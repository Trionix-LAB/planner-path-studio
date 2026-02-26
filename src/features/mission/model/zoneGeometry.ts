import type { GeoPoint } from '@/features/map/model/types';

const EPS = 1e-10;

const isSamePoint = (a: GeoPoint, b: GeoPoint): boolean => Math.abs(a.lat - b.lat) < EPS && Math.abs(a.lon - b.lon) < EPS;

const normalizeRingPoints = (points: GeoPoint[]): GeoPoint[] => {
  if (points.length === 0) return [];

  const deduped: GeoPoint[] = [];
  for (const point of points) {
    const prev = deduped[deduped.length - 1];
    if (!prev || !isSamePoint(prev, point)) {
      deduped.push(point);
    }
  }

  if (deduped.length > 1 && isSamePoint(deduped[0], deduped[deduped.length - 1])) {
    deduped.pop();
  }

  return deduped;
};

type ProjectedPoint = {
  lat: number;
  lon: number;
  x: number;
  y: number;
};

const projectPoints = (points: GeoPoint[]): ProjectedPoint[] => {
  if (points.length === 0) return [];
  const lat0 = points.reduce((sum, point) => sum + point.lat, 0) / points.length;
  const cosLat0 = Math.max(Math.cos((lat0 * Math.PI) / 180), 1e-6);
  return points.map((point) => ({
    lat: point.lat,
    lon: point.lon,
    x: point.lon * cosLat0,
    y: point.lat,
  }));
};

const cross = (a: ProjectedPoint, b: ProjectedPoint, c: ProjectedPoint): number =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

const isSameProjectedPoint = (a: ProjectedPoint, b: ProjectedPoint): boolean =>
  Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS;

export const toConvexZonePolygon = (points: GeoPoint[]): GeoPoint[] => {
  const ring = normalizeRingPoints(points);
  if (ring.length < 3) return ring;

  const projected = projectPoints(ring)
    .sort((a, b) => (Math.abs(a.x - b.x) > EPS ? a.x - b.x : a.y - b.y))
    .filter((point, index, arr) => index === 0 || !isSameProjectedPoint(point, arr[index - 1]));

  if (projected.length < 3) {
    return projected.map((point) => ({ lat: point.lat, lon: point.lon }));
  }

  const lower: ProjectedPoint[] = [];
  for (const point of projected) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= EPS) {
      lower.pop();
    }
    lower.push(point);
  }

  const upper: ProjectedPoint[] = [];
  for (let i = projected.length - 1; i >= 0; i -= 1) {
    const point = projected[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= EPS) {
      upper.pop();
    }
    upper.push(point);
  }

  const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  return hull.map((point) => ({ lat: point.lat, lon: point.lon }));
};

export const isConvexZonePolygon = (points: GeoPoint[]): boolean => {
  const ring = normalizeRingPoints(points);
  if (ring.length < 3) return false;

  const lat0 = ring.reduce((sum, point) => sum + point.lat, 0) / ring.length;
  const cosLat0 = Math.max(Math.cos((lat0 * Math.PI) / 180), 1e-6);

  let orientation = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const c = ring[(i + 2) % ring.length];

    const abx = (b.lon - a.lon) * cosLat0;
    const aby = b.lat - a.lat;
    const bcx = (c.lon - b.lon) * cosLat0;
    const bcy = c.lat - b.lat;
    const cross = abx * bcy - aby * bcx;

    if (Math.abs(cross) <= EPS) continue;
    const sign = cross > 0 ? 1 : -1;
    if (orientation === 0) {
      orientation = sign;
    } else if (orientation !== sign) {
      return false;
    }
  }

  return orientation !== 0;
};
