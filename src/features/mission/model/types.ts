export const MISSION_SCHEMA_VERSION = 1;

export type IsoUtcString = string;

export type SegmentLengthsMode = 'off' | 'on-select' | 'always';
export type NavigationSourceId = 'zima2r' | 'gnss-udp' | 'simulation';

export type DiverUiConfig = {
  uid: string;
  id: string;
  beacon_id: string;
  title: string;
  marker_color: string;
  marker_size_px: number;
  track_color: string;
  navigation_source: NavigationSourceId;
};

export type MissionTrackMeta = {
  id: string;
  file: string;
  started_at: IsoUtcString;
  ended_at: IsoUtcString | null;
  note: string | null;
};

export type MissionUiState = {
  follow_diver?: boolean;
  divers?: DiverUiConfig[];
  layers?: {
    track?: boolean;
    routes?: boolean;
    markers?: boolean;
    base_station?: boolean;
    grid?: boolean;
    scale_bar?: boolean;
  };
  coordinates?: {
    precision?: number;
  };
  map_view?: {
    center_lat: number;
    center_lon: number;
    zoom: number;
  };
  measurements?: {
    grid?: {
      mode?: 'auto' | 'manual';
      step_m?: number;
      color?: string;
      width_px?: number;
      line_style?: 'solid' | 'dashed' | 'dotted';
    };
    segment_lengths_mode?: SegmentLengthsMode;
  };
  styles?: {
    track?: Record<string, unknown>;
    route?: Record<string, unknown>;
    survey_area?: Record<string, unknown>;
    lane?: Record<string, unknown>;
    marker?: Record<string, unknown>;
    base_station?: Record<string, unknown>;
  };
  base_station?: {
    navigation_source?: NavigationSourceId | null;
    lat?: number;
    lon?: number;
    heading_deg?: number | null;
    updated_at?: IsoUtcString;
    source_id?: NavigationSourceId | null;
  };
};

export type MissionDocument = {
  schema_version: number;
  mission_id: string;
  name: string;
  created_at: IsoUtcString;
  updated_at: IsoUtcString;
  active_track_id: string | null;
  tracks: MissionTrackMeta[];
  files: {
    routes: string;
    markers: string;
  };
  ui?: MissionUiState;
};

export type TrackPoint = {
  timestamp: IsoUtcString;
  lat: number;
  lon: number;
  segment_id: number;
  depth_m?: number;
  sog_mps?: number;
  cog_deg?: number;
};

type BaseFeatureProperties = {
  id: string;
  kind: 'route' | 'survey_area' | 'lane' | 'marker';
  name: string;
  note: string | null;
  created_at: IsoUtcString;
  updated_at: IsoUtcString;
};

export type RouteFeature = {
  type: 'Feature';
  geometry: {
    type: 'LineString';
    coordinates: [number, number][];
  };
  properties: BaseFeatureProperties & {
    kind: 'route';
    style?: Record<string, unknown>;
  };
};

export type SurveyAreaFeature = {
  type: 'Feature';
  geometry: {
    type: 'Polygon';
    coordinates: [number, number][][]; 
  };
  properties: BaseFeatureProperties & {
    kind: 'survey_area';
    lane_angle_deg: 0 | 90;
    lane_width_m: number;
    lane_bearing_deg?: number;
    lane_start_lat?: number;
    lane_start_lon?: number;
    style?: Record<string, unknown>;
  };
};

export type LaneFeature = {
  type: 'Feature';
  geometry: {
    type: 'LineString';
    coordinates: [number, number][];
  };
  properties: BaseFeatureProperties & {
    kind: 'lane';
    parent_area_id: string;
    lane_index: number;
  };
};

export type MarkerFeature = {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: BaseFeatureProperties & {
    kind: 'marker';
    description: string;
    style?: Record<string, unknown>;
  };
};

export type RoutesFeature = RouteFeature | SurveyAreaFeature | LaneFeature;

export type FeatureCollection<TFeature> = {
  type: 'FeatureCollection';
  features: TFeature[];
};

export type MissionBundle = {
  rootPath: string;
  mission: MissionDocument;
  routes: FeatureCollection<RoutesFeature>;
  markers: FeatureCollection<MarkerFeature>;
  trackPointsByTrackId: Record<string, TrackPoint[]>;
};

export type CreateMissionInput = {
  rootPath: string;
  name: string;
  ui?: MissionUiState;
  now?: Date;
};
