import { describe, expect, it } from 'vitest';
import { buildMissionBundle, type MissionDocument } from '@/features/mission';
import { createDefaultAppSettings } from '@/features/settings';

const now = '2026-03-07T10:00:00.000Z';

describe('buildMissionBundle rwlt buoys', () => {
  it('persists rwlt buoy ui settings into mission.ui.rwlt_buoys', () => {
    const defaults = createDefaultAppSettings().defaults;
    const mission: MissionDocument = {
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
    };

    const bundle = buildMissionBundle({
      rootPath: '/tmp/mission',
      mission,
      trackPointsByTrackId: {},
      objects: [],
      laneFeatures: [],
      followEnabled: false,
      layers: {
        basemap: true,
        track: true,
        routes: true,
        markers: true,
        baseStation: true,
        grid: false,
        scaleBar: true,
        diver: true,
      },
      divers: [],
      baseStationNavigationSource: null,
      baseStationTrackColor: '#00a3ff',
      baseStationMarkerSizePx: 34,
      rwltBuoys: [
        { buoy_id: 1, name: 'Буй Север', marker_color: '#1d4ed8', marker_size_px: 36 },
        { buoy_id: 2, name: 'Буй Юг', marker_color: '#ef4444', marker_size_px: 22 },
      ],
      hiddenTrackIds: [],
      baseStationTelemetry: null,
      mapView: null,
      coordPrecision: 6,
      grid: defaults.measurements.grid,
      segmentLengthsMode: defaults.measurements.segment_lengths_mode,
      styles: defaults.styles,
      rasterOverlays: [],
      vectorOverlays: [],
      leftPanelSectionsCollapsed: {
        layers: false,
        agents: false,
        rasters: false,
        vectors: false,
        objects: false,
      },
      rightPanelSectionsCollapsed: {
        hud: false,
        status: false,
        properties: false,
      },
      leftPanelWidthPx: 320,
      rightPanelWidthPx: 380,
      mapPanelsCollapsed: {
        top: false,
        left: false,
        right: false,
      },
    });

    expect(bundle.mission.ui?.rwlt_buoys).toEqual([
      { buoy_id: 1, name: 'Буй Север', marker_color: '#1d4ed8', marker_size_px: 36 },
      { buoy_id: 2, name: 'Буй Юг', marker_color: '#ef4444', marker_size_px: 22 },
    ]);
  });
});
