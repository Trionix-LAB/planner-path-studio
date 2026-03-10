import type { MapObject } from '@/features/map/model/types';
import type { AppUiDefaults } from '@/features/settings';
import { mapObjectsToGeoJson } from './adapters';
import type {
  DiverUiConfig,
  LaneFeature,
  MissionBundle,
  MissionDocument,
  MissionUiState,
  NavigationSourceId,
  SegmentLengthsMode,
  TrackRecorderState,
} from './types';

export type MissionLayersState = {
  basemap: boolean;
  track: boolean;
  routes: boolean;
  markers: boolean;
  baseStation: boolean;
  grid: boolean;
  scaleBar: boolean;
  diver: boolean;
};

export type LeftPanelSectionsCollapsedState = {
  layers: boolean;
  agents: boolean;
  rasters: boolean;
  vectors: boolean;
  objects: boolean;
};

export type RightPanelSectionsCollapsedState = {
  hud: boolean;
  status: boolean;
  properties: boolean;
};

export type MapPanelsCollapsedState = {
  top: boolean;
  left: boolean;
  right: boolean;
};

export type BaseStationTelemetryState = {
  lat: number;
  lon: number;
  speed: number;
  course: number;
  heading: number | null;
  depth: number;
  received_at: number;
  sourceId: NavigationSourceId | null;
};

export type BuildMissionBundleInput = {
  rootPath: string;
  mission: MissionDocument;
  trackPointsByTrackId: TrackRecorderState['trackPointsByTrackId'];
  objects: MapObject[];
  laneFeatures: LaneFeature[];
  followEnabled: boolean;
  layers: MissionLayersState;
  divers: DiverUiConfig[];
  baseStationNavigationSource: NavigationSourceId | null;
  baseStationTrackColor: string;
  baseStationMarkerSizePx: number;
  rwltBuoys: NonNullable<MissionUiState['rwlt_buoys']>;
  hiddenTrackIds: string[];
  baseStationTelemetry: BaseStationTelemetryState | null;
  mapView: MissionUiState['map_view'] | null;
  coordPrecision: number;
  grid: AppUiDefaults['measurements']['grid'];
  segmentLengthsMode: SegmentLengthsMode;
  styles: AppUiDefaults['styles'];
  rasterOverlays: NonNullable<MissionUiState['raster_overlays']>;
  vectorOverlays: NonNullable<MissionUiState['vector_overlays']>;
  leftPanelSectionsCollapsed: LeftPanelSectionsCollapsedState;
  rightPanelSectionsCollapsed: RightPanelSectionsCollapsedState;
  leftPanelWidthPx: number;
  rightPanelWidthPx: number;
  mapPanelsCollapsed: MapPanelsCollapsedState;
};

export const buildMissionBundle = (input: BuildMissionBundleInput): MissionBundle => {
  const geo = mapObjectsToGeoJson(input.objects);
  const nextMission: MissionDocument = {
    ...input.mission,
    ui: {
      ...(input.mission.ui ?? {}),
      follow_diver: input.followEnabled,
      hidden_track_ids: input.hiddenTrackIds,
      divers: input.divers,
      layers: {
        basemap: input.layers.basemap,
        track: input.layers.track,
        routes: input.layers.routes,
        markers: input.layers.markers,
        base_station: input.layers.baseStation,
        grid: input.layers.grid,
        scale_bar: input.layers.scaleBar,
      },
      left_panel_sections: input.leftPanelSectionsCollapsed,
      right_panel_sections: input.rightPanelSectionsCollapsed,
      panel_layout: {
        left_width_px: input.leftPanelWidthPx,
        right_width_px: input.rightPanelWidthPx,
        left_collapsed: input.mapPanelsCollapsed.left,
        right_collapsed: input.mapPanelsCollapsed.right,
      },
      base_station: {
        navigation_source: input.baseStationNavigationSource,
        track_color: input.baseStationTrackColor,
        marker_size_px: input.baseStationMarkerSizePx,
        ...(input.baseStationTelemetry
          ? {
              lat: input.baseStationTelemetry.lat,
              lon: input.baseStationTelemetry.lon,
              heading_deg: input.baseStationTelemetry.heading,
              updated_at: new Date(input.baseStationTelemetry.received_at).toISOString(),
              source_id: input.baseStationTelemetry.sourceId,
            }
          : {}),
      },
      rwlt_buoys: input.rwltBuoys,
      ...(input.mapView ? { map_view: input.mapView } : {}),
      coordinates: { precision: input.coordPrecision },
      measurements: {
        ...(input.mission.ui?.measurements ?? {}),
        grid: { ...input.grid },
        segment_lengths_mode: input.segmentLengthsMode,
      },
      raster_overlays: input.rasterOverlays,
      vector_overlays: input.vectorOverlays,
      styles: {
        track: { ...input.styles.track },
        route: { ...input.styles.route },
        survey_area: { ...input.styles.survey_area },
        lane: { ...input.styles.lane },
        marker: { ...input.styles.marker },
      },
    },
  };

  return {
    rootPath: input.rootPath,
    mission: nextMission,
    routes: {
      ...geo.routes,
      features: [...geo.routes.features, ...input.laneFeatures],
    },
    markers: geo.markers,
    trackPointsByTrackId: input.trackPointsByTrackId,
  };
};
