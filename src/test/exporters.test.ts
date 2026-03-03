import { describe, expect, it } from 'vitest';
import { markersToCsv, routesToCsv, tracksToCsv, tracksToGpx, tracksToKml } from '@/features/export';
import type { MapObject } from '@/features/map/model/types';
import type { LaneFeature } from '@/features/mission';

describe('exporters', () => {
  it('exports GPX with segmented track', () => {
    const gpx = tracksToGpx(
      [
        {
          id: 't1',
          name: 'Track 1',
          points: [
            { timestamp: '2026-02-03T10:00:00.000Z', lat: 1, lon: 2, segment_id: 1 },
            { timestamp: '2026-02-03T10:00:01.000Z', lat: 1.1, lon: 2.1, segment_id: 1 },
            { timestamp: '2026-02-03T10:00:02.000Z', lat: 1.2, lon: 2.2, segment_id: 2 },
          ],
        },
      ],
      6,
    );

    expect(gpx).toContain('<trkseg>');
    expect(gpx.match(/<trkseg>/g)?.length).toBe(2);
    expect(gpx).toContain('lat="1.000000"');
    expect(gpx).toContain('lon="2.000000"');
  });

  it('exports KML coordinates in lon,lat order', () => {
    const kml = tracksToKml(
      [
        {
          id: 't1',
          name: 'Track 1',
          points: [{ timestamp: '2026-02-03T10:00:00.000Z', lat: 1, lon: 2, segment_id: 1 }],
        },
      ],
      6,
    );
    expect(kml).toContain('2.000000,1.000000,0');
  });

  it('exports markers to CSV with header', () => {
    const csv = markersToCsv(
      [
        {
          id: 'm1',
          type: 'marker',
          name: 'Marker 1',
          visible: true,
          note: 'Hello',
          geometry: { type: 'marker', point: { lat: 10, lon: 20 } },
        },
      ],
      6,
    );

    expect(csv.split('\n')[0]).toBe('name,description,lat,lon');
    expect(csv).toContain('10.000000');
    expect(csv).toContain('20.000000');
  });

  it('exports tracks to CSV', () => {
    const csv = tracksToCsv(
      [
        {
          id: 't1',
          name: 'Track 1',
          points: [{ timestamp: '2026-02-03T10:00:00.000Z', lat: 1, lon: 2, segment_id: 1 }],
        },
      ],
      6,
    );

    expect(csv.split('\n')[0]).toBe('track_id,track_name,segment_id,timestamp,lat,lon');
    expect(csv).toContain('"t1"');
    expect(csv).toContain('"1.000000"');
    expect(csv).toContain('"2.000000"');
  });

  it('exports routes to CSV including lanes', () => {
    const routeObject: MapObject = {
      id: 'r1',
      type: 'route',
      name: 'Route 1',
      visible: true,
      note: '',
      color: '#fff',
      geometry: {
        type: 'route',
        points: [
          { lat: 10, lon: 20 },
          { lat: 11, lon: 21 },
        ],
      },
    };
    const laneFeature: LaneFeature = {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [30, 40],
          [31, 41],
        ],
      },
      properties: {
        id: 'lane-1',
        kind: 'lane',
        name: 'Lane',
        note: null,
        created_at: '2026-02-03T10:00:00.000Z',
        updated_at: '2026-02-03T10:00:00.000Z',
        parent_area_id: 'zone-1',
        lane_index: 1,
      },
    };

    const csv = routesToCsv(
      [routeObject],
      [laneFeature],
      6,
    );

    expect(csv.split('\n')[0]).toBe('object_id,object_type,object_name,parent_zone_id,lane_index,point_index,lat,lon');
    expect(csv).toContain('"r1"');
    expect(csv).toContain('"lane-1"');
    expect(csv).toContain('"Галс 1"');
  });

  it('exports CSV coordinates in selected CRS/format', () => {
    const marker: MapObject = {
      id: 'm1',
      type: 'marker',
      name: 'Marker 1',
      visible: true,
      note: '',
      geometry: { type: 'marker', point: { lat: 48.858244, lon: 2.294528 } },
    };
    const csv = markersToCsv(
      [marker],
      6,
      { crs: 'sk42', format: 'dms' },
    );

    expect(csv).toContain('°');
    expect(csv).toContain('′');
    expect(csv).toContain('″');
  });
});
