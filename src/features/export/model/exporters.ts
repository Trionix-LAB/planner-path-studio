import type { MapObject } from '@/features/map/model/types';
import type { LaneFeature, TrackPoint } from '@/features/mission';

const normalizePath = (path: string): string => path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
export const joinPath = (base: string, part: string): string =>
  `${normalizePath(base)}/${part.replace(/^\/+/, '')}`;

export const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

export const safeFilename = (value: string): string => {
  const trimmed = value.trim() || 'export';
  // Windows-safe: remove <>:"/\|?* and ASCII control chars, collapse whitespace.
  const withoutControls = Array.from(trimmed)
    .filter((ch) => ch.charCodeAt(0) >= 32)
    .join('');
  const cleaned = withoutControls
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'export';
};

export const groupTrackPointsBySegment = (points: TrackPoint[]): TrackPoint[][] => {
  const segments: TrackPoint[][] = [];
  if (points.length === 0) return segments;

  let currentSegmentId = points[0].segment_id;
  let current: TrackPoint[] = [];

  for (const point of points) {
    if (point.segment_id !== currentSegmentId) {
      if (current.length > 0) segments.push(current);
      current = [];
      currentSegmentId = point.segment_id;
    }
    current.push(point);
  }

  if (current.length > 0) segments.push(current);
  return segments;
};

const fmtNumber = (value: number, precision: number): string => {
  if (!Number.isFinite(value)) return '';
  return value.toFixed(precision);
};

const ensureClosedRing = (points: Array<{ lat: number; lon: number }>): Array<{ lat: number; lon: number }> => {
  if (points.length < 2) return points;
  const first = points[0];
  const last = points[points.length - 1];
  if (first.lat === last.lat && first.lon === last.lon) return points;
  return [...points, first];
};

export const tracksToGpx = (tracks: Array<{ name: string; id: string; points: TrackPoint[] }>, precision: number): string => {
  const time = new Date().toISOString();
  const trkXml = tracks
    .map((track) => {
      const segments = groupTrackPointsBySegment(track.points);
      const segXml = segments
        .map((segment) => {
          const pts = segment
            .map(
              (p) =>
                `<trkpt lat="${escapeXml(fmtNumber(p.lat, precision))}" lon="${escapeXml(fmtNumber(p.lon, precision))}"><time>${escapeXml(
                  p.timestamp,
                )}</time></trkpt>`,
            )
            .join('');
          return `<trkseg>${pts}</trkseg>`;
        })
        .join('');
      return `<trk><name>${escapeXml(track.name)}</name>${segXml}</trk>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<gpx version="1.1" creator="planner-path-studio" xmlns="http://www.topografix.com/GPX/1/1">` +
    `<metadata><time>${escapeXml(time)}</time></metadata>` +
    trkXml +
    `</gpx>`;
};

export const tracksToKml = (tracks: Array<{ name: string; id: string; points: TrackPoint[] }>, precision: number): string => {
  const placemarks: string[] = [];
  for (const track of tracks) {
    const segments = groupTrackPointsBySegment(track.points);
    segments.forEach((segment, index) => {
      const coords = segment
        .map((p) => `${fmtNumber(p.lon, precision)},${fmtNumber(p.lat, precision)},0`)
        .join(' ');
      placemarks.push(
        `<Placemark><name>${escapeXml(track.name)} / seg ${index + 1}</name>` +
          `<LineString><tessellate>1</tessellate><coordinates>${escapeXml(coords)}</coordinates></LineString>` +
        `</Placemark>`,
      );
    });
  }

  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<kml xmlns="http://www.opengis.net/kml/2.2"><Document>` +
    `<name>${escapeXml('Tracks')}</name>` +
    placemarks.join('') +
    `</Document></kml>`;
};

export const routesToGpx = (
  objects: MapObject[],
  lanes: LaneFeature[],
  precision: number,
): string => {
  const routes = objects.filter((o) => o.geometry && (o.type === 'route' || o.type === 'zone'));

  const rteXml: string[] = [];

  for (const obj of routes) {
    if (!obj.geometry) continue;
    if (obj.geometry.type === 'route') {
      const pts = obj.geometry.points
        .map((p) => `<rtept lat="${escapeXml(fmtNumber(p.lat, precision))}" lon="${escapeXml(fmtNumber(p.lon, precision))}" />`)
        .join('');
      rteXml.push(`<rte><name>${escapeXml(obj.name)}</name>${pts}</rte>`);
      continue;
    }
    if (obj.geometry.type === 'zone') {
      const ring = ensureClosedRing(obj.geometry.points);
      const pts = ring
        .map((p) => `<rtept lat="${escapeXml(fmtNumber(p.lat, precision))}" lon="${escapeXml(fmtNumber(p.lon, precision))}" />`)
        .join('');
      rteXml.push(`<rte><name>${escapeXml(`Zone: ${obj.name}`)}</name>${pts}</rte>`);
    }
  }

  for (const lane of lanes) {
    const points = lane.geometry.coordinates.map(([lon, lat]) => ({ lat, lon }));
    const pts = points
      .map((p) => `<rtept lat="${escapeXml(fmtNumber(p.lat, precision))}" lon="${escapeXml(fmtNumber(p.lon, precision))}" />`)
      .join('');
    const name = `Lane ${lane.properties.lane_index}`;
    rteXml.push(`<rte><name>${escapeXml(name)}</name>${pts}</rte>`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<gpx version="1.1" creator="planner-path-studio" xmlns="http://www.topografix.com/GPX/1/1">` +
    rteXml.join('') +
    `</gpx>`;
};

export const routesToKml = (
  objects: MapObject[],
  lanes: LaneFeature[],
  precision: number,
): string => {
  const placemarks: string[] = [];
  for (const obj of objects) {
    if (!obj.geometry) continue;

    if (obj.geometry.type === 'route') {
      const coords = obj.geometry.points
        .map((p) => `${fmtNumber(p.lon, precision)},${fmtNumber(p.lat, precision)},0`)
        .join(' ');
      placemarks.push(
        `<Placemark><name>${escapeXml(obj.name)}</name>` +
          `<LineString><tessellate>1</tessellate><coordinates>${escapeXml(coords)}</coordinates></LineString>` +
        `</Placemark>`,
      );
      continue;
    }

    if (obj.geometry.type === 'zone') {
      const ring = ensureClosedRing(obj.geometry.points);
      const coords = ring
        .map((p) => `${fmtNumber(p.lon, precision)},${fmtNumber(p.lat, precision)},0`)
        .join(' ');
      placemarks.push(
        `<Placemark><name>${escapeXml(`Zone: ${obj.name}`)}</name>` +
          `<Polygon><outerBoundaryIs><LinearRing><coordinates>${escapeXml(coords)}</coordinates></LinearRing></outerBoundaryIs></Polygon>` +
        `</Placemark>`,
      );
    }
  }

  for (const lane of lanes) {
    const coords = lane.geometry.coordinates
      .map(([lon, lat]) => `${fmtNumber(lon, precision)},${fmtNumber(lat, precision)},0`)
      .join(' ');
    placemarks.push(
      `<Placemark><name>${escapeXml(`Lane ${lane.properties.lane_index}`)}</name>` +
        `<LineString><tessellate>1</tessellate><coordinates>${escapeXml(coords)}</coordinates></LineString>` +
      `</Placemark>`,
    );
  }

  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<kml xmlns="http://www.opengis.net/kml/2.2"><Document>` +
    `<name>${escapeXml('Routes')}</name>` +
    placemarks.join('') +
    `</Document></kml>`;
};

export const markersToCsv = (markers: MapObject[], precision: number): string => {
  const rows: string[] = [];
  rows.push('name,description,lat,lon');
  for (const m of markers) {
    if (m.type !== 'marker' || m.geometry?.type !== 'marker') continue;
    const name = JSON.stringify(m.name ?? '');
    const desc = JSON.stringify(m.note ?? '');
    const lat = fmtNumber(m.geometry.point.lat, precision);
    const lon = fmtNumber(m.geometry.point.lon, precision);
    rows.push(`${name},${desc},${lat},${lon}`);
  }
  return rows.join('\n');
};

export const markersToGpx = (markers: MapObject[], precision: number): string => {
  const time = new Date().toISOString();
  const wpts = markers
    .filter((m) => m.type === 'marker' && m.geometry?.type === 'marker')
    .map((m) => {
      if (!m.geometry || m.geometry.type !== 'marker') return '';
      const point = m.geometry.point;
      return `<wpt lat="${escapeXml(fmtNumber(point.lat, precision))}" lon="${escapeXml(fmtNumber(point.lon, precision))}">` +
        `<name>${escapeXml(m.name)}</name>` +
        `<desc>${escapeXml(m.note ?? '')}</desc>` +
      `</wpt>`;
    })
    .filter((line) => line.length > 0)
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<gpx version="1.1" creator="planner-path-studio" xmlns="http://www.topografix.com/GPX/1/1">` +
    `<metadata><time>${escapeXml(time)}</time></metadata>` +
    wpts +
    `</gpx>`;
};
