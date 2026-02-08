import type { MissionUiState, SegmentLengthsMode } from '@/features/mission';

export const APP_SETTINGS_SCHEMA_VERSION = 1 as const;
export const APP_SETTINGS_STORAGE_KEY = 'planner.appSettings.v1';

export type GridMode = 'auto' | 'manual';

export type AppUiDefaults = {
  follow_diver: boolean;
  interactions: {
    center_on_object_select: boolean;
  };
  layers: {
    track: boolean;
    routes: boolean;
    markers: boolean;
    grid: boolean;
    scale_bar: boolean;
  };
  coordinates: {
    precision: number;
  };
  measurements: {
    grid: {
      mode: GridMode;
      step_m?: number;
      color: string;
      width_px: number;
      line_style: 'solid' | 'dashed' | 'dotted';
    };
    segment_lengths_mode: SegmentLengthsMode;
  };
  styles: {
    track: { color: string; width_px: number };
    route: { color: string; width_px: number };
    survey_area: { stroke_color: string; stroke_width_px: number; fill_color: string; fill_opacity: number };
    lane: { color: string; width_px: number; dash?: string };
    marker: { color: string };
  };
};

export type AppSettingsV1 = {
  schema_version: typeof APP_SETTINGS_SCHEMA_VERSION;
  defaults: AppUiDefaults;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const clampInt = (value: unknown, fallback: number, min: number, max: number): number => {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
};

const normalizeHexColor = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
  return fallback;
};

const normalizeSegmentLengthsMode = (value: unknown, fallback: SegmentLengthsMode): SegmentLengthsMode => {
  if (value === 'off' || value === 'on-select' || value === 'always') return value;
  return fallback;
};

const normalizeGridLineStyle = (value: unknown, fallback: 'solid' | 'dashed' | 'dotted'): 'solid' | 'dashed' | 'dotted' => {
  if (value === 'solid' || value === 'dashed' || value === 'dotted') return value;
  return fallback;
};

export const createDefaultAppSettings = (): AppSettingsV1 => ({
  schema_version: APP_SETTINGS_SCHEMA_VERSION,
  defaults: {
    follow_diver: true,
    interactions: {
      center_on_object_select: false,
    },
    layers: {
      track: true,
      routes: true,
      markers: true,
      grid: false,
      scale_bar: true,
    },
    coordinates: { precision: 6 },
    measurements: {
      grid: { mode: 'auto', color: '#64748b', width_px: 1, line_style: 'dashed' },
      segment_lengths_mode: 'on-select',
    },
    styles: {
      track: { color: '#a855f7', width_px: 3 },
      route: { color: '#0ea5e9', width_px: 3 },
      survey_area: { stroke_color: '#fbbf24', stroke_width_px: 2, fill_color: '#fbbf24', fill_opacity: 0.15 },
      lane: { color: '#22c55e', width_px: 2 },
      marker: { color: '#22c55e' },
    },
  },
});

export const normalizeAppSettings = (raw: unknown): AppSettingsV1 => {
  const base = createDefaultAppSettings();
  if (!isRecord(raw)) return base;
  if (raw.schema_version !== APP_SETTINGS_SCHEMA_VERSION) return base;
  const defaultsRaw = isRecord(raw.defaults) ? raw.defaults : {};

  const interactionsRaw = isRecord(defaultsRaw.interactions) ? defaultsRaw.interactions : {};

  const layersRaw = isRecord(defaultsRaw.layers) ? defaultsRaw.layers : {};
  const coordsRaw = isRecord(defaultsRaw.coordinates) ? defaultsRaw.coordinates : {};
  const measurementsRaw = isRecord(defaultsRaw.measurements) ? defaultsRaw.measurements : {};
  const gridRaw = isRecord(measurementsRaw.grid) ? measurementsRaw.grid : {};
  const stylesRaw = isRecord(defaultsRaw.styles) ? defaultsRaw.styles : {};

  const trackStyleRaw = isRecord(stylesRaw.track) ? stylesRaw.track : {};
  const routeStyleRaw = isRecord(stylesRaw.route) ? stylesRaw.route : {};
  const surveyStyleRaw = isRecord(stylesRaw.survey_area) ? stylesRaw.survey_area : {};
  const laneStyleRaw = isRecord(stylesRaw.lane) ? stylesRaw.lane : {};
  const markerStyleRaw = isRecord(stylesRaw.marker) ? stylesRaw.marker : {};

  const mode = gridRaw.mode === 'manual' ? 'manual' : 'auto';
  const stepM = mode === 'manual' ? clampInt(gridRaw.step_m, 50, 1, 1_000_000) : undefined;

  return {
    schema_version: APP_SETTINGS_SCHEMA_VERSION,
    defaults: {
      follow_diver: typeof defaultsRaw.follow_diver === 'boolean' ? defaultsRaw.follow_diver : base.defaults.follow_diver,
      interactions: {
        center_on_object_select:
          typeof interactionsRaw.center_on_object_select === 'boolean'
            ? interactionsRaw.center_on_object_select
            : base.defaults.interactions.center_on_object_select,
      },
      layers: {
        track: typeof layersRaw.track === 'boolean' ? layersRaw.track : base.defaults.layers.track,
        routes: typeof layersRaw.routes === 'boolean' ? layersRaw.routes : base.defaults.layers.routes,
        markers: typeof layersRaw.markers === 'boolean' ? layersRaw.markers : base.defaults.layers.markers,
        grid: typeof layersRaw.grid === 'boolean' ? layersRaw.grid : base.defaults.layers.grid,
        scale_bar: typeof layersRaw.scale_bar === 'boolean' ? layersRaw.scale_bar : base.defaults.layers.scale_bar,
      },
      coordinates: {
        precision: clampInt(coordsRaw.precision, base.defaults.coordinates.precision, 0, 12),
      },
      measurements: {
        grid: {
          mode,
          ...(stepM ? { step_m: stepM } : {}),
          color: normalizeHexColor(gridRaw.color, base.defaults.measurements.grid.color),
          width_px: clampInt(gridRaw.width_px, base.defaults.measurements.grid.width_px, 1, 8),
          line_style: normalizeGridLineStyle(gridRaw.line_style, base.defaults.measurements.grid.line_style),
        },
        segment_lengths_mode: normalizeSegmentLengthsMode(
          measurementsRaw.segment_lengths_mode,
          base.defaults.measurements.segment_lengths_mode,
        ),
      },
      styles: {
        track: {
          color: normalizeHexColor(trackStyleRaw.color, base.defaults.styles.track.color),
          width_px: clampInt(trackStyleRaw.width_px, base.defaults.styles.track.width_px, 1, 20),
        },
        route: {
          color: normalizeHexColor(routeStyleRaw.color, base.defaults.styles.route.color),
          width_px: clampInt(routeStyleRaw.width_px, base.defaults.styles.route.width_px, 1, 20),
        },
        survey_area: {
          stroke_color: normalizeHexColor(surveyStyleRaw.stroke_color, base.defaults.styles.survey_area.stroke_color),
          stroke_width_px: clampInt(surveyStyleRaw.stroke_width_px, base.defaults.styles.survey_area.stroke_width_px, 1, 20),
          fill_color: normalizeHexColor(surveyStyleRaw.fill_color, base.defaults.styles.survey_area.fill_color),
          fill_opacity: (() => {
            const v = typeof surveyStyleRaw.fill_opacity === 'number' ? surveyStyleRaw.fill_opacity : NaN;
            if (!Number.isFinite(v)) return base.defaults.styles.survey_area.fill_opacity;
            return Math.max(0, Math.min(1, v));
          })(),
        },
        lane: {
          color: normalizeHexColor(laneStyleRaw.color, base.defaults.styles.lane.color),
          width_px: clampInt(laneStyleRaw.width_px, base.defaults.styles.lane.width_px, 1, 20),
          ...(typeof laneStyleRaw.dash === 'string' ? { dash: laneStyleRaw.dash } : {}),
        },
        marker: {
          color: normalizeHexColor(markerStyleRaw.color, base.defaults.styles.marker.color),
        },
      },
    },
  };
};

const readMissionStyleColor = (style: unknown): string | null => {
  if (!isRecord(style)) return null;
  if (typeof style.color === 'string') return style.color;
  return null;
};

const readMissionStyleNumber = (style: unknown, key: string): number | null => {
  if (!isRecord(style)) return null;
  const v = style[key];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return null;
};

export const mergeDefaultsWithMissionUi = (defaults: AppUiDefaults, ui: MissionUiState | undefined): AppUiDefaults => {
  const layers = ui?.layers;
  const measurements = ui?.measurements;
  const grid = measurements?.grid;
  const styles = ui?.styles;
  const coords = ui?.coordinates;

  const gridMode: GridMode = grid?.mode === 'manual' ? 'manual' : defaults.measurements.grid.mode;
  const gridStepM = gridMode === 'manual'
    ? clampInt(grid?.step_m, defaults.measurements.grid.step_m ?? 50, 1, 1_000_000)
    : undefined;

  const merged: AppUiDefaults = {
    ...defaults,
    follow_diver: ui?.follow_diver ?? defaults.follow_diver,
    layers: {
      track: layers?.track ?? defaults.layers.track,
      routes: layers?.routes ?? defaults.layers.routes,
      markers: layers?.markers ?? defaults.layers.markers,
      grid: layers?.grid ?? defaults.layers.grid,
      scale_bar: layers?.scale_bar ?? defaults.layers.scale_bar,
    },
    coordinates: {
      precision: clampInt(coords?.precision, defaults.coordinates.precision, 0, 12),
    },
    measurements: {
      grid: {
        mode: gridMode,
        ...(gridMode === 'manual' && gridStepM ? { step_m: gridStepM } : {}),
        color: normalizeHexColor(grid?.color, defaults.measurements.grid.color),
        width_px: clampInt(grid?.width_px, defaults.measurements.grid.width_px, 1, 8),
        line_style: normalizeGridLineStyle(grid?.line_style, defaults.measurements.grid.line_style),
      },
      segment_lengths_mode: normalizeSegmentLengthsMode(
        measurements?.segment_lengths_mode,
        defaults.measurements.segment_lengths_mode,
      ),
    },
    styles: {
      track: {
        color: normalizeHexColor(readMissionStyleColor(styles?.track), defaults.styles.track.color),
        width_px: clampInt(readMissionStyleNumber(styles?.track, 'width_px'), defaults.styles.track.width_px, 1, 20),
      },
      route: {
        color: normalizeHexColor(readMissionStyleColor(styles?.route), defaults.styles.route.color),
        width_px: clampInt(readMissionStyleNumber(styles?.route, 'width_px'), defaults.styles.route.width_px, 1, 20),
      },
      survey_area: {
        stroke_color: normalizeHexColor(
          (isRecord(styles?.survey_area) ? styles?.survey_area?.stroke_color : null),
          defaults.styles.survey_area.stroke_color,
        ),
        stroke_width_px: clampInt(
          (isRecord(styles?.survey_area) ? styles?.survey_area?.stroke_width_px : null),
          defaults.styles.survey_area.stroke_width_px,
          1,
          20,
        ),
        fill_color: normalizeHexColor(
          (isRecord(styles?.survey_area) ? styles?.survey_area?.fill_color : null),
          defaults.styles.survey_area.fill_color,
        ),
        fill_opacity: (() => {
          const v = isRecord(styles?.survey_area) ? styles?.survey_area?.fill_opacity : null;
          if (typeof v !== 'number' || !Number.isFinite(v)) return defaults.styles.survey_area.fill_opacity;
          return Math.max(0, Math.min(1, v));
        })(),
      },
      lane: {
        color: normalizeHexColor(readMissionStyleColor(styles?.lane), defaults.styles.lane.color),
        width_px: clampInt(readMissionStyleNumber(styles?.lane, 'width_px'), defaults.styles.lane.width_px, 1, 20),
        ...(isRecord(styles?.lane) && typeof styles.lane.dash === 'string' ? { dash: styles.lane.dash } : {}),
      },
      marker: {
        color: normalizeHexColor(readMissionStyleColor(styles?.marker), defaults.styles.marker.color),
      },
    },
  };

  return merged;
};
