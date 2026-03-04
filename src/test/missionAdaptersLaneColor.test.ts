import { describe, expect, it } from 'vitest';
import { bundleToMapObjects, mapObjectsToGeoJson, type MissionBundle } from '@/features/mission';
import type { MapObject } from '@/features/map/model/types';

const now = '2026-03-03T10:00:00.000Z';

describe('mission adapters lane color', () => {
  it('reads lane_color from survey_area style into zone.laneColor', () => {
    const bundle: MissionBundle = {
      rootPath: '/tmp/mission',
      mission: {
        schema_version: 1,
        mission_id: 'mission-1',
        name: 'Mission',
        created_at: now,
        updated_at: now,
        active_track_id: null,
        active_tracks: {},
        tracks: [],
        files: {
          routes: 'routes/routes.geojson',
          markers: 'markers/markers.geojson',
        },
        ui: {},
      },
      routes: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [30.1, 59.1],
                  [30.2, 59.1],
                  [30.2, 59.2],
                  [30.1, 59.1],
                ],
              ],
            },
            properties: {
              id: 'zone-1',
              kind: 'survey_area',
              name: 'Zone 1',
              note: null,
              created_at: now,
              updated_at: now,
              lane_angle_deg: 0,
              lane_width_m: 5,
              style: {
                color: '#f59e0b',
                lane_color: '#22c55e',
              },
            },
          },
        ],
      },
      markers: {
        type: 'FeatureCollection',
        features: [],
      },
      trackPointsByTrackId: {},
    };

    const objects = bundleToMapObjects(bundle);
    const zone = objects.find((obj) => obj.id === 'zone-1');

    expect(zone).toBeDefined();
    expect(zone?.type).toBe('zone');
    expect(zone?.laneColor).toBe('#22c55e');
  });

  it('writes zone.laneColor to survey_area style.lane_color', () => {
    const objects: MapObject[] = [
      {
        id: 'zone-1',
        type: 'zone',
        name: 'Zone 1',
        visible: true,
        color: '#f59e0b',
        laneColor: '#22c55e',
        laneAngle: 0,
        laneWidth: 5,
        geometry: {
          type: 'zone',
          points: [
            { lat: 59.1, lon: 30.1 },
            { lat: 59.1, lon: 30.2 },
            { lat: 59.2, lon: 30.2 },
          ],
        },
      },
    ];

    const geoJson = mapObjectsToGeoJson(objects);
    const zoneFeature = geoJson.routes.features.find(
      (feature) => feature.properties.kind === 'survey_area' && feature.properties.id === 'zone-1',
    );

    expect(zoneFeature).toBeDefined();
    if (!zoneFeature || zoneFeature.properties.kind !== 'survey_area') {
      throw new Error('zone feature not found');
    }

    const style = zoneFeature.properties.style as Record<string, unknown> | undefined;
    expect(style?.color).toBe('#f59e0b');
    expect(style?.lane_color).toBe('#22c55e');
  });

  it('serializes and restores measure objects via routes geojson', () => {
    const objects: MapObject[] = [
      {
        id: 'measure-1',
        type: 'measure',
        name: 'Измерение 1',
        visible: true,
        color: '#f97316',
        note: 'Тестовое измерение',
        geometry: {
          type: 'measure',
          points: [
            { lat: 59.1, lon: 30.1 },
            { lat: 59.2, lon: 30.2 },
          ],
        },
      },
    ];

    const geoJson = mapObjectsToGeoJson(objects);
    const measureFeature = geoJson.routes.features.find((feature) => feature.properties.kind === 'measure');
    expect(measureFeature).toBeDefined();

    const bundle: MissionBundle = {
      rootPath: '/tmp/mission',
      mission: {
        schema_version: 1,
        mission_id: 'mission-1',
        name: 'Mission',
        created_at: now,
        updated_at: now,
        active_track_id: null,
        active_tracks: {},
        tracks: [],
        files: {
          routes: 'routes/routes.geojson',
          markers: 'markers/markers.geojson',
        },
        ui: {},
      },
      routes: {
        type: 'FeatureCollection',
        features: measureFeature ? [measureFeature] : [],
      },
      markers: {
        type: 'FeatureCollection',
        features: [],
      },
      trackPointsByTrackId: {},
    };

    const restored = bundleToMapObjects(bundle);
    expect(restored).toHaveLength(1);
    expect(restored[0]).toMatchObject({
      id: 'measure-1',
      type: 'measure',
      name: 'Измерение 1',
      color: '#f97316',
      note: 'Тестовое измерение',
      geometry: {
        type: 'measure',
        points: [
          { lat: 59.1, lon: 30.1 },
          { lat: 59.2, lon: 30.2 },
        ],
      },
    });
  });
});
