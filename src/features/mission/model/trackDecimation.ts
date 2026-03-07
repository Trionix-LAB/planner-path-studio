import type { TrackSegment } from './adapters';

const METERS_PER_DEGREE_LAT = 111_320;
const DEG_TO_RAD = Math.PI / 180;

type Point = [number, number];
type SegmentRange = { start: number; end: number };

const distancePointToSegmentDeg = (point: Point, segmentStart: Point, segmentEnd: Point): number => {
  const referenceLatRad = ((point[0] + segmentStart[0] + segmentEnd[0]) / 3) * DEG_TO_RAD;
  const lonScale = Math.max(1e-9, Math.cos(referenceLatRad));

  const px = point[1] * lonScale;
  const py = point[0];
  const ax = segmentStart[1] * lonScale;
  const ay = segmentStart[0];
  const bx = segmentEnd[1] * lonScale;
  const by = segmentEnd[0];

  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0) {
    return Math.hypot(px - ax, py - ay);
  }

  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  const projectionX = ax + t * dx;
  const projectionY = ay + t * dy;
  return Math.hypot(px - projectionX, py - projectionY);
};

export const rdpSimplify = (points: Point[], epsilonDeg: number): Point[] => {
  if (points.length <= 2) return points;
  if (!Number.isFinite(epsilonDeg) || epsilonDeg <= 0) return points;

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack: SegmentRange[] = [{ start: 0, end: points.length - 1 }];
  while (stack.length > 0) {
    const range = stack.pop();
    if (!range) continue;
    const { start, end } = range;
    if (end - start <= 1) continue;

    const segmentStart = points[start];
    const segmentEnd = points[end];
    let maxDistance = -1;
    let maxDistanceIndex = -1;

    for (let index = start + 1; index < end; index += 1) {
      const distance = distancePointToSegmentDeg(points[index], segmentStart, segmentEnd);
      if (distance > maxDistance) {
        maxDistance = distance;
        maxDistanceIndex = index;
      }
    }

    if (maxDistanceIndex >= 0 && maxDistance > epsilonDeg) {
      keep[maxDistanceIndex] = 1;
      stack.push({ start, end: maxDistanceIndex }, { start: maxDistanceIndex, end });
    }
  }

  const simplified: Point[] = [];
  for (let index = 0; index < points.length; index += 1) {
    if (keep[index] === 1) {
      simplified.push(points[index]);
    }
  }

  return simplified.length >= 2 ? simplified : [points[0], points[points.length - 1]];
};

export const decimateSegments = <TSegment extends TrackSegment>(segments: TSegment[], epsilonDeg: number): TSegment[] => {
  if (!Number.isFinite(epsilonDeg) || epsilonDeg <= 0) {
    return segments;
  }

  return segments.map((segment) => ({
    ...segment,
    points: rdpSimplify(segment.points, epsilonDeg),
  })) as TSegment[];
};

export const epsilonDegFromMetersPerPixel = (metersPerPixel: number): number => {
  if (!Number.isFinite(metersPerPixel) || metersPerPixel <= 0) return 0;
  return metersPerPixel / METERS_PER_DEGREE_LAT;
};
