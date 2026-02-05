import type { MapObject } from '@/features/map/model/types';
import type {
  FeatureCollection,
  MarkerFeature,
  MissionBundle,
  RoutesFeature,
  TrackPoint,
} from './types';

const nowIso = (): string => new Date().toISOString();

const createId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

export const bundleToMapObjects = (bundle: MissionBundle): MapObject[] => {
  const objects: MapObject[] = [];

  for (const feature of bundle.routes.features) {
    if (feature.properties.kind === 'lane') continue;

    if (feature.properties.kind === 'route' && feature.geometry.type === 'LineString') {
      objects.push({
        id: feature.properties.id,
        type: 'route',
        name: feature.properties.name,
        visible: true,
        note: feature.properties.note ?? undefined,
        geometry: {
          type: 'route',
          points: feature.geometry.coordinates.map(([lon, lat]) => ({ lat, lon })),
        },
      });
      continue;
    }

    if (feature.properties.kind === 'survey_area' && feature.geometry.type === 'Polygon') {
      const ring = feature.geometry.coordinates[0] ?? [];
      objects.push({
        id: feature.properties.id,
        type: 'zone',
        name: feature.properties.name,
        visible: true,
        note: feature.properties.note ?? undefined,
        laneAngle: feature.properties.lane_angle_deg,
        laneWidth: feature.properties.lane_width_m,
        geometry: {
          type: 'zone',
          points: ring.map(([lon, lat]) => ({ lat, lon })),
        },
      });
    }
  }

  for (const marker of bundle.markers.features) {
    objects.push({
      id: marker.properties.id,
      type: 'marker',
      name: marker.properties.name,
      visible: true,
      note: marker.properties.description,
      geometry: {
        type: 'marker',
        point: {
          lat: marker.geometry.coordinates[1],
          lon: marker.geometry.coordinates[0],
        },
      },
    });
  }

  return objects;
};

export const mapObjectsToGeoJson = (
  objects: MapObject[],
): {
  routes: FeatureCollection<RoutesFeature>;
  markers: FeatureCollection<MarkerFeature>;
} => {
  const now = nowIso();
  const routesFeatures: RoutesFeature[] = [];
  const markerFeatures: MarkerFeature[] = [];

  for (const object of objects) {
    if (!object.geometry) continue;

    if (object.type === 'route' && object.geometry.type === 'route') {
      routesFeatures.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: object.geometry.points.map((point) => [point.lon, point.lat]),
        },
        properties: {
          id: object.id || createId(),
          kind: 'route',
          name: object.name,
          note: object.note ?? null,
          created_at: now,
          updated_at: now,
        },
      });
      continue;
    }

    if (object.type === 'zone' && object.geometry.type === 'zone') {
      const ring = object.geometry.points.map((point) => [point.lon, point.lat] as [number, number]);
      const closedRing =
        ring.length > 0 &&
        (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])
          ? [...ring, ring[0]]
          : ring;

      routesFeatures.push({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [closedRing],
        },
        properties: {
          id: object.id || createId(),
          kind: 'survey_area',
          name: object.name,
          note: object.note ?? null,
          created_at: now,
          updated_at: now,
          lane_angle_deg: object.laneAngle === 90 ? 90 : 0,
          lane_width_m: object.laneWidth ?? 5,
        },
      });
      continue;
    }

    if (object.type === 'marker' && object.geometry.type === 'marker') {
      markerFeatures.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [object.geometry.point.lon, object.geometry.point.lat],
        },
        properties: {
          id: object.id || createId(),
          kind: 'marker',
          name: object.name,
          note: object.note ?? null,
          created_at: now,
          updated_at: now,
          description: object.note ?? '',
        },
      });
    }
  }

  return {
    routes: {
      type: 'FeatureCollection',
      features: routesFeatures,
    },
    markers: {
      type: 'FeatureCollection',
      features: markerFeatures,
    },
  };
};

export const buildTrackSegments = (
  pointsByTrackId: Record<string, TrackPoint[]>,
): Array<Array<[number, number]>> => {
  const segments: Array<Array<[number, number]>> = [];

  for (const points of Object.values(pointsByTrackId)) {
    if (points.length === 0) continue;
    let currentSegmentId = points[0].segment_id;
    let current: Array<[number, number]> = [];

    for (const point of points) {
      if (point.segment_id !== currentSegmentId) {
        if (current.length > 1) segments.push(current);
        current = [];
        currentSegmentId = point.segment_id;
      }
      current.push([point.lat, point.lon]);
    }

    if (current.length > 1) segments.push(current);
  }

  return segments;
};
