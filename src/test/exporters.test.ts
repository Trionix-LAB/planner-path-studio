import { describe, expect, it } from 'vitest';
import { markersToCsv, tracksToGpx, tracksToKml } from '@/features/export';

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
});

