import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import TopToolbar from '@/components/map/TopToolbar';
import RightPanel, { type RightPanelSectionsCollapsedState } from '@/components/map/RightPanel';
import LeftPanel, { type LeftPanelSectionsCollapsedState } from '@/components/map/LeftPanel';
import StatusBar from '@/components/map/StatusBar';
import MapCanvas from '@/components/map/MapCanvas';
import MapWorkspaceFrame, { type MapPanelsCollapsedState } from '@/components/map/MapWorkspaceFrame';
import CreateMissionDialog from '@/components/dialogs/CreateMissionDialog';
import OpenMissionDialog from '@/components/dialogs/OpenMissionDialog';
import ExportDialog from '@/components/dialogs/ExportDialog';
import SettingsDialog from '@/components/dialogs/SettingsDialog';
import OfflineMapsDialog from '@/components/dialogs/OfflineMapsDialog';
import CoordinateBuilderDialog from '@/components/dialogs/CoordinateBuilderDialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { MapObject, MapObjectGeometry, Tool } from '@/features/map/model/types';
import type { CrsId } from '@/features/geo/crs';
import type { CoordinateInputFormat } from '@/features/geo/coordinateInputFormat';

import {
  buildEquipmentRuntime,
  EQUIPMENT_RUNTIME_STORAGE_KEY,
  EQUIPMENT_SETTINGS_STORAGE_KEY,
  loadDeviceSchemas,
  normalizeEquipmentSettings,
} from '@/features/devices';
import {
  buildTrackSegments,
  bundleToMapObjects,
  cascadeDeleteZone,
  clearZoneLanesOutdated,
  loadDraftSession,
  computeRealtimeVisibilityState,
  countZoneLanes,
  createElectronGnssComTelemetryProvider,
  createElectronGnssTelemetryProvider,
  createElectronZimaTelemetryProvider,
  createDefaultDivers,
  createMissionRepository,
  resolveDraftLoadMode,
  createSimulationTelemetryProvider,
  createTrackRecorderState,
  didZoneLaneInputsChange,
  filterVisibleTrackSegments,
  generateLanesFromZoneObject,
  isConvexZonePolygon,
  markZoneLanesOutdated,
  mapObjectsToGeoJson,
  normalizeDivers,
  toConvexZonePolygon,
  replaceZoneLanes,
  trackRecorderReduce,
  type DiverUiConfig,
  type LaneFeature,
  type MissionBundle,
  type MissionDocument,
  type MissionUiState,
  type NavigationSourceId,
  type SegmentLengthsMode,
  type RealtimeUiConnectionState,
  type TelemetryConnectionState,
  type TelemetryFix,
  type TrackRecorderState,
  type DraftLoadMode,
} from '@/features/mission';
import {
  APP_SETTINGS_STORAGE_KEY,
  createDefaultAppSettings,
  mergeDefaultsWithMissionUi,
  normalizeAppSettings,
  type AppSettingsV1,
  type AppUiDefaults,
} from '@/features/settings';
import {
  joinPath as joinExportPath,
  markersToCsv,
  markersToGpx,
  routesToCsv,
  routesToGpx,
  routesToKml,
  safeFilename,
  tracksToCsv,
  tracksToGpx,
  tracksToKml,
  type ExportRequest,
} from '@/features/export';
import { platform } from '@/platform';
import { toast } from '@/hooks/use-toast';
import { arrayBufferToBase64, base64ToBlob, base64ToUint8Array } from '@/features/map/rasterOverlays/base64';
import { assertBoundsWithinEpsg4326, isBoundsWithinEpsg4326 } from '@/features/map/rasterOverlays/bounds';
import { parseGeoTiffMetadata, parseTiffCoreMetadata } from '@/features/map/rasterOverlays/parseGeoTiff';
import { convertUtmBoundsToEpsg4326, convertWebMercatorBoundsToEpsg4326 } from '@/features/map/rasterOverlays/projection';
import { computeBoundsFromTfw, parseTfw } from '@/features/map/rasterOverlays/parseTfw';
import { moveRasterOverlayByDelta } from '@/features/map/rasterOverlays/reorder';
import { parseDxfToWgs84, type DxfOverlayFeatureCollection } from '@/features/map/dxfOverlay/parseDxf';
import { parseDwgToWgs84 } from '@/features/map/dwgOverlay/parseDwg';
import {
  parseVectorOverlayCache,
  serializeVectorOverlayCache,
  type VectorOverlayCacheSourceMeta,
  type VectorOverlayMapData,
} from '@/features/map/vectorOverlays/cache';

const DRAFT_ROOT_PATH = 'draft/current';
const DRAFT_MISSION_NAME = 'Черновик';
const CONNECTION_TIMEOUT_MS = 5000;
const WAL_STAGE_DELAY_MS = 250;
const AUTOSAVE_DELAY_MS = 900;
const BASE_STATION_AGENT_ID = 'base-station';
const OVERLAYS_DIR = 'overlays';
const OVERLAYS_RASTER_DIR = `${OVERLAYS_DIR}/rasters`;
const OVERLAYS_VECTOR_DIR = `${OVERLAYS_DIR}/vectors`;
const createOverlayId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const decodeTiffToPngBlobInRenderer = async (tiffBase64: string): Promise<Blob | null> => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  const ImageDecoderCtor = (window as unknown as { ImageDecoder?: unknown }).ImageDecoder as
    | (new (init: { data: Uint8Array; type: string }) => {
        decode: (options?: { frameIndex?: number }) => Promise<{
          image: {
            displayWidth?: number;
            displayHeight?: number;
            codedWidth?: number;
            codedHeight?: number;
            close?: () => void;
          };
        }>;
        close?: () => void;
      })
    | undefined;
  if (!ImageDecoderCtor) return null;

  try {
    const isTypeSupported = (ImageDecoderCtor as unknown as {
      isTypeSupported?: (mimeType: string) => Promise<boolean>;
    }).isTypeSupported;
    if (typeof isTypeSupported === 'function') {
      const supported = await isTypeSupported('image/tiff');
      if (!supported) return null;
    }

    const decoder = new ImageDecoderCtor({
      data: base64ToUint8Array(tiffBase64),
      type: 'image/tiff',
    });
    const frame = await decoder.decode({ frameIndex: 0 });
    const image = frame.image;
    const width = image.displayWidth ?? image.codedWidth ?? 0;
    const height = image.displayHeight ?? image.codedHeight ?? 0;
    if (width <= 0 || height <= 0) {
      image.close?.();
      decoder.close?.();
      return null;
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      image.close?.();
      decoder.close?.();
      return null;
    }
    ctx.drawImage(image as unknown as CanvasImageSource, 0, 0, width, height);
    image.close?.();
    decoder.close?.();

    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    });
  } catch {
    return null;
  }
};

const canRenderBlob = async (blob: Blob): Promise<boolean> => {
  if (typeof window === 'undefined' || typeof Image === 'undefined') return true;
  const objectUrl = URL.createObjectURL(blob);
  try {
    return await new Promise<boolean>((resolve) => {
      const img = new Image();
      let settled = false;
      const finish = (value: boolean) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      img.onload = () => finish(true);
      img.onerror = () => finish(false);
      img.src = objectUrl;
      window.setTimeout(() => finish(false), 4000);
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const MAX_RASTER_INPUT_FILE_BYTES = 180 * 1024 * 1024;
const MAX_RASTER_INPUT_PIXEL_COUNT = 900_000_000;
const RASTER_RENDER_PROGRESS_TOAST_DURATION_MS = 2_147_483_647;
const VECTOR_RENDER_PROGRESS_TOAST_DURATION_MS = 2_147_483_647;
const SUPPORTED_TIFF_COMPRESSION_CODES = new Set([1, 5, 8, 32946, 32773]);

type RasterDecodeHints = {
  width: number;
  height: number;
  pixelCount: number;
  compression: number | null;
};

const estimateBase64ByteLength = (base64: string): number => {
  const value = base64.trim();
  if (!value) return 0;
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((value.length * 3) / 4) - padding);
};

const readTiffCompressionTag = (buffer: ArrayBuffer): number | null => {
  if (buffer.byteLength < 8) return null;
  const view = new DataView(buffer);
  const byteOrderMark = String.fromCharCode(view.getUint8(0)) + String.fromCharCode(view.getUint8(1));
  const littleEndian = byteOrderMark === 'II' ? true : byteOrderMark === 'MM' ? false : null;
  if (littleEndian === null) return null;

  const readU16 = (offset: number): number => view.getUint16(offset, littleEndian);
  const readU32 = (offset: number): number => view.getUint32(offset, littleEndian);

  if (readU16(2) !== 42) return null;
  const ifdOffset = readU32(4);
  if (ifdOffset + 2 > buffer.byteLength) return null;
  const entriesCount = readU16(ifdOffset);

  let cursor = ifdOffset + 2;
  for (let i = 0; i < entriesCount; i += 1) {
    if (cursor + 12 > buffer.byteLength) break;
    const tag = readU16(cursor);
    const type = readU16(cursor + 2);
    const count = readU32(cursor + 4);
    const valueOffset = cursor + 8;

    if (tag === 259 && count >= 1) {
      if (type === 3) {
        if (count * 2 <= 4) {
          return readU16(valueOffset);
        }
        const pointer = readU32(valueOffset);
        if (pointer + 2 > buffer.byteLength) return null;
        return readU16(pointer);
      }
      if (type === 4) {
        if (count * 4 <= 4) {
          return readU32(valueOffset);
        }
        const pointer = readU32(valueOffset);
        if (pointer + 4 > buffer.byteLength) return null;
        return readU32(pointer);
      }
      return null;
    }

    cursor += 12;
  }

  return null;
};

const extractRasterDecodeHints = (rawBase64: string): RasterDecodeHints | null => {
  try {
    const bytes = base64ToUint8Array(rawBase64);
    const buffer = toPlainArrayBuffer(bytes);
    const core = parseTiffCoreMetadata(buffer);
    const pixelCount = core.width * core.height;
    return {
      width: core.width,
      height: core.height,
      pixelCount,
      compression: readTiffCompressionTag(buffer),
    };
  } catch {
    return null;
  }
};

const classifyRasterDecodeFailure = (
  rawBase64: string,
  hints: RasterDecodeHints | null,
  stage: 'missing-file' | 'decode-failed',
): string => {
  if (stage === 'missing-file') {
    return 'Файл растра не найден в папке миссии.';
  }

  const sizeBytes = estimateBase64ByteLength(rawBase64);
  if (sizeBytes > MAX_RASTER_INPUT_FILE_BYTES) {
    const sizeMb = (sizeBytes / (1024 * 1024)).toFixed(1);
    const limitMb = (MAX_RASTER_INPUT_FILE_BYTES / (1024 * 1024)).toFixed(0);
    return `Слишком большой файл TIFF (${sizeMb} MB). Лимит отображения: ${limitMb} MB.`;
  }

  if (hints && hints.pixelCount > MAX_RASTER_INPUT_PIXEL_COUNT) {
    return `Слишком большое разрешение TIFF (${hints.width}x${hints.height}).`;
  }

  if (hints?.compression !== null && !SUPPORTED_TIFF_COMPRESSION_CODES.has(hints.compression)) {
    return `Неподдерживаемый тип сжатия TIFF (Compression=${hints.compression}).`;
  }

  return 'Не удалось декодировать TIFF для отображения (профиль/данные не поддержаны).';
};

const DEFAULT_APP_SETTINGS = createDefaultAppSettings();
const DEFAULT_BASE_STATION_TRACK_COLOR = DEFAULT_APP_SETTINGS.defaults.styles.track.color;
const DEFAULT_BASE_STATION_MARKER_SIZE_PX = 34;
const DEFAULT_LEFT_PANEL_WIDTH_PX = 224;
const DEFAULT_RIGHT_PANEL_WIDTH_PX = 256;
const MIN_SIDE_PANEL_WIDTH_PX = 180;
const MAX_SIDE_PANEL_WIDTH_PX = 520;

const clampSidePanelWidthPx = (value: unknown, fallback: number): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(MIN_SIDE_PANEL_WIDTH_PX, Math.min(MAX_SIDE_PANEL_WIDTH_PX, Math.round(n)));
};

type LayersState = {
  basemap: boolean;
  track: boolean;
  routes: boolean;
  markers: boolean;
  baseStation: boolean;
  grid: boolean;
  scaleBar: boolean;
  diver: boolean;
};

type BaseStationTelemetryState = {
  lat: number;
  lon: number;
  speed: number;
  course: number;
  heading: number | null;
  depth: number;
  received_at: number;
  sourceId: NavigationSourceId | null;
};

type WorkspaceSnapshot = {
  missionRootPath: string | null;
  recordingState: TrackRecorderState;
  objects: MapObject[];
  laneFeatures: LaneFeature[];
  isFollowing: boolean;
  layers: LayersState;
  divers: DiverUiConfig[];
  baseStationNavigationSource: NavigationSourceId | null;
  baseStationTrackColor: string;
  baseStationMarkerSizePx: number;
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
  isLoaded: boolean;
};

type MapBounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

type RasterOverlayUi = NonNullable<MissionUiState['raster_overlays']>[number];
type VectorOverlayUi = NonNullable<MissionUiState['vector_overlays']>[number];
const DEFAULT_VECTOR_OVERLAY_COLOR = '#0f766e';

const computeVectorOverlayBounds = (features: DxfOverlayFeatureCollection['features']): MapBounds | null => {
  const lats: number[] = [];
  const lons: number[] = [];
  for (const feature of features) {
    if (feature.type === 'point') {
      lats.push(feature.point.lat);
      lons.push(feature.point.lon);
      continue;
    }
    for (const point of feature.points) {
      lats.push(point.lat);
      lons.push(point.lon);
    }
  }

  if (lats.length === 0 || lons.length === 0) return null;
  return {
    north: Math.max(...lats),
    south: Math.min(...lats),
    east: Math.max(...lons),
    west: Math.min(...lons),
  };
};

const toPlainArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
};

const resolveVectorOverlayFileEncoding = (
  overlay: Pick<VectorOverlayUi, 'type' | 'file_encoding'>,
): 'utf8' | 'base64' => {
  if (overlay.file_encoding === 'utf8' || overlay.file_encoding === 'base64') {
    return overlay.file_encoding;
  }
  return overlay.type === 'dwg' ? 'base64' : 'utf8';
};

const resolveVectorOverlayCacheFilePath = (overlay: Pick<VectorOverlayUi, 'id' | 'file' | 'cache_file'>): string => {
  if (typeof overlay.cache_file === 'string' && overlay.cache_file.trim().length > 0) {
    return overlay.cache_file;
  }
  const sourceFile = typeof overlay.file === 'string' ? overlay.file.trim() : '';
  const slashIndex = sourceFile.lastIndexOf('/');
  if (slashIndex > 0) {
    const dir = sourceFile.slice(0, slashIndex);
    return `${dir}/${overlay.id}.vector-cache.json`;
  }
  return `${OVERLAYS_VECTOR_DIR}/${overlay.id}.vector-cache.json`;
};

const toVectorOverlayCacheSourceMeta = (overlay: VectorOverlayUi): VectorOverlayCacheSourceMeta => ({
  file: overlay.file,
  type: overlay.type,
  fileEncoding: resolveVectorOverlayFileEncoding(overlay),
  utmZone: overlay.utm_zone,
  utmHemisphere: overlay.utm_hemisphere,
});

const parseVectorOverlayFromSourceFile = async (
  missionRootPath: string,
  overlay: VectorOverlayUi,
): Promise<VectorOverlayMapData> => {
  const raw = await platform.fileStore.readText(`${missionRootPath}/${overlay.file}`);
  if (!raw) {
    throw new Error('Файл слоя не найден.');
  }

  const hemisphere = overlay.utm_hemisphere === 'S' ? 'south' : 'north';
  const parsed =
    overlay.type === 'dwg'
      ? await parseDwgToWgs84(
          (() => {
            const bytes = base64ToUint8Array(raw);
            return toPlainArrayBuffer(bytes);
          })(),
          { zone: overlay.utm_zone, hemisphere },
        )
      : parseDxfToWgs84(raw, { zone: overlay.utm_zone, hemisphere });
  const bounds = computeVectorOverlayBounds(parsed.features);
  if (!bounds) {
    throw new Error('В CAD-файле не найдена поддерживаемая геометрия.');
  }

  return { features: parsed.features, bounds };
};

const DEFAULT_DIVER_DATA = {
  lat: 59.93428,
  lon: 30.335099,
  speed: 0.8,
  course: 45,
  depth: 12.5,
};

const DEFAULT_LAYERS: LayersState = {
  basemap: true,
  track: true,
  routes: true,
  markers: true,
  baseStation: true,
  grid: false,
  scaleBar: true,
  diver: true,
};

const DEFAULT_MAP_PANELS_COLLAPSED: MapPanelsCollapsedState = {
  top: false,
  left: false,
  right: false,
};

const DEFAULT_LEFT_PANEL_SECTIONS_COLLAPSED: LeftPanelSectionsCollapsedState = {
  layers: false,
  agents: false,
  rasters: false,
  vectors: false,
  objects: false,
};

const DEFAULT_RIGHT_PANEL_SECTIONS_COLLAPSED: RightPanelSectionsCollapsedState = {
  hud: false,
  status: false,
  properties: false,
};

const toMissionUiFromDefaults = (defaults: AppUiDefaults): MissionUiState => ({
  follow_diver: defaults.follow_diver,
  hidden_track_ids: [],
  raster_overlays: [],
  vector_overlays: [],
  divers: createDefaultDivers(1),
  layers: { ...defaults.layers, basemap: true },
  left_panel_sections: { ...DEFAULT_LEFT_PANEL_SECTIONS_COLLAPSED },
  right_panel_sections: { ...DEFAULT_RIGHT_PANEL_SECTIONS_COLLAPSED },
  panel_layout: {
    left_width_px: DEFAULT_LEFT_PANEL_WIDTH_PX,
    right_width_px: DEFAULT_RIGHT_PANEL_WIDTH_PX,
    left_collapsed: false,
    right_collapsed: false,
  },
  base_station: {
    navigation_source: null,
    track_color: defaults.styles.track.color,
  },
  coordinates: { precision: defaults.coordinates.precision },
  measurements: {
    grid: { ...defaults.measurements.grid },
    segment_lengths_mode: defaults.measurements.segment_lengths_mode,
  },
  styles: {
    track: { ...defaults.styles.track },
    route: { ...defaults.styles.route },
    survey_area: { ...defaults.styles.survey_area },
    lane: { ...defaults.styles.lane },
    marker: { ...defaults.styles.marker },
  },
});

type ElectronZimaTelemetryConfig = {
  ipAddress: string;
  dataPort: number;
  commandPort: number;
  useCommandPort: boolean;
  useExternalGnss: boolean;
  latitude: number | null;
  longitude: number | null;
  azimuth: number | null;
};

type ElectronGnssTelemetryConfig = {
  ipAddress: string;
  dataPort: number;
};

type ElectronGnssComTelemetryConfig = {
  autoDetectPort: boolean;
  comPort: string;
  baudRate: number;
  navigationSourceId: string;
};

type DiverTelemetryState = {
  lat: number;
  lon: number;
  speed: number;
  course: number;
  heading: number | null;
  depth: number;
  received_at: number;
};

type ProviderSourceId = 'zima2r' | 'gnss-udp' | 'gnss-com' | 'simulation';
type DeviceProviderSourceId = Exclude<ProviderSourceId, 'simulation'>;
type ElectronLifecycleApi = {
  onPrepareClose: (listener: (payload: { token?: string }) => void) => () => void;
  resolvePrepareClose: (payload: { token: string; ok: boolean; error?: string }) => void;
};

type EquipmentNavigationSourceOption = {
  id: NavigationSourceId;
  label: string;
  schemaId: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizePort = (value: unknown, fallback: number): number => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 65535) return fallback;
  return n;
};

const normalizePositiveInt = (value: unknown, fallback: number, max: number): number => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > max) return fallback;
  return n;
};

const normalizeBoolean = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return fallback;
};

const normalizeNullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
};

const normalizeZimaTelemetryConfig = (raw: unknown): ElectronZimaTelemetryConfig | null => {
  if (!isRecord(raw)) return null;

  const ipAddressRaw = typeof raw.ipAddress === 'string' ? raw.ipAddress.trim() : '';
  return {
    ipAddress: ipAddressRaw || '127.0.0.1',
    dataPort: normalizePort(raw.dataPort, 28127),
    commandPort: normalizePort(raw.commandPort, 28128),
    useCommandPort: normalizeBoolean(raw.useCommandPort, false),
    useExternalGnss: normalizeBoolean(raw.useExternalGnss, false),
    latitude: normalizeNullableNumber(raw.latitude),
    longitude: normalizeNullableNumber(raw.longitude),
    azimuth: normalizeNullableNumber(raw.azimuth),
  };
};

const normalizeGnssTelemetryConfig = (raw: unknown): ElectronGnssTelemetryConfig | null => {
  if (!isRecord(raw)) return null;

  const ipAddressRaw = typeof raw.ipAddress === 'string' ? raw.ipAddress.trim() : '';
  return {
    ipAddress: ipAddressRaw || '127.0.0.1',
    dataPort: normalizePort(raw.dataPort, 28128),
  };
};

const normalizeGnssComTelemetryConfig = (raw: unknown): ElectronGnssComTelemetryConfig | null => {
  if (!isRecord(raw)) return null;

  const comPort = typeof raw.comPort === 'string' ? raw.comPort.trim() : '';
  const instanceIdRaw = typeof raw.instance_id === 'string' ? raw.instance_id.trim() : '';
  return {
    autoDetectPort: normalizeBoolean(raw.autoDetectPort, true),
    comPort,
    baudRate: normalizePositiveInt(raw.baudRate, 115200, 4_000_000),
    navigationSourceId: instanceIdRaw || 'gnss-com',
  };
};

const normalizeNavigationSourceId = (value: unknown): NavigationSourceId | null => {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
};

const isMissionFileMissingError = (error: unknown): boolean => {
  return error instanceof Error && /Mission file not found/i.test(error.message);
};

const getElectronLifecycleApi = (): ElectronLifecycleApi | null => {
  const api = (window as unknown as { electronAPI?: { lifecycle?: ElectronLifecycleApi } }).electronAPI?.lifecycle;
  if (!api) return null;
  if (typeof api.onPrepareClose !== 'function') return null;
  if (typeof api.resolvePrepareClose !== 'function') return null;
  return api;
};

const normalizeBeaconBindingKey = (value: unknown): string | null => {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  const n = Number(normalized);
  if (!Number.isInteger(n) || n < 0 || n > 15) return null;
  return String(n);
};

const isSameTelemetryState = (
  a: DiverTelemetryState | undefined,
  b: DiverTelemetryState | undefined,
): boolean => {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    a.lat === b.lat &&
    a.lon === b.lon &&
    a.speed === b.speed &&
    a.course === b.course &&
    a.heading === b.heading &&
    a.depth === b.depth &&
    a.received_at === b.received_at
  );
};

const MapWorkspace = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isElectronRuntime = platform.runtime.isElectron;
  const showSimulationControls = !isElectronRuntime;
  const repository = useMemo(() => createMissionRepository(platform.fileStore), []);
  const deviceSchemas = useMemo(() => loadDeviceSchemas(), []);
  const loadActiveEquipmentProfile = useCallback(async () => {
    const equipmentRaw = await platform.settings.readJson<unknown>(EQUIPMENT_SETTINGS_STORAGE_KEY);
    const normalized = normalizeEquipmentSettings(equipmentRaw, deviceSchemas);
    const selectedProfile =
      normalized.profiles.find((profile) => profile.id === normalized.selected_profile_id) ?? normalized.profiles[0] ?? null;
    const instanceOptions: EquipmentNavigationSourceOption[] = [];
    if (selectedProfile) {
      for (const instanceId of selectedProfile.device_instance_ids) {
        const instance = normalized.device_instances[instanceId];
        if (!instance) continue;
        const schema = deviceSchemas.find((item) => item.id === instance.schema_id);
        const schemaLabel = schema?.title ?? instance.schema_id;
        const instanceLabel = instance.name?.trim() || schemaLabel;
        instanceOptions.push({
          id: instance.id,
          label: instanceLabel,
          schemaId: instance.schema_id,
        });
      }
    }
    setSelectedEquipmentProfileName(selectedProfile?.name ?? 'Не выбрано');
    setSelectedEquipmentNavigationOptions(instanceOptions);
    setEquipmentEnabledBySource((prev) => {
      const next: Record<string, boolean> = {};
      for (const option of instanceOptions) {
        // New devices are disabled by default until user explicitly enables them.
        next[option.id] = prev[option.id] ?? false;
      }
      return next;
    });
  }, [deviceSchemas]);

  const readElectronZimaConfig = useCallback(async (): Promise<ElectronZimaTelemetryConfig | null> => {
    const runtimeRaw = await platform.settings.readJson<unknown>(EQUIPMENT_RUNTIME_STORAGE_KEY);
    if (isRecord(runtimeRaw)) {
      const runtimeConfig = normalizeZimaTelemetryConfig(runtimeRaw.zima);
      if (runtimeConfig) {
        return runtimeConfig;
      }
    }

    const settingsRaw = await platform.settings.readJson<unknown>(EQUIPMENT_SETTINGS_STORAGE_KEY);
    const normalizedSettings = normalizeEquipmentSettings(settingsRaw, deviceSchemas);
    const runtime = buildEquipmentRuntime(normalizedSettings, deviceSchemas);
    return normalizeZimaTelemetryConfig(runtime.zima);
  }, [deviceSchemas]);
  const readElectronGnssConfig = useCallback(async (): Promise<ElectronGnssTelemetryConfig | null> => {
    const runtimeRaw = await platform.settings.readJson<unknown>(EQUIPMENT_RUNTIME_STORAGE_KEY);
    if (isRecord(runtimeRaw)) {
      const runtimeConfig = normalizeGnssTelemetryConfig(runtimeRaw.gnss_udp);
      if (runtimeConfig) {
        return runtimeConfig;
      }
    }

    const settingsRaw = await platform.settings.readJson<unknown>(EQUIPMENT_SETTINGS_STORAGE_KEY);
    const normalizedSettings = normalizeEquipmentSettings(settingsRaw, deviceSchemas);
    const runtime = buildEquipmentRuntime(normalizedSettings, deviceSchemas);
    return normalizeGnssTelemetryConfig(runtime.gnss_udp);
  }, [deviceSchemas]);
  const readElectronGnssComConfig = useCallback(async (): Promise<ElectronGnssComTelemetryConfig | null> => {
    const runtimeRaw = await platform.settings.readJson<unknown>(EQUIPMENT_RUNTIME_STORAGE_KEY);
    if (isRecord(runtimeRaw)) {
      const runtimeConfig = normalizeGnssComTelemetryConfig(runtimeRaw.gnss_com);
      if (runtimeConfig) {
        return runtimeConfig;
      }
    }

    const settingsRaw = await platform.settings.readJson<unknown>(EQUIPMENT_SETTINGS_STORAGE_KEY);
    const normalizedSettings = normalizeEquipmentSettings(settingsRaw, deviceSchemas);
    const runtime = buildEquipmentRuntime(normalizedSettings, deviceSchemas);
    return normalizeGnssComTelemetryConfig(runtime.gnss_com);
  }, [deviceSchemas]);

  const zimaTelemetryProvider = useMemo(
    () =>
      createElectronZimaTelemetryProvider({
        timeoutMs: CONNECTION_TIMEOUT_MS,
        readConfig: readElectronZimaConfig,
      }),
    [readElectronZimaConfig],
  );
  const gnssTelemetryProvider = useMemo(
    () =>
      createElectronGnssTelemetryProvider({
        timeoutMs: CONNECTION_TIMEOUT_MS,
        readConfig: readElectronGnssConfig,
      }),
    [readElectronGnssConfig],
  );
  const gnssComTelemetryProvider = useMemo(
    () =>
      createElectronGnssComTelemetryProvider({
        timeoutMs: CONNECTION_TIMEOUT_MS,
        readConfig: readElectronGnssComConfig,
      }),
    [readElectronGnssComConfig],
  );
  const simulationTelemetryProvider = useMemo(
    () => createSimulationTelemetryProvider({ timeoutMs: CONNECTION_TIMEOUT_MS }),
    [],
  );

  const [missionRootPath, setMissionRootPath] = useState<string | null>(null);
  const [missionName, setMissionName] = useState<string | null>(null);
  const [isDraft, setIsDraft] = useState(true);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [activeTool, setActiveTool] = useState<Tool>('select');
  const [pinnedAgentId, setPinnedAgentId] = useState<string | null>(null);
  const [simulationEnabled, setSimulationEnabled] = useState(!isElectronRuntime);
  const [equipmentEnabledBySource, setEquipmentEnabledBySource] = useState<Record<string, boolean>>({});
  const [selectedEquipmentProfileName, setSelectedEquipmentProfileName] = useState<string>('Не выбрано');
  const [selectedEquipmentNavigationOptions, setSelectedEquipmentNavigationOptions] = useState<
    EquipmentNavigationSourceOption[]
  >([]);
  const [simulateConnectionError, setSimulateConnectionError] = useState(false);
  const [diverData, setDiverData] = useState(DEFAULT_DIVER_DATA);
  const [hasPrimaryTelemetry, setHasPrimaryTelemetry] = useState(false);
  const [hasPrimaryTelemetryHistory, setHasPrimaryTelemetryHistory] = useState(false);
  const [diverTelemetryById, setDiverTelemetryById] = useState<Record<string, DiverTelemetryState>>({});
  const [missionDivers, setMissionDivers] = useState<DiverUiConfig[]>(() => createDefaultDivers(1));
  const [baseStationNavigationSource, setBaseStationNavigationSource] = useState<NavigationSourceId | null>(null);
  const [baseStationTrackColor, setBaseStationTrackColor] = useState<string>(DEFAULT_BASE_STATION_TRACK_COLOR);
  const [baseStationMarkerSizePx, setBaseStationMarkerSizePx] = useState<number>(DEFAULT_BASE_STATION_MARKER_SIZE_PX);
  const [hiddenTrackIds, setHiddenTrackIds] = useState<string[]>([]);
  const [rasterOverlays, setRasterOverlays] = useState<RasterOverlayUi[]>([]);
  const [rasterOverlayUrls, setRasterOverlayUrls] = useState<Record<string, string>>({});
  const [vectorOverlays, setVectorOverlays] = useState<VectorOverlayUi[]>([]);
  const [vectorOverlayDataById, setVectorOverlayDataById] = useState<Record<string, VectorOverlayMapData>>({});
  const [baseStationTelemetry, setBaseStationTelemetry] = useState<BaseStationTelemetryState | null>(null);
  const [layers, setLayers] = useState<LayersState>(DEFAULT_LAYERS);
  const [objects, setObjects] = useState<MapObject[]>([]);
  const [laneFeatures, setLaneFeatures] = useState<LaneFeature[]>([]);
  const [outdatedZoneIds, setOutdatedZoneIds] = useState<Record<string, true>>({});
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [lanePickState, setLanePickState] = useState<{ mode: 'none' | 'edge' | 'start'; zoneId: string | null }>({
    mode: 'none',
    zoneId: null,
  });
  const [showCreateMission, setShowCreateMission] = useState(false);
  const [showOpenMission, setShowOpenMission] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showOfflineMaps, setShowOfflineMaps] = useState(false);
  const [showClearMeasuresDialog, setShowClearMeasuresDialog] = useState(false);
  const [coordinateBuilderType, setCoordinateBuilderType] = useState<'route' | 'zone' | 'marker' | null>(null);
  const [cursorPosition, setCursorPosition] = useState({ lat: 59.934, lon: 30.335 });
  const [mapScale, setMapScale] = useState('1:--');
  const [mapPanelsCollapsed, setMapPanelsCollapsed] = useState<MapPanelsCollapsedState>(
    DEFAULT_MAP_PANELS_COLLAPSED,
  );
  const [leftPanelWidthPx, setLeftPanelWidthPx] = useState<number>(DEFAULT_LEFT_PANEL_WIDTH_PX);
  const [rightPanelWidthPx, setRightPanelWidthPx] = useState<number>(DEFAULT_RIGHT_PANEL_WIDTH_PX);
  const [leftPanelSectionsCollapsed, setLeftPanelSectionsCollapsed] = useState<LeftPanelSectionsCollapsedState>(
    DEFAULT_LEFT_PANEL_SECTIONS_COLLAPSED,
  );
  const [rightPanelSectionsCollapsed, setRightPanelSectionsCollapsed] = useState<RightPanelSectionsCollapsedState>(
    DEFAULT_RIGHT_PANEL_SECTIONS_COLLAPSED,
  );
  const [mapView, setMapView] = useState<MissionUiState['map_view'] | null>(null);
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null);
  const [coordPrecision, setCoordPrecision] = useState(DEFAULT_APP_SETTINGS.defaults.coordinates.precision);
  const [coordinateInputCrs, setCoordinateInputCrs] = useState<CrsId>(
    DEFAULT_APP_SETTINGS.defaults.coordinates.input_crs,
  );
  const [coordinateInputFormat, setCoordinateInputFormat] = useState<CoordinateInputFormat>(
    DEFAULT_APP_SETTINGS.defaults.coordinates.input_format,
  );
  const [gridSettings, setGridSettings] = useState<AppUiDefaults['measurements']['grid']>(
    DEFAULT_APP_SETTINGS.defaults.measurements.grid,
  );
  const [segmentLengthsMode, setSegmentLengthsMode] = useState<SegmentLengthsMode>(
    DEFAULT_APP_SETTINGS.defaults.measurements.segment_lengths_mode,
  );
  const [styles, setStyles] = useState<AppUiDefaults['styles']>(DEFAULT_APP_SETTINGS.defaults.styles);
  const [connectionSettings, setConnectionSettings] = useState<AppUiDefaults['connection']>(
    DEFAULT_APP_SETTINGS.defaults.connection,
  );
  const [centerOnObjectSelect, setCenterOnObjectSelect] = useState<boolean>(
    DEFAULT_APP_SETTINGS.defaults.interactions.center_on_object_select,
  );
  const [centerRequest, setCenterRequest] = useState<{ objectId: string; nonce: number } | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [shouldAutoStartRecording, setShouldAutoStartRecording] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<TelemetryConnectionState>('timeout');
  const [connectionLostSeconds, setConnectionLostSeconds] = useState(1);
  const [deviceConnectionStatus, setDeviceConnectionStatus] = useState<Record<DeviceProviderSourceId, TelemetryConnectionState>>({
    zima2r: 'timeout',
    'gnss-udp': 'timeout',
    'gnss-com': 'timeout',
  });
  const [simulationConnectionStatus, setSimulationConnectionStatus] = useState<TelemetryConnectionState>('timeout');
  const [deviceConnectionLostSeconds, setDeviceConnectionLostSeconds] = useState<Record<DeviceProviderSourceId, number>>({
    zima2r: 1,
    'gnss-udp': 1,
    'gnss-com': 1,
  });
  const [recordingState, setRecordingState] = useState<TrackRecorderState>(() =>
    createTrackRecorderState(null, {}, {}),
  );

  const missionDocument = recordingState.mission;
  const trackPointsByTrackId = recordingState.trackPointsByTrackId;
  const trackStatus = recordingState.trackStatus;
  const trackStatusByAgentId = recordingState.trackStatusByAgentId;

  const lockOwnerRootRef = useRef<string | null>(null);
  const prepareCloseInFlightRef = useRef<Promise<void> | null>(null);
  const walStageTimerRef = useRef<number | null>(null);
  const autosaveTimerRef = useRef<number | null>(null);
  const lastFixAtRef = useRef<number>(Date.now());
  const connectionStateRef = useRef<TelemetryConnectionState>('timeout');
  const primaryNavigationSourceRef = useRef<NavigationSourceId>('simulation');
  const lastFixAtBySourceRef = useRef<Record<ProviderSourceId, number>>({
    zima2r: Date.now(),
    'gnss-udp': Date.now(),
    'gnss-com': Date.now(),
    simulation: Date.now(),
  });
  const hadFixBySourceRef = useRef<Record<ProviderSourceId, boolean>>({
    zima2r: false,
    'gnss-udp': false,
    'gnss-com': false,
    simulation: false,
  });
  const zimaAzmLocFixRef = useRef<DiverTelemetryState | null>(null);
  const zimaRemFixByBeaconRef = useRef<Record<string, DiverTelemetryState>>({});
  const gnssFixRef = useRef<DiverTelemetryState | null>(null);
  const gnssComFixRef = useRef<DiverTelemetryState | null>(null);
  const simulationFixRef = useRef<DiverTelemetryState | null>(null);
  const lastRecordedPrimaryFixAtRef = useRef<number>(0);
  const lastRecordedFixByAgentRef = useRef<Record<string, number>>({});
  const missionDiversRef = useRef<DiverUiConfig[]>(createDefaultDivers(1));
  const appSettingsRef = useRef<AppSettingsV1>(DEFAULT_APP_SETTINGS);
  const appSettingsReadyRef = useRef(false);
  const latestSnapshotRef = useRef<WorkspaceSnapshot>({
    missionRootPath: null,
    recordingState: createTrackRecorderState(null, {}, {}),
    objects: [],
    laneFeatures: [],
    isFollowing: false,
    layers: DEFAULT_LAYERS,
    divers: createDefaultDivers(1),
    baseStationNavigationSource: null,
    baseStationTrackColor: DEFAULT_BASE_STATION_TRACK_COLOR,
    baseStationMarkerSizePx: DEFAULT_BASE_STATION_MARKER_SIZE_PX,
    hiddenTrackIds: [],
    rasterOverlays: [],
    vectorOverlays: [],
    leftPanelSectionsCollapsed: DEFAULT_LEFT_PANEL_SECTIONS_COLLAPSED,
    rightPanelSectionsCollapsed: DEFAULT_RIGHT_PANEL_SECTIONS_COLLAPSED,
    leftPanelWidthPx: DEFAULT_LEFT_PANEL_WIDTH_PX,
    rightPanelWidthPx: DEFAULT_RIGHT_PANEL_WIDTH_PX,
    mapPanelsCollapsed: DEFAULT_MAP_PANELS_COLLAPSED,
    baseStationTelemetry: null,
    mapView: null,
    coordPrecision: DEFAULT_APP_SETTINGS.defaults.coordinates.precision,
    grid: DEFAULT_APP_SETTINGS.defaults.measurements.grid,
    segmentLengthsMode: DEFAULT_APP_SETTINGS.defaults.measurements.segment_lengths_mode,
    styles: DEFAULT_APP_SETTINGS.defaults.styles,
    isLoaded: false,
  });

  const hiddenTrackIdSet = useMemo(() => new Set(hiddenTrackIds), [hiddenTrackIds]);

  const trackSegments = useMemo(() => {
    const segments = buildTrackSegments(trackPointsByTrackId);
    const fallbackColor = styles.track.color;
    const trackMetaById = new Map(missionDocument?.tracks.map((track) => [track.id, track]) ?? []);

    return segments.map((segment) => {
      const meta = trackMetaById.get(segment.trackId);
      const color = meta?.color ?? fallbackColor;
      return { trackId: segment.trackId, points: segment.points, color };
    });
  }, [missionDocument?.tracks, styles.track.color, trackPointsByTrackId]);
  const visibleTrackSegments = useMemo(
    () => filterVisibleTrackSegments(trackSegments, hiddenTrackIdSet),
    [hiddenTrackIdSet, trackSegments],
  );
  const rasterOverlaysForMap = useMemo(
    () =>
      rasterOverlays.map((overlay) => ({
        id: overlay.id,
        name: overlay.name,
        url: rasterOverlayUrls[overlay.id] ?? '',
        bounds: overlay.bounds,
        opacity: overlay.opacity,
        visible: overlay.visible,
        zIndex: overlay.z_index,
      })),
    [rasterOverlayUrls, rasterOverlays],
  );
  const vectorOverlaysForMap = useMemo(
    () =>
      vectorOverlays.map((overlay) => ({
        id: overlay.id,
        name: overlay.name,
        color: overlay.color ?? DEFAULT_VECTOR_OVERLAY_COLOR,
        opacity: overlay.opacity,
        visible: overlay.visible,
        zIndex: overlay.z_index,
        features: vectorOverlayDataById[overlay.id]?.features ?? [],
      })),
    [vectorOverlayDataById, vectorOverlays],
  );
  const activeTrackNumber = useMemo(() => {
    if (!missionDocument) return 0;
    if (!missionDocument.active_track_id) return missionDocument.tracks.length;
    const index = missionDocument.tracks.findIndex((track) => track.id === missionDocument.active_track_id);
    return index >= 0 ? index + 1 : missionDocument.tracks.length;
  }, [missionDocument]);

  // Selected agent derived values
  const selectedAgent = useMemo(() => {
    if (!selectedAgentId) return null;
    if (selectedAgentId === BASE_STATION_AGENT_ID) {
      return {
        uid: BASE_STATION_AGENT_ID,
        id: BASE_STATION_AGENT_ID,
        beacon_id: '-',
        title: 'Базовая станция',
        marker_color: '#64748b',
        marker_size_px: 24,
        track_color: baseStationTrackColor || styles.track.color,
        navigation_source: baseStationNavigationSource ?? 'simulation',
      };
    }
    return missionDivers.find((d) => d.uid === selectedAgentId) ?? null;
  }, [baseStationNavigationSource, baseStationTrackColor, missionDivers, selectedAgentId, styles.track.color]);
  const selectedAgentTrackStatus = useMemo<'recording' | 'paused' | 'stopped'>(
    () => (selectedAgentId ? trackStatusByAgentId[selectedAgentId] ?? 'stopped' : 'stopped'),
    [selectedAgentId, trackStatusByAgentId],
  );
  const selectedAgentActiveTrackNumber = useMemo(() => {
    if (!selectedAgentId || !missionDocument) return 0;
    const activeTrackId = missionDocument.active_tracks[selectedAgentId];
    if (!activeTrackId) {
      const agentTracks = missionDocument.tracks.filter((t) => t.agent_id === selectedAgentId);
      return agentTracks.length;
    }
    const agentTracks = missionDocument.tracks.filter((t) => t.agent_id === selectedAgentId);
    const idx = agentTracks.findIndex((t) => t.id === activeTrackId);
    return idx >= 0 ? idx + 1 : agentTracks.length;
  }, [missionDocument, selectedAgentId]);

  // HUD data for selected agent
  const selectedAgentDiverData = useMemo(() => {
    if (!selectedAgentId) return diverData;
    if (selectedAgentId === BASE_STATION_AGENT_ID && baseStationTelemetry) {
      return {
        lat: baseStationTelemetry.lat,
        lon: baseStationTelemetry.lon,
        speed: baseStationTelemetry.speed,
        course: Math.round(baseStationTelemetry.course),
        depth: baseStationTelemetry.depth,
      };
    }
    const telemetry = diverTelemetryById[selectedAgent?.id?.trim() ?? ''];
    if (telemetry) {
      return {
        lat: telemetry.lat,
        lon: telemetry.lon,
        speed: telemetry.speed,
        course: Math.round(telemetry.course),
        depth: telemetry.depth,
      };
    }
    return diverData;
  }, [baseStationTelemetry, diverData, diverTelemetryById, selectedAgent, selectedAgentId]);

  const hasSelectedAgentTelemetry = useMemo(() => {
    if (selectedAgentId === BASE_STATION_AGENT_ID) return baseStationTelemetry !== null;
    if (!selectedAgentId || !selectedAgent) return hasPrimaryTelemetry;
    const key = selectedAgent.id.trim();
    return key in diverTelemetryById;
  }, [baseStationTelemetry, diverTelemetryById, hasPrimaryTelemetry, selectedAgent, selectedAgentId]);

  const isFollowing = Boolean(pinnedAgentId);

  const selectedObject = useMemo(
    () => objects.find((object) => object.id === selectedObjectId) ?? null,
    [objects, selectedObjectId],
  );
  const selectedZoneLaneCount = useMemo(() => {
    if (!selectedObject || selectedObject.type !== 'zone') return null;
    return countZoneLanes(laneFeatures, selectedObject.id);
  }, [laneFeatures, selectedObject]);
  const selectedZoneLaneFeatures = useMemo<LaneFeature[]>(() => {
    if (!selectedObject || selectedObject.type !== 'zone') return [];
    return laneFeatures
      .filter((feature) => feature.properties.parent_area_id === selectedObject.id)
      .sort((a, b) => a.properties.lane_index - b.properties.lane_index);
  }, [laneFeatures, selectedObject]);
  const selectedZoneLanesOutdated = useMemo(() => {
    if (!selectedObject || selectedObject.type !== 'zone') return false;
    return Boolean(outdatedZoneIds[selectedObject.id]);
  }, [outdatedZoneIds, selectedObject]);

  const navigationSourceOptions = useMemo<EquipmentNavigationSourceOption[]>(
    () =>
      isElectronRuntime
        ? selectedEquipmentNavigationOptions
        : [{ id: 'simulation', label: 'Simulation', schemaId: 'simulation' }],
    [isElectronRuntime, selectedEquipmentNavigationOptions],
  );

  const navigationSourceSchemaById = useMemo(
    () => new Map(navigationSourceOptions.map((option) => [option.id, option.schemaId] as const)),
    [navigationSourceOptions],
  );

  const availableNavigationSources = useMemo<NavigationSourceId[]>(() => {
    if (!isElectronRuntime) return ['simulation'];
    return navigationSourceOptions.map((option) => option.id);
  }, [isElectronRuntime, navigationSourceOptions]);

  const resolveProviderSource = useCallback(
    (sourceId: NavigationSourceId | null): ProviderSourceId | null => {
      if (!sourceId) return null;
      if (sourceId === 'simulation') return 'simulation';
      const schemaId =
        navigationSourceSchemaById.get(sourceId) ??
        (sourceId === 'zima2r' || sourceId === 'gnss-udp' || sourceId === 'gnss-com' ? sourceId : null);
      if (schemaId === 'zima2r' || schemaId === 'gnss-udp' || schemaId === 'gnss-com') return schemaId;
      return null;
    },
    [navigationSourceSchemaById],
  );

  const resolveSourceForCurrentProfile = useCallback(
    (sourceId: NavigationSourceId | null): NavigationSourceId | null => {
      if (!sourceId) return null;
      if (availableNavigationSources.includes(sourceId)) return sourceId;

      if (sourceId === 'zima2r' || sourceId === 'gnss-udp' || sourceId === 'gnss-com') {
        const instanceSource = navigationSourceOptions.find((option) => option.schemaId === sourceId)?.id;
        return instanceSource ?? null;
      }
      return null;
    },
    [availableNavigationSources, navigationSourceOptions],
  );

  const isSourceEnabled = useCallback(
    (sourceId: NavigationSourceId | null) => {
      const resolvedSource = resolveSourceForCurrentProfile(sourceId);
      if (!resolvedSource) return false;
      const providerSource = resolveProviderSource(resolvedSource);
      if (!providerSource) return false;
      if (providerSource === 'simulation') return simulationEnabled;
      return Boolean(equipmentEnabledBySource[resolvedSource]);
    },
    [equipmentEnabledBySource, resolveProviderSource, resolveSourceForCurrentProfile, simulationEnabled],
  );

  const enabledNavigationSources = useMemo<NavigationSourceId[]>(
    () => availableNavigationSources.filter((sourceId) => isSourceEnabled(sourceId)),
    [availableNavigationSources, isSourceEnabled],
  );

  const primaryNavigationSource = useMemo<NavigationSourceId>(() => {
    const preferred = normalizeNavigationSourceId(missionDivers[0]?.navigation_source);
    if (preferred && enabledNavigationSources.includes(preferred)) {
      return preferred;
    }
    if (enabledNavigationSources.length > 0) {
      return enabledNavigationSources[0];
    }
    if (preferred && availableNavigationSources.includes(preferred)) {
      return preferred;
    }
    return availableNavigationSources[0] ?? 'simulation';
  }, [availableNavigationSources, enabledNavigationSources, missionDivers]);

  const isPrimarySourceEnabled = useMemo(
    () => isSourceEnabled(primaryNavigationSource),
    [isSourceEnabled, primaryNavigationSource],
  );
  const realtimeVisibility = useMemo(
    () =>
      computeRealtimeVisibilityState({
        isSourceEnabled: isPrimarySourceEnabled,
        connectionStatus,
        hasTelemetry: hasPrimaryTelemetry,
        hasTelemetryHistory: hasPrimaryTelemetryHistory,
      }),
    [connectionStatus, hasPrimaryTelemetry, hasPrimaryTelemetryHistory, isPrimarySourceEnabled],
  );
  const primaryConnectionUiState: RealtimeUiConnectionState = realtimeVisibility.connectionState;
  const hasEnabledNavigationSource = enabledNavigationSources.length > 0;
  const hasAnyTelemetryObject = Object.keys(diverTelemetryById).length > 0 || baseStationTelemetry !== null;
  const showTelemetryObjects = hasEnabledNavigationSource && (realtimeVisibility.showTelemetryObjects || hasAnyTelemetryObject);

  const isRecordingControlsEnabled = useMemo(() => {
    if (!isElectronRuntime) return simulationEnabled;
    return navigationSourceOptions.some((option) => Boolean(equipmentEnabledBySource[option.id]));
  }, [equipmentEnabledBySource, isElectronRuntime, navigationSourceOptions, simulationEnabled]);


  const settingsValue = useMemo<AppUiDefaults>(
    () => ({
      follow_diver: isFollowing,
      connection: { ...connectionSettings },
      interactions: {
        center_on_object_select: centerOnObjectSelect,
      },
      layers: {
        track: layers.track,
        routes: layers.routes,
        markers: layers.markers,
        base_station: layers.baseStation,
        grid: layers.grid,
        scale_bar: layers.scaleBar,
      },
      coordinates: {
        precision: coordPrecision,
        input_crs: coordinateInputCrs,
        input_format: coordinateInputFormat,
      },
      measurements: {
        grid: { ...gridSettings },
        segment_lengths_mode: segmentLengthsMode,
      },
      styles,
    }),
    [
      centerOnObjectSelect,
      connectionSettings,
      coordPrecision,
      coordinateInputCrs,
      coordinateInputFormat,
      gridSettings,
      isFollowing,
      layers.grid,
      layers.baseStation,
      layers.markers,
      layers.routes,
      layers.scaleBar,
      layers.track,
      segmentLengthsMode,
      styles,
    ],
  );

  const rasterDecodeErrorShownRef = useRef<Set<string>>(new Set());
  const rasterBoundsErrorShownRef = useRef<Set<string>>(new Set());
  const rasterDecodeFailedRef = useRef<Set<string>>(new Set());
  const rasterRenderNotificationPendingRef = useRef<Set<string>>(new Set());
  const rasterRenderProgressToastRef = useRef<Map<string, ReturnType<typeof toast>>>(new Map());
  const rasterOverlayDecodeInFlightRef = useRef<Set<string>>(new Set());
  const rasterOverlayUrlCacheRef = useRef<Map<string, { key: string; url: string }>>(new Map());
  const rasterDecodePendingResolversRef = useRef<Map<string, () => void>>(new Map());
  const vectorOverlayErrorShownRef = useRef<Set<string>>(new Set());
  const vectorRenderNotificationPendingRef = useRef<Set<string>>(new Set());
  const vectorRenderProgressToastRef = useRef<Map<string, ReturnType<typeof toast>>>(new Map());
  const vectorOverlayCacheRef = useRef<Map<string, { key: string; data: VectorOverlayMapData }>>(new Map());
  const centerNonceRef = useRef(0);
  const requestCenterOnObject = useCallback((id: string) => {
    setPinnedAgentId(null);
    centerNonceRef.current += 1;
    setCenterRequest({ objectId: id, nonce: centerNonceRef.current });
  }, []);

  const handleObjectCenter = useCallback(
    (id: string) => {
      setSelectedObjectId(id);
      requestCenterOnObject(id);
    },
    [requestCenterOnObject],
  );

  useEffect(() => {
    latestSnapshotRef.current = {
      missionRootPath,
      recordingState,
      objects,
      laneFeatures,
      isFollowing,
      layers,
      divers: missionDivers,
      baseStationNavigationSource,
      baseStationTrackColor,
      baseStationMarkerSizePx,
      hiddenTrackIds,
      baseStationTelemetry,
      mapView,
      coordPrecision,
      grid: gridSettings,
      segmentLengthsMode,
      styles,
      rasterOverlays,
      vectorOverlays,
      leftPanelSectionsCollapsed,
      rightPanelSectionsCollapsed,
      leftPanelWidthPx,
      rightPanelWidthPx,
      mapPanelsCollapsed,
      isLoaded,
    };
  }, [
    missionRootPath,
    recordingState,
    objects,
    laneFeatures,
    isFollowing,
    layers,
    missionDivers,
    baseStationNavigationSource,
    baseStationTrackColor,
    baseStationMarkerSizePx,
    hiddenTrackIds,
    baseStationTelemetry,
    mapView,
    coordPrecision,
    gridSettings,
    segmentLengthsMode,
    styles,
    rasterOverlays,
    vectorOverlays,
    leftPanelSectionsCollapsed,
    rightPanelSectionsCollapsed,
    leftPanelWidthPx,
    rightPanelWidthPx,
    mapPanelsCollapsed,
    isLoaded,
  ]);

  useEffect(() => {
    missionDiversRef.current = missionDivers;
  }, [missionDivers]);

  useEffect(() => {
    if (!missionDocument) return;
    const existingTrackIds = new Set(missionDocument.tracks.map((track) => track.id));
    setHiddenTrackIds((prev) => {
      const next = prev.filter((id) => existingTrackIds.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [missionDocument]);

  // Backfill historical colors for legacy tracks that do not have per-track color.
  useEffect(() => {
    setRecordingState((prev) => {
      if (!prev.mission) return prev;
      let changed = false;
      const nextTracks = prev.mission.tracks.map((track) => {
        if (typeof track.color === 'string' && track.color.trim().length > 0) {
          return track;
        }
        const resolvedColor =
          track.agent_id === BASE_STATION_AGENT_ID
            ? baseStationTrackColor || styles.track.color
            : missionDivers.find((diver) => diver.uid === track.agent_id)?.track_color ?? styles.track.color;
        changed = true;
        return { ...track, color: resolvedColor };
      });
      if (!changed) return prev;
      return {
        ...prev,
        mission: {
          ...prev.mission,
          tracks: nextTracks,
        },
      };
    });
  }, [baseStationTrackColor, missionDivers, styles.track.color]);

  const waitForRasterDecode = useCallback(
    (overlayId: string): Promise<void> =>
      new Promise<void>((resolve) => {
        rasterDecodePendingResolversRef.current.set(overlayId, resolve);
      }),
    [],
  );

  useEffect(() => {
    let active = true;

    const syncStateFromCache = () => {
      if (!active) return;
      setRasterOverlayUrls(
        Object.fromEntries(Array.from(rasterOverlayUrlCacheRef.current.entries(), ([id, value]) => [id, value.url])),
      );
    };

    const dismissRasterRenderProgressToast = (overlayId: string) => {
      const activeProgressToast = rasterRenderProgressToastRef.current.get(overlayId);
      if (!activeProgressToast) return;
      activeProgressToast.dismiss();
      rasterRenderProgressToastRef.current.delete(overlayId);
    };

    const notifyRasterRenderFailure = (overlay: RasterOverlayUi, description: string) => {
      dismissRasterRenderProgressToast(overlay.id);
      if (!rasterDecodeErrorShownRef.current.has(overlay.id)) {
        rasterDecodeErrorShownRef.current.add(overlay.id);
        toast({
          title: `\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0442\u043e\u0431\u0440\u0430\u0437\u0438\u0442\u044c \u0440\u0430\u0441\u0442\u0440: ${overlay.name}`,
          description,
        });
      }
      rasterDecodeFailedRef.current.add(overlay.id);
      rasterRenderNotificationPendingRef.current.delete(overlay.id);
      const pendingResolve = rasterDecodePendingResolversRef.current.get(overlay.id);
      if (pendingResolve) {
        rasterDecodePendingResolversRef.current.delete(overlay.id);
        pendingResolve();
      }
    };

    const notifyRasterRenderSuccess = (overlay: RasterOverlayUi) => {
      dismissRasterRenderProgressToast(overlay.id);
      if (rasterRenderNotificationPendingRef.current.has(overlay.id)) {
        toast({ title: `\u041e\u0442\u0440\u0438\u0441\u043e\u0432\u043a\u0430 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u0430: ${overlay.name}` });
        rasterRenderNotificationPendingRef.current.delete(overlay.id);
      }
      rasterDecodeFailedRef.current.delete(overlay.id);
      const pendingResolve = rasterDecodePendingResolversRef.current.get(overlay.id);
      if (pendingResolve) {
        rasterDecodePendingResolversRef.current.delete(overlay.id);
        pendingResolve();
      }
    };

    const loadOverlayUrls = async () => {
      if (!missionRootPath || rasterOverlays.length === 0) {
        for (const { url } of rasterOverlayUrlCacheRef.current.values()) {
          URL.revokeObjectURL(url);
        }
        rasterOverlayUrlCacheRef.current.clear();
        rasterOverlayDecodeInFlightRef.current.clear();
        rasterDecodeFailedRef.current.clear();
        rasterRenderNotificationPendingRef.current.clear();
        for (const toastHandle of rasterRenderProgressToastRef.current.values()) {
          toastHandle.dismiss();
        }
        rasterRenderProgressToastRef.current.clear();
        setRasterOverlayUrls({});
        return;
      }

      const activeIds = new Set(rasterOverlays.map((overlay) => overlay.id));
      for (const [overlayId, cached] of rasterOverlayUrlCacheRef.current.entries()) {
        if (!activeIds.has(overlayId)) {
          URL.revokeObjectURL(cached.url);
          rasterOverlayUrlCacheRef.current.delete(overlayId);
        }
      }

      for (const overlayId of Array.from(rasterOverlayDecodeInFlightRef.current.values())) {
        if (!activeIds.has(overlayId)) rasterOverlayDecodeInFlightRef.current.delete(overlayId);
      }
      for (const overlayId of Array.from(rasterDecodeFailedRef.current.values())) {
        if (!activeIds.has(overlayId)) rasterDecodeFailedRef.current.delete(overlayId);
      }
      for (const overlayId of Array.from(rasterRenderNotificationPendingRef.current.values())) {
        if (!activeIds.has(overlayId)) rasterRenderNotificationPendingRef.current.delete(overlayId);
      }
      for (const overlayId of Array.from(rasterRenderProgressToastRef.current.keys())) {
        if (!activeIds.has(overlayId)) {
          dismissRasterRenderProgressToast(overlayId);
        }
      }
      for (const overlayId of Array.from(rasterDecodeErrorShownRef.current.values())) {
        if (!activeIds.has(overlayId)) rasterDecodeErrorShownRef.current.delete(overlayId);
      }
      for (const overlayId of Array.from(rasterBoundsErrorShownRef.current.values())) {
        if (!activeIds.has(overlayId)) rasterBoundsErrorShownRef.current.delete(overlayId);
      }

      const pending: RasterOverlayUi[] = [];
      for (const overlay of rasterOverlays) {
        const overlayKey = `${missionRootPath}/${overlay.file}`;
        const cached = rasterOverlayUrlCacheRef.current.get(overlay.id);
        if (cached && cached.key !== overlayKey) {
          URL.revokeObjectURL(cached.url);
          rasterOverlayUrlCacheRef.current.delete(overlay.id);
          rasterDecodeFailedRef.current.delete(overlay.id);
          rasterDecodeErrorShownRef.current.delete(overlay.id);
          rasterBoundsErrorShownRef.current.delete(overlay.id);
        }
        if (!overlay.visible) continue;
        if (rasterOverlayDecodeInFlightRef.current.has(overlay.id)) continue;
        if (rasterDecodeFailedRef.current.has(overlay.id)) continue;
        if (!rasterOverlayUrlCacheRef.current.has(overlay.id)) {
          pending.push(overlay);
        }
      }

      syncStateFromCache();
      if (pending.length === 0) return;

      for (const overlay of pending) {
        if (!active) break;

        rasterOverlayDecodeInFlightRef.current.add(overlay.id);
        const shouldNotifyProgress = rasterRenderNotificationPendingRef.current.has(overlay.id);
        if (shouldNotifyProgress && !rasterRenderProgressToastRef.current.has(overlay.id)) {
          const progressToast = toast({
            title: `\u0418\u0434\u0435\u0442 \u043e\u0442\u0440\u0438\u0441\u043e\u0432\u043a\u0430: ${overlay.name}`,
            duration: RASTER_RENDER_PROGRESS_TOAST_DURATION_MS,
          });
          rasterRenderProgressToastRef.current.set(overlay.id, progressToast);
        }

        let raw: string | null = null;
        try {
          if (!isBoundsWithinEpsg4326(overlay.bounds)) {
            if (!rasterBoundsErrorShownRef.current.has(overlay.id)) {
              rasterBoundsErrorShownRef.current.add(overlay.id);
            }
            notifyRasterRenderFailure(
              overlay,
              'Координаты слоя выходят за диапазон EPSG:4326. Для MVP поддерживаются только данные в WGS84.',
            );
            continue;
          }

          raw = await platform.fileStore.readText(`${missionRootPath}/${overlay.file}`);
          if (!raw) {
            notifyRasterRenderFailure(overlay, classifyRasterDecodeFailure('', null, 'missing-file'));
            continue;
          }

          const inputSizeBytes = estimateBase64ByteLength(raw);
          if (inputSizeBytes > MAX_RASTER_INPUT_FILE_BYTES) {
            notifyRasterRenderFailure(overlay, classifyRasterDecodeFailure(raw, null, 'decode-failed'));
            continue;
          }

          const pngBase64 = await platform.raster.convertTiffBase64ToPngBase64(raw);
          if (pngBase64) {
            const url = URL.createObjectURL(base64ToBlob(pngBase64, 'image/png'));
            rasterOverlayUrlCacheRef.current.set(overlay.id, { key: `${missionRootPath}/${overlay.file}`, url });
            notifyRasterRenderSuccess(overlay);
            continue;
          }

          const decodedPngBlob = await decodeTiffToPngBlobInRenderer(raw);
          if (decodedPngBlob) {
            const url = URL.createObjectURL(decodedPngBlob);
            rasterOverlayUrlCacheRef.current.set(overlay.id, { key: `${missionRootPath}/${overlay.file}`, url });
            notifyRasterRenderSuccess(overlay);
            continue;
          }

          const tiffBlob = base64ToBlob(raw, 'image/tiff');
          const isRenderable = await canRenderBlob(tiffBlob);
          if (!isRenderable) {
            const hints = extractRasterDecodeHints(raw);
            notifyRasterRenderFailure(overlay, classifyRasterDecodeFailure(raw, hints, 'decode-failed'));
            continue;
          }

          const url = URL.createObjectURL(tiffBlob);
          rasterOverlayUrlCacheRef.current.set(overlay.id, { key: `${missionRootPath}/${overlay.file}`, url });
          notifyRasterRenderSuccess(overlay);
        } catch {
          const hints = raw ? extractRasterDecodeHints(raw) : null;
          notifyRasterRenderFailure(overlay, classifyRasterDecodeFailure(raw ?? '', hints, 'decode-failed'));
        } finally {
          rasterOverlayDecodeInFlightRef.current.delete(overlay.id);
        }
      }

      syncStateFromCache();
    };

    void loadOverlayUrls();

    return () => {
      active = false;
      for (const resolve of rasterDecodePendingResolversRef.current.values()) {
        resolve();
      }
      rasterDecodePendingResolversRef.current.clear();
    };
  }, [missionRootPath, rasterOverlays]);

  useEffect(() => {
    const cache = rasterOverlayUrlCacheRef.current;
    const progressToasts = rasterRenderProgressToastRef.current;
    return () => {
      for (const { url } of cache.values()) {
        URL.revokeObjectURL(url);
      }
      cache.clear();
      for (const toastHandle of progressToasts.values()) {
        toastHandle.dismiss();
      }
      progressToasts.clear();
    };
  }, []);

  useEffect(() => {
    let active = true;

    const syncStateFromCache = () => {
      if (!active) return;
      setVectorOverlayDataById(
        Object.fromEntries(Array.from(vectorOverlayCacheRef.current.entries(), ([id, value]) => [id, value.data])),
      );
    };

    const loadVectorOverlayData = async () => {
      if (!missionRootPath || vectorOverlays.length === 0) {
        vectorOverlayCacheRef.current.clear();
        vectorOverlayErrorShownRef.current.clear();
        setVectorOverlayDataById({});
        return;
      }

      const activeIds = new Set(vectorOverlays.map((overlay) => overlay.id));
      for (const [overlayId] of vectorOverlayCacheRef.current.entries()) {
        if (!activeIds.has(overlayId)) {
          vectorOverlayCacheRef.current.delete(overlayId);
          vectorOverlayErrorShownRef.current.delete(overlayId);
        }
      }

      const pending: VectorOverlayUi[] = [];
      for (const overlay of vectorOverlays) {
        const overlayKey = `${missionRootPath}/${overlay.file}::${resolveVectorOverlayCacheFilePath(overlay)}`;
        const cached = vectorOverlayCacheRef.current.get(overlay.id);
        if (cached && cached.key !== overlayKey) {
          vectorOverlayCacheRef.current.delete(overlay.id);
          vectorOverlayErrorShownRef.current.delete(overlay.id);
        }
        if (!vectorOverlayCacheRef.current.has(overlay.id)) {
          pending.push(overlay);
        }
      }

      syncStateFromCache();
      if (pending.length === 0) return;

      for (const overlay of pending) {
        if (!active) break;

        const shouldNotifyProgress = vectorRenderNotificationPendingRef.current.has(overlay.id);
        if (shouldNotifyProgress && !vectorRenderProgressToastRef.current.has(overlay.id)) {
          const progressToast = toast({
            title: `Идёт обработка: ${overlay.name}`,
            duration: VECTOR_RENDER_PROGRESS_TOAST_DURATION_MS,
          });
          vectorRenderProgressToastRef.current.set(overlay.id, progressToast);
        }

        try {
          const overlayKey = `${missionRootPath}/${overlay.file}::${resolveVectorOverlayCacheFilePath(overlay)}`;
          const cacheFilePath = resolveVectorOverlayCacheFilePath(overlay);
          const sourceMeta = toVectorOverlayCacheSourceMeta(overlay);

          const cacheRaw = await platform.fileStore.readText(`${missionRootPath}/${cacheFilePath}`);
          const cacheData = cacheRaw ? parseVectorOverlayCache(cacheRaw, sourceMeta) : null;
          if (cacheData) {
            vectorOverlayCacheRef.current.set(overlay.id, {
              key: overlayKey,
              data: cacheData,
            });
          } else {
            const parsed = await parseVectorOverlayFromSourceFile(missionRootPath, overlay);
            const cachePayload = serializeVectorOverlayCache(sourceMeta, parsed);
            await platform.fileStore.writeText(`${missionRootPath}/${cacheFilePath}`, cachePayload).catch(() => {
              // cache write is best effort
            });

            vectorOverlayCacheRef.current.set(overlay.id, {
              key: overlayKey,
              data: parsed,
            });
          }

          const activeProgressToast = vectorRenderProgressToastRef.current.get(overlay.id);
          if (activeProgressToast) {
            activeProgressToast.dismiss();
            vectorRenderProgressToastRef.current.delete(overlay.id);
          }
          if (vectorRenderNotificationPendingRef.current.has(overlay.id)) {
            toast({ title: `Обработка завершена: ${overlay.name}` });
            vectorRenderNotificationPendingRef.current.delete(overlay.id);
          }
        } catch (error) {
          const activeProgressToast = vectorRenderProgressToastRef.current.get(overlay.id);
          if (activeProgressToast) {
            activeProgressToast.dismiss();
            vectorRenderProgressToastRef.current.delete(overlay.id);
          }
          vectorRenderNotificationPendingRef.current.delete(overlay.id);
          if (!vectorOverlayErrorShownRef.current.has(overlay.id)) {
            vectorOverlayErrorShownRef.current.add(overlay.id);
            const message = error instanceof Error ? error.message : 'Ошибка загрузки CAD-слоя.';
            toast({
              title: `Не удалось загрузить слой: ${overlay.name}`,
              description: message,
            });
          }
        }

        syncStateFromCache();
      }
    };

    void loadVectorOverlayData();

    return () => {
      active = false;
      for (const toastHandle of vectorRenderProgressToastRef.current.values()) {
        toastHandle.dismiss();
      }
      vectorRenderProgressToastRef.current.clear();
    };
  }, [missionRootPath, vectorOverlays]);

  const toggleTrackHidden = useCallback((trackId: string) => {
    setHiddenTrackIds((prev) => (prev.includes(trackId) ? prev.filter((id) => id !== trackId) : [...prev, trackId]));
  }, []);

  const setTracksHiddenForSelection = useCallback((trackIds: string[], visible: boolean) => {
    if (trackIds.length === 0) return;
    setHiddenTrackIds((prev) => {
      const set = new Set(prev);
      if (visible) {
        for (const id of trackIds) set.delete(id);
      } else {
        for (const id of trackIds) set.add(id);
      }
      const next = Array.from(set);
      if (next.length === prev.length && next.every((id, index) => id === prev[index])) {
        return prev;
      }
      return next;
    });
  }, []);

  const importRasterFiles = useCallback(
    async (
      mode: 'geotiff' | 'tif+tfw',
      filesInput: FileList | File[],
      options?: {
        tfwUnits?: 'degrees' | 'meters';
        metersProjection?: 'web-mercator' | 'utm';
        utmZone?: number;
        utmHemisphere?: 'north' | 'south';
      },
    ) => {
      if (!missionRootPath) {
        toast({ title: 'Импорт недоступен', description: 'Сначала откройте миссию или черновик.' });
        return;
      }
      const files = Array.from(filesInput);
      if (files.length === 0) return;

      const tiffFiles = files.filter((file) => {
        const lower = file.name.toLowerCase();
        return lower.endsWith('.tif') || lower.endsWith('.tiff');
      });
      if (tiffFiles.length === 0) {
        toast({
          title: 'Импорт недоступен',
          description: 'Выберите один или несколько файлов TIF/TIFF.',
        });
        return;
      }

      for (const tifFile of tiffFiles) {
        const baseName = tifFile.name.replace(/\.[^/.]+$/, '');
        try {
          if (mode === 'geotiff') {
            // no-op
          }

          const tifBuffer = await tifFile.arrayBuffer();
          let source: RasterOverlayUi['source'] = 'geotiff';
          let bounds: MapBounds;
          let tfwTextForStorage: string | null = null;

          if (mode === 'tif+tfw') {
            const tifPath =
              (await platform.raster.resolveLocalPathForFile(tifFile)) ??
              ((tifFile as File & { path?: string }).path ?? null);
            if (typeof tifPath !== 'string' || tifPath.trim().length === 0) {
              throw new Error(
                'Не удалось определить путь TIF. Повторите выбор файла локально или используйте Electron-сборку приложения.',
              );
            }
            const tfwText = await platform.raster.readSiblingTfwTextByTifPath(tifPath);
            if (!tfwText) {
              throw new Error('Не найден одноименный TFW в той же папке, что и TIF.');
            }
            tfwTextForStorage = tfwText;
            const coreMeta = parseTiffCoreMetadata(tifBuffer);
            const tfwUnits = options?.tfwUnits ?? 'degrees';
            if (tfwUnits === 'degrees' && coreMeta.epsg !== null && coreMeta.epsg !== 4326) {
              throw new Error(`Неподдерживаемая CRS EPSG:${coreMeta.epsg}. Поддерживается только EPSG:4326`);
            }
            const tfw = parseTfw(tfwText);
            const rawBounds = computeBoundsFromTfw(tfw, coreMeta.width, coreMeta.height);
            if (tfwUnits === 'meters') {
              if (options?.metersProjection === 'utm') {
                const zone = options?.utmZone;
                if (!Number.isInteger(zone) || !zone) {
                  throw new Error('Не указана корректная UTM зона (1..60).');
                }
                const hemisphere = options?.utmHemisphere === 'south' ? 'south' : 'north';
                bounds = convertUtmBoundsToEpsg4326(rawBounds, zone, hemisphere);
              } else {
                bounds = convertWebMercatorBoundsToEpsg4326(rawBounds);
              }
            } else {
              bounds = rawBounds;
            }
            assertBoundsWithinEpsg4326(bounds, 'TFW');
            source = 'tif+tfw';
          } else {
            const meta = parseGeoTiffMetadata(tifBuffer);
            bounds = meta.bounds;
            if (meta.epsg !== 4326) {
              throw new Error(
                meta.epsg
                  ? `Неподдерживаемая CRS EPSG:${meta.epsg}. Поддерживается только EPSG:4326`
                  : 'В GeoTIFF не найдена CRS. Для MVP поддерживается только EPSG:4326',
              );
            }
            assertBoundsWithinEpsg4326(bounds, 'GeoTIFF');
          }

          const id = createOverlayId();
          const filePath = `${OVERLAYS_RASTER_DIR}/${id}.tif.b64`;
          await platform.fileStore.writeText(`${missionRootPath}/${filePath}`, arrayBufferToBase64(tifBuffer));
          const tfwFilePath = source === 'tif+tfw' ? `${OVERLAYS_RASTER_DIR}/${id}.tfw` : undefined;
          if (source === 'tif+tfw' && tfwFilePath && tfwTextForStorage !== null) {
            await platform.fileStore.writeText(`${missionRootPath}/${tfwFilePath}`, tfwTextForStorage);
          }

          rasterRenderNotificationPendingRef.current.add(id);

          const decodePromise = waitForRasterDecode(id);
          setRasterOverlays((prev) => {
            const maxZ = prev.reduce((max, item) => Math.max(max, item.z_index), 0);
            return [
              ...prev,
              {
                id,
                name: baseName,
                file: filePath,
                ...(tfwFilePath ? { tfw_file: tfwFilePath } : {}),
                bounds,
                opacity: 1,
                visible: true,
                z_index: maxZ + 1,
                source,
              },
            ];
          });
          await decodePromise;
          toast({ title: `Растр импортирован: ${baseName}` });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Ошибка импорта';
          toast({ title: `Не удалось импортировать ${baseName}`, description: message });
        }
      }
    },
    [missionRootPath, waitForRasterDecode],
  );

  const importDxfFiles = useCallback(
    async (
      filesInput: FileList | File[],
      options: {
        utmZone: number;
        utmHemisphere: 'north' | 'south';
      },
    ) => {
      if (!missionRootPath) {
        toast({ title: 'Импорт недоступен', description: 'Сначала откройте миссию или черновик.' });
        return;
      }

      const files = Array.from(filesInput);
      if (files.length === 0) return;

      const dxfOrDwgFiles = files.filter((file) => {
        const lower = file.name.toLowerCase();
        return lower.endsWith('.dxf') || lower.endsWith('.dwg');
      });
      if (dxfOrDwgFiles.length === 0) {
        toast({
          title: 'Импорт недоступен',
          description: 'Выберите один или несколько файлов DXF/DWG.',
        });
        return;
      }

      for (const sourceFile of dxfOrDwgFiles) {
        const lower = sourceFile.name.toLowerCase();
        const baseName = sourceFile.name.replace(/\.[^/.]+$/, '');

        const progressToast = toast({
          title: `Идёт обработка: ${baseName}`,
          duration: VECTOR_RENDER_PROGRESS_TOAST_DURATION_MS,
        });

        try {
          let parsed: DxfOverlayFeatureCollection;
          let filePath: string;
          let fileContent: string;
          let overlayType: VectorOverlayUi['type'];
          let fileEncoding: NonNullable<VectorOverlayUi['file_encoding']>;
          if (lower.endsWith('.dwg')) {
            const rawBinary = await sourceFile.arrayBuffer();
            parsed = await parseDwgToWgs84(rawBinary, {
              zone: options.utmZone,
              hemisphere: options.utmHemisphere,
            });
            overlayType = 'dwg';
            fileEncoding = 'base64';
            filePath = '';
            fileContent = arrayBufferToBase64(rawBinary);
          } else {
            const rawText = await sourceFile.text();
            parsed = parseDxfToWgs84(rawText, {
              zone: options.utmZone,
              hemisphere: options.utmHemisphere,
            });
            overlayType = 'dxf';
            fileEncoding = 'utf8';
            filePath = '';
            fileContent = rawText;
          }

          const bounds = computeVectorOverlayBounds(parsed.features);
          if (!bounds) {
            throw new Error('В CAD-файле не найдена поддерживаемая геометрия.');
          }

          const id = createOverlayId();
          filePath = overlayType === 'dwg' ? `${OVERLAYS_VECTOR_DIR}/${id}.dwg.b64` : `${OVERLAYS_VECTOR_DIR}/${id}.dxf`;
          const cacheFilePath = `${OVERLAYS_VECTOR_DIR}/${id}.vector-cache.json`;
          await platform.fileStore.writeText(`${missionRootPath}/${filePath}`, fileContent);

          const data: VectorOverlayMapData = {
            features: parsed.features,
            bounds,
          };
          const overlayMeta: VectorOverlayUi = {
            id,
            name: baseName,
            file: filePath,
            cache_file: cacheFilePath,
            color: DEFAULT_VECTOR_OVERLAY_COLOR,
            type: overlayType,
            file_encoding: fileEncoding,
            utm_zone: options.utmZone,
            utm_hemisphere: options.utmHemisphere === 'south' ? 'S' : 'N',
            opacity: 1,
            visible: true,
            z_index: 1,
          };
          const cachePayload = serializeVectorOverlayCache(toVectorOverlayCacheSourceMeta(overlayMeta), data);
          await platform.fileStore.writeText(`${missionRootPath}/${cacheFilePath}`, cachePayload).catch(() => {
            // cache write is best effort
          });

          setVectorOverlays((prev) => {
            const maxZ = prev.reduce((max, item) => Math.max(max, item.z_index), 0);
            const nextOverlay: VectorOverlayUi = {
              ...overlayMeta,
              z_index: maxZ + 1,
            };
            return [
              ...prev,
              nextOverlay,
            ];
          });

          vectorOverlayCacheRef.current.set(id, {
            key: `${missionRootPath}/${filePath}::${cacheFilePath}`,
            data,
          });
          setVectorOverlayDataById((prev) => ({
            ...prev,
            [id]: data,
          }));
          progressToast.dismiss();
          toast({ title: `Слой добавлен: ${baseName}` });
        } catch (error) {
          progressToast.dismiss();
          const message = error instanceof Error ? error.message : 'Ошибка импорта';
          toast({ title: `Не удалось импортировать ${baseName}`, description: message });
        }
      }
    },
    [missionRootPath],
  );

  const toggleRasterOverlayVisible = useCallback((id: string) => {
    setRasterOverlays((prev) => prev.map((overlay) => (overlay.id === id ? { ...overlay, visible: !overlay.visible } : overlay)));
  }, []);

  const toggleAllRasterOverlaysVisible = useCallback(() => {
    setRasterOverlays((prev) => {
      const allHidden = prev.length > 0 && prev.every((o) => !o.visible);
      return prev.map((o) => ({ ...o, visible: allHidden }));
    });
  }, []);

  const setRasterOverlayOpacity = useCallback((id: string, opacity: number) => {
    const nextOpacity = Math.max(0, Math.min(1, opacity));
    setRasterOverlays((prev) => prev.map((overlay) => (overlay.id === id ? { ...overlay, opacity: nextOpacity } : overlay)));
  }, []);

  const moveRasterOverlay = useCallback((id: string, delta: -1 | 1) => {
    setRasterOverlays((prev) => moveRasterOverlayByDelta(prev, id, delta));
  }, []);

  const deleteRasterOverlay = useCallback(
    (id: string) => {
      const target = rasterOverlays.find((overlay) => overlay.id === id);
      if (!target) return;
      setRasterOverlays((prev) => prev.filter((overlay) => overlay.id !== id));
      rasterOverlayDecodeInFlightRef.current.delete(id);
      rasterDecodeFailedRef.current.delete(id);
      rasterDecodeErrorShownRef.current.delete(id);
      rasterBoundsErrorShownRef.current.delete(id);
      rasterRenderNotificationPendingRef.current.delete(id);
      const activeProgressToast = rasterRenderProgressToastRef.current.get(id);
      if (activeProgressToast) {
        activeProgressToast.dismiss();
        rasterRenderProgressToastRef.current.delete(id);
      }
      if (missionRootPath) {
        void platform.fileStore.remove(`${missionRootPath}/${target.file}`).catch(() => {
          // best effort cleanup
        });
        if (typeof target.tfw_file === 'string' && target.tfw_file.trim().length > 0) {
          void platform.fileStore.remove(`${missionRootPath}/${target.tfw_file}`).catch(() => {
            // best effort cleanup
          });
        }
      }
    },
    [missionRootPath, rasterOverlays],
  );

  const centerRasterOverlay = useCallback((id: string) => {
    const target = rasterOverlays.find((overlay) => overlay.id === id);
    if (!target) return;
    const centerLat = (target.bounds.north + target.bounds.south) / 2;
    const centerLon = (target.bounds.east + target.bounds.west) / 2;
    setMapView((prev) => ({
      center_lat: centerLat,
      center_lon: centerLon,
      zoom: prev?.zoom ?? 16,
    }));
  }, [rasterOverlays]);

  const toggleVectorOverlayVisible = useCallback((id: string) => {
    setVectorOverlays((prev) => prev.map((overlay) => (overlay.id === id ? { ...overlay, visible: !overlay.visible } : overlay)));
  }, []);

  const toggleAllVectorOverlaysVisible = useCallback(() => {
    setVectorOverlays((prev) => {
      const allHidden = prev.length > 0 && prev.every((o) => !o.visible);
      return prev.map((o) => ({ ...o, visible: allHidden }));
    });
  }, []);

  const setVectorOverlayOpacity = useCallback((id: string, opacity: number) => {
    const nextOpacity = Math.max(0, Math.min(1, opacity));
    setVectorOverlays((prev) => prev.map((overlay) => (overlay.id === id ? { ...overlay, opacity: nextOpacity } : overlay)));
  }, []);

  const setVectorOverlayColor = useCallback((id: string, color: string) => {
    if (!/^#[0-9a-f]{6}$/i.test(color)) return;
    setVectorOverlays((prev) => prev.map((overlay) => (overlay.id === id ? { ...overlay, color } : overlay)));
  }, []);

  const moveVectorOverlay = useCallback((id: string, delta: -1 | 1) => {
    setVectorOverlays((prev) => moveRasterOverlayByDelta(prev, id, delta));
  }, []);

  const deleteVectorOverlay = useCallback(
    (id: string) => {
      const target = vectorOverlays.find((overlay) => overlay.id === id);
      if (!target) return;
      setVectorOverlays((prev) => prev.filter((overlay) => overlay.id !== id));
      setVectorOverlayDataById((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
      vectorOverlayCacheRef.current.delete(id);
      vectorOverlayErrorShownRef.current.delete(id);
      if (missionRootPath) {
        void platform.fileStore.remove(`${missionRootPath}/${target.file}`).catch(() => {
          // best effort cleanup
        });
        void platform.fileStore.remove(`${missionRootPath}/${resolveVectorOverlayCacheFilePath(target)}`).catch(() => {
          // best effort cleanup
        });
      }
    },
    [missionRootPath, vectorOverlays],
  );

  const centerVectorOverlay = useCallback(
    (id: string) => {
      const applyBounds = (bounds: MapBounds) => {
        const centerLat = (bounds.north + bounds.south) / 2;
        const centerLon = (bounds.east + bounds.west) / 2;
        setMapView((prev) => ({
          center_lat: centerLat,
          center_lon: centerLon,
          zoom: prev?.zoom ?? 16,
        }));
      };

      const cached = vectorOverlayDataById[id];
      if (cached) {
        applyBounds(cached.bounds);
        return;
      }

      const target = vectorOverlays.find((overlay) => overlay.id === id);
      if (!target || !missionRootPath) return;

      void (async () => {
        try {
          const overlayKey = `${missionRootPath}/${target.file}::${resolveVectorOverlayCacheFilePath(target)}`;
          const cacheFilePath = resolveVectorOverlayCacheFilePath(target);
          const sourceMeta = toVectorOverlayCacheSourceMeta(target);
          const cacheRaw = await platform.fileStore.readText(`${missionRootPath}/${cacheFilePath}`);
          const cacheData = cacheRaw ? parseVectorOverlayCache(cacheRaw, sourceMeta) : null;

          const data = cacheData ?? (await parseVectorOverlayFromSourceFile(missionRootPath, target));
          if (!cacheData) {
            const cachePayload = serializeVectorOverlayCache(sourceMeta, data);
            await platform.fileStore.writeText(`${missionRootPath}/${cacheFilePath}`, cachePayload).catch(() => {
              // cache write is best effort
            });
          }

          vectorOverlayCacheRef.current.set(id, {
            key: overlayKey,
            data,
          });
          setVectorOverlayDataById((prev) => ({ ...prev, [id]: data }));
          applyBounds(data.bounds);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Не удалось прочитать слой.';
          toast({
            title: `Не удалось загрузить слой: ${target.name}`,
            description: message,
          });
        }
      })();
    },
    [missionRootPath, vectorOverlayDataById, vectorOverlays],
  );

  useEffect(() => {
    setMissionDivers((prev) => {
      let changed = false;
      const fallbackSource = availableNavigationSources[0] ?? 'simulation';
      const next = prev.map((diver) => {
        const current = normalizeNavigationSourceId(diver.navigation_source);
        const resolvedCurrent = resolveSourceForCurrentProfile(current);
        if (resolvedCurrent && resolvedCurrent === diver.navigation_source) {
          return diver;
        }
        changed = true;
        return {
          ...diver,
          navigation_source: resolvedCurrent ?? fallbackSource,
        };
      });
      return changed ? next : prev;
    });
  }, [availableNavigationSources, resolveSourceForCurrentProfile]);

  useEffect(() => {
    setBaseStationNavigationSource((prev) => {
      return resolveSourceForCurrentProfile(prev);
    });
  }, [resolveSourceForCurrentProfile]);

  const releaseCurrentLock = useCallback(async () => {
    if (!lockOwnerRootRef.current) return;
    const root = lockOwnerRootRef.current;
    lockOwnerRootRef.current = null;
    await repository.releaseLock(root);
  }, [repository]);

  const cancelPendingAutosave = useCallback(() => {
    if (autosaveTimerRef.current === null) return;
    window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = null;
  }, []);

  const cancelPendingWalStage = useCallback(() => {
    if (walStageTimerRef.current === null) return;
    window.clearTimeout(walStageTimerRef.current);
    walStageTimerRef.current = null;
  }, []);

  const buildMissionBundle = useCallback(
    (
      rootPath: string,
      mission: MissionDocument,
      pointsByTrackId: TrackRecorderState['trackPointsByTrackId'],
      missionObjects: MapObject[],
      missionLaneFeatures: LaneFeature[],
      followEnabled: boolean,
      layersState: LayersState,
      diversState: DiverUiConfig[],
      baseStationSourceState: NavigationSourceId | null,
      baseStationTrackColorState: string,
      baseStationMarkerSizePxState: number,
      hiddenTrackIdsState: string[],
      baseStationTelemetryState: BaseStationTelemetryState | null,
      nextMapView: MissionUiState['map_view'] | null,
      nextCoordPrecision: number,
      nextGrid: AppUiDefaults['measurements']['grid'],
      nextSegmentLengthsMode: SegmentLengthsMode,
      nextStyles: AppUiDefaults['styles'],
      rasterOverlaysState: RasterOverlayUi[],
      vectorOverlaysState: VectorOverlayUi[],
      nextLeftPanelSectionsCollapsed: LeftPanelSectionsCollapsedState,
      nextRightPanelSectionsCollapsed: RightPanelSectionsCollapsedState,
      nextLeftPanelWidthPx: number,
      nextRightPanelWidthPx: number,
      nextMapPanelsCollapsed: MapPanelsCollapsedState,
    ): MissionBundle => {
      const geo = mapObjectsToGeoJson(missionObjects);
      const nextMission: MissionDocument = {
        ...mission,
        ui: {
          ...(mission.ui ?? {}),
          follow_diver: followEnabled,
          hidden_track_ids: hiddenTrackIdsState,
          divers: diversState,
          layers: {
            basemap: layersState.basemap,
            track: layersState.track,
            routes: layersState.routes,
            markers: layersState.markers,
            base_station: layersState.baseStation,
            grid: layersState.grid,
            scale_bar: layersState.scaleBar,
          },
          left_panel_sections: nextLeftPanelSectionsCollapsed,
          right_panel_sections: nextRightPanelSectionsCollapsed,
          panel_layout: {
            left_width_px: nextLeftPanelWidthPx,
            right_width_px: nextRightPanelWidthPx,
            left_collapsed: nextMapPanelsCollapsed.left,
            right_collapsed: nextMapPanelsCollapsed.right,
          },
          base_station: {
            navigation_source: baseStationSourceState,
            track_color: baseStationTrackColorState,
            marker_size_px: baseStationMarkerSizePxState,
            ...(baseStationTelemetryState
              ? {
                  lat: baseStationTelemetryState.lat,
                  lon: baseStationTelemetryState.lon,
                  heading_deg: baseStationTelemetryState.heading,
                  updated_at: new Date(baseStationTelemetryState.received_at).toISOString(),
                  source_id: baseStationTelemetryState.sourceId,
                }
              : {}),
          },
          ...(nextMapView ? { map_view: nextMapView } : {}),
          coordinates: { precision: nextCoordPrecision },
          measurements: {
            ...(mission.ui?.measurements ?? {}),
            grid: { ...nextGrid },
            segment_lengths_mode: nextSegmentLengthsMode,
          },
          raster_overlays: rasterOverlaysState,
          vector_overlays: vectorOverlaysState,
          styles: {
            track: { ...nextStyles.track },
            route: { ...nextStyles.route },
            survey_area: { ...nextStyles.survey_area },
            lane: { ...nextStyles.lane },
            marker: { ...nextStyles.marker },
          },
        },
      };

      return {
        rootPath,
        mission: nextMission,
        routes: {
          ...geo.routes,
          features: [...geo.routes.features, ...missionLaneFeatures],
        },
        markers: geo.markers,
        trackPointsByTrackId: pointsByTrackId,
      };
    },
    [],
  );

  const persistMissionSnapshot = useCallback(
    async (snapshot: WorkspaceSnapshot, options?: { closeActiveTrack?: boolean }) => {
      if (!snapshot.isLoaded || !snapshot.missionRootPath || !snapshot.recordingState.mission) {
        return;
      }

      if (options?.closeActiveTrack) {
        cancelPendingWalStage();
        cancelPendingAutosave();
      }

      const finalizedRecordingState = options?.closeActiveTrack
        ? trackRecorderReduce(snapshot.recordingState, { type: 'stopAll' })
        : snapshot.recordingState;
      if (!finalizedRecordingState.mission) return;

      const bundle = buildMissionBundle(
        snapshot.missionRootPath,
        finalizedRecordingState.mission,
        finalizedRecordingState.trackPointsByTrackId,
        snapshot.objects,
        snapshot.laneFeatures,
        snapshot.isFollowing,
        snapshot.layers,
        snapshot.divers,
        snapshot.baseStationNavigationSource,
        snapshot.baseStationTrackColor,
        snapshot.baseStationMarkerSizePx,
        snapshot.hiddenTrackIds,
        snapshot.baseStationTelemetry,
        snapshot.mapView,
        snapshot.coordPrecision,
        snapshot.grid,
        snapshot.segmentLengthsMode,
        snapshot.styles,
        snapshot.rasterOverlays,
        snapshot.vectorOverlays,
        snapshot.leftPanelSectionsCollapsed,
        snapshot.rightPanelSectionsCollapsed,
        snapshot.leftPanelWidthPx,
        snapshot.rightPanelWidthPx,
        snapshot.mapPanelsCollapsed,
      );
      await repository.saveMission(bundle);

      if (options?.closeActiveTrack) {
        latestSnapshotRef.current = {
          ...snapshot,
          recordingState: finalizedRecordingState,
        };
      }
    },
    [buildMissionBundle, cancelPendingAutosave, cancelPendingWalStage, repository],
  );

  const persistMissionBestEffort = useCallback(() => {
    cancelPendingWalStage();
    cancelPendingAutosave();
    void persistMissionSnapshot(latestSnapshotRef.current, { closeActiveTrack: true }).catch(() => {
      // Best effort on unload/pagehide.
    });
  }, [cancelPendingAutosave, cancelPendingWalStage, persistMissionSnapshot]);

  const updateFromBundle = useCallback((bundle: MissionBundle, draftMode: boolean) => {
    const effective = mergeDefaultsWithMissionUi(appSettingsRef.current.defaults, bundle.mission.ui);
    setMissionRootPath(bundle.rootPath);
    setRecordingState(createTrackRecorderState(bundle.mission, bundle.trackPointsByTrackId));
    setObjects(bundleToMapObjects(bundle));
    setLaneFeatures(bundle.routes.features.filter((feature): feature is LaneFeature => feature.properties.kind === 'lane'));
    setOutdatedZoneIds({});
    setMissionName(bundle.mission.name);
    setIsDraft(draftMode);
    const nextDivers = normalizeDivers(bundle.mission.ui?.divers);
    setMissionDivers(nextDivers);
    setDiverData(DEFAULT_DIVER_DATA);
    setHasPrimaryTelemetry(false);
    setHasPrimaryTelemetryHistory(false);
    setDiverTelemetryById({});
    hadFixBySourceRef.current = { zima2r: false, 'gnss-udp': false, 'gnss-com': false, simulation: false };
    zimaAzmLocFixRef.current = null;
    zimaRemFixByBeaconRef.current = {};
    gnssFixRef.current = null;
    gnssComFixRef.current = null;
    simulationFixRef.current = null;
    lastRecordedPrimaryFixAtRef.current = 0;
    lastRecordedFixByAgentRef.current = {};
    setSelectedAgentId(null);
    setPinnedAgentId(effective.follow_diver ? nextDivers[0]?.uid ?? null : null);
    setCenterOnObjectSelect(effective.interactions.center_on_object_select);
    setLayers({
      basemap: typeof bundle.mission.ui?.layers?.basemap === 'boolean' ? bundle.mission.ui.layers.basemap : true,
      track: effective.layers.track,
      routes: effective.layers.routes,
      markers: effective.layers.markers,
      baseStation: effective.layers.base_station,
      grid: effective.layers.grid,
      scaleBar: effective.layers.scale_bar,
      diver: true,
    });
    const sections = bundle.mission.ui?.left_panel_sections;
    setLeftPanelSectionsCollapsed({
      layers: typeof sections?.layers === 'boolean' ? sections.layers : DEFAULT_LEFT_PANEL_SECTIONS_COLLAPSED.layers,
      agents: typeof sections?.agents === 'boolean' ? sections.agents : DEFAULT_LEFT_PANEL_SECTIONS_COLLAPSED.agents,
      rasters: typeof sections?.rasters === 'boolean' ? sections.rasters : DEFAULT_LEFT_PANEL_SECTIONS_COLLAPSED.rasters,
      vectors: typeof sections?.vectors === 'boolean' ? sections.vectors : DEFAULT_LEFT_PANEL_SECTIONS_COLLAPSED.vectors,
      objects: typeof sections?.objects === 'boolean' ? sections.objects : DEFAULT_LEFT_PANEL_SECTIONS_COLLAPSED.objects,
    });
    const rightSections = bundle.mission.ui?.right_panel_sections;
    setRightPanelSectionsCollapsed({
      hud: typeof rightSections?.hud === 'boolean' ? rightSections.hud : DEFAULT_RIGHT_PANEL_SECTIONS_COLLAPSED.hud,
      status: typeof rightSections?.status === 'boolean' ? rightSections.status : DEFAULT_RIGHT_PANEL_SECTIONS_COLLAPSED.status,
      properties:
        typeof rightSections?.properties === 'boolean'
          ? rightSections.properties
          : DEFAULT_RIGHT_PANEL_SECTIONS_COLLAPSED.properties,
    });
    const panelLayout = bundle.mission.ui?.panel_layout;
    setLeftPanelWidthPx(clampSidePanelWidthPx(panelLayout?.left_width_px, DEFAULT_LEFT_PANEL_WIDTH_PX));
    setRightPanelWidthPx(clampSidePanelWidthPx(panelLayout?.right_width_px, DEFAULT_RIGHT_PANEL_WIDTH_PX));
    setMapPanelsCollapsed((prev) => ({
      top: prev.top,
      left: typeof panelLayout?.left_collapsed === 'boolean' ? panelLayout.left_collapsed : prev.left,
      right: typeof panelLayout?.right_collapsed === 'boolean' ? panelLayout.right_collapsed : prev.right,
    }));
    const baseStationUi = bundle.mission.ui?.base_station;
    const nextBaseStationSource = normalizeNavigationSourceId(
      baseStationUi?.navigation_source ?? baseStationUi?.source_id ?? null,
    );
    setBaseStationNavigationSource(nextBaseStationSource);
    setBaseStationTrackColor(
      typeof baseStationUi?.track_color === 'string' && baseStationUi.track_color.trim().length > 0
        ? baseStationUi.track_color
        : effective.styles.track.color,
    );
    setBaseStationMarkerSizePx(
      typeof baseStationUi?.marker_size_px === 'number' && Number.isFinite(baseStationUi.marker_size_px)
        ? baseStationUi.marker_size_px
        : DEFAULT_BASE_STATION_MARKER_SIZE_PX,
    );
    setHiddenTrackIds(
      Array.isArray(bundle.mission.ui?.hidden_track_ids)
        ? bundle.mission.ui?.hidden_track_ids.filter((id): id is string => typeof id === 'string')
        : [],
    );
    const nextRasterOverlays =
      Array.isArray(bundle.mission.ui?.raster_overlays)
        ? bundle.mission.ui.raster_overlays.filter(
            (item): item is RasterOverlayUi =>
              typeof item?.id === 'string' &&
              typeof item?.name === 'string' &&
              typeof item?.file === 'string' &&
              (typeof item?.tfw_file === 'undefined' || typeof item?.tfw_file === 'string') &&
              typeof item?.bounds?.north === 'number' &&
              typeof item?.bounds?.south === 'number' &&
              typeof item?.bounds?.east === 'number' &&
              typeof item?.bounds?.west === 'number' &&
              typeof item?.opacity === 'number' &&
              typeof item?.visible === 'boolean' &&
              typeof item?.z_index === 'number' &&
              (item?.source === 'geotiff' || item?.source === 'tif+tfw'),
          )
        : [];
    for (const { url } of rasterOverlayUrlCacheRef.current.values()) {
      URL.revokeObjectURL(url);
    }
    rasterOverlayUrlCacheRef.current.clear();
    rasterOverlayDecodeInFlightRef.current.clear();
    rasterDecodeFailedRef.current.clear();
    rasterDecodeErrorShownRef.current.clear();
    rasterBoundsErrorShownRef.current.clear();
    rasterRenderNotificationPendingRef.current.clear();
    for (const toastHandle of rasterRenderProgressToastRef.current.values()) {
      toastHandle.dismiss();
    }
    rasterRenderProgressToastRef.current.clear();
    // Cancel any pending decode resolvers from previous mission
    for (const resolve of rasterDecodePendingResolversRef.current.values()) {
      resolve();
    }
    rasterDecodePendingResolversRef.current.clear();
    // Split: hidden overlays go to state immediately; visible ones are queued for sequential decode
    const hiddenOverlays = nextRasterOverlays.filter((o) => !o.visible);
    const visibleOverlays = nextRasterOverlays.filter((o) => o.visible);
    setRasterOverlays(hiddenOverlays);
    if (visibleOverlays.length > 0) {
      void (async () => {
        for (const overlay of visibleOverlays) {
          rasterRenderNotificationPendingRef.current.add(overlay.id);
          const decodePromise = waitForRasterDecode(overlay.id);
          setRasterOverlays((prev) => [...prev, overlay]);
          await decodePromise;
        }
      })();
    }
    vectorRenderNotificationPendingRef.current.clear();
    for (const toastHandle of vectorRenderProgressToastRef.current.values()) {
      toastHandle.dismiss();
    }
    vectorRenderProgressToastRef.current.clear();
    const nextVectorOverlays = Array.isArray(bundle.mission.ui?.vector_overlays)
      ? bundle.mission.ui.vector_overlays
          .filter(
            (item): item is VectorOverlayUi =>
              typeof item?.id === 'string' &&
              typeof item?.name === 'string' &&
              typeof item?.file === 'string' &&
              (typeof item?.cache_file === 'undefined' || typeof item?.cache_file === 'string') &&
              (typeof item?.color === 'undefined' || typeof item?.color === 'string') &&
              (item?.type === 'dxf' || item?.type === 'dwg') &&
              (typeof item?.file_encoding === 'undefined' ||
                item?.file_encoding === 'utf8' ||
                item?.file_encoding === 'base64') &&
              Number.isInteger(item?.utm_zone) &&
              item.utm_zone >= 1 &&
              item.utm_zone <= 60 &&
              (item?.utm_hemisphere === 'N' || item?.utm_hemisphere === 'S') &&
              typeof item?.opacity === 'number' &&
              typeof item?.visible === 'boolean' &&
              typeof item?.z_index === 'number',
          )
          .map((item) => ({
            ...item,
            cache_file: resolveVectorOverlayCacheFilePath(item),
          }))
      : [];
    for (const overlay of nextVectorOverlays) {
      if (overlay.visible) {
        vectorRenderNotificationPendingRef.current.add(overlay.id);
      }
    }
    setVectorOverlays(nextVectorOverlays);
    vectorOverlayCacheRef.current.clear();
    vectorOverlayErrorShownRef.current.clear();
    setVectorOverlayDataById({});
    const baseLat = typeof baseStationUi?.lat === 'number' ? baseStationUi.lat : null;
    const baseLon = typeof baseStationUi?.lon === 'number' ? baseStationUi.lon : null;
    const baseHeadingRaw = baseStationUi?.heading_deg;
    const baseHeading =
      typeof baseHeadingRaw === 'number' && Number.isFinite(baseHeadingRaw) ? baseHeadingRaw : null;
    const updatedAt = baseStationUi?.updated_at ? Date.parse(baseStationUi.updated_at) : NaN;
    if (baseLat !== null && baseLon !== null && Number.isFinite(baseLat) && Number.isFinite(baseLon)) {
      setBaseStationTelemetry({
        lat: baseLat,
        lon: baseLon,
        speed: 0,
        course: baseHeading ?? 0,
        heading: baseHeading,
        depth: 0,
        received_at: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
        sourceId: nextBaseStationSource,
      });
    } else {
      setBaseStationTelemetry(null);
    }
    setCoordPrecision(effective.coordinates.precision);
    setCoordinateInputCrs(effective.coordinates.input_crs);
    setCoordinateInputFormat(effective.coordinates.input_format);
    setGridSettings(effective.measurements.grid);
    setSegmentLengthsMode(effective.measurements.segment_lengths_mode);
    setStyles(effective.styles);
    setMapView(bundle.mission.ui?.map_view ?? null);
    setAutoSaveStatus('saved');
    setSelectedObjectId(null);
    setCenterRequest(null);
    setIsLoaded(true);
    setShouldAutoStartRecording(!draftMode);
  }, [waitForRasterDecode]);

  const loadDraft = useCallback(
    async (mode: DraftLoadMode) => {
      const bundle = await loadDraftSession(mode, {
        draftExists: () => platform.fileStore.exists(`${DRAFT_ROOT_PATH}/mission.json`),
        clearDraft: () => platform.fileStore.remove(DRAFT_ROOT_PATH),
        createDraft: () =>
          repository.createMission(
            {
              rootPath: DRAFT_ROOT_PATH,
              name: DRAFT_MISSION_NAME,
              ui: toMissionUiFromDefaults(appSettingsRef.current.defaults),
            },
            { acquireLock: false },
          ),
        openDraft: () => repository.openMission(DRAFT_ROOT_PATH, { acquireLock: false }),
        onRecoverMissing: () => {
          window.alert('Автосохраненный черновик не найден. Создан новый черновик.');
        },
      });
      await releaseCurrentLock();
      updateFromBundle(bundle, true);
    },
    [releaseCurrentLock, repository, updateFromBundle],
  );

  useEffect(() => {
    const init = async () => {
      const params = new URLSearchParams(location.search);
      const mode = params.get('mode');
      const missionPath = params.get('mission');

      try {
        const storedSettings = await platform.settings.readJson<unknown>(APP_SETTINGS_STORAGE_KEY);
        const normalized = normalizeAppSettings(storedSettings);
        appSettingsRef.current = normalized;
        setCoordPrecision(normalized.defaults.coordinates.precision);
        setCoordinateInputCrs(normalized.defaults.coordinates.input_crs);
        setCoordinateInputFormat(normalized.defaults.coordinates.input_format);
        setGridSettings(normalized.defaults.measurements.grid);
        setSegmentLengthsMode(normalized.defaults.measurements.segment_lengths_mode);
        setStyles(normalized.defaults.styles);
        setConnectionSettings(normalized.defaults.connection);
        setCenterOnObjectSelect(normalized.defaults.interactions.center_on_object_select);
        setMapPanelsCollapsed({
          top: normalized.workspace.map_panels.top_collapsed,
          left: normalized.workspace.map_panels.left_collapsed,
          right: normalized.workspace.map_panels.right_collapsed,
        });
        appSettingsReadyRef.current = true;

        if (location.pathname === '/create-mission') {
          await loadDraft('resume');
          setShowCreateMission(true);
          return;
        }

        if (location.pathname === '/open-mission') {
          await loadDraft('resume');
          setShowOpenMission(true);
          return;
        }

        if (missionPath) {
          await releaseCurrentLock();
          const bundle = await repository.openMission(missionPath, { acquireLock: true, recoverLock: true });
          lockOwnerRootRef.current = bundle.rootPath;
          updateFromBundle(bundle, false);
          return;
        }

        await loadDraft(resolveDraftLoadMode(mode));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Не удалось открыть миссию';
        const shouldSilenceDraftMissingAlert =
          (location.pathname === '/create-mission' || location.pathname === '/open-mission') &&
          isMissionFileMissingError(error);
        if (!shouldSilenceDraftMissingAlert) {
          window.alert(message);
        }
        appSettingsReadyRef.current = true;
        await loadDraft('resume');
        if (location.pathname === '/create-mission') {
          setShowCreateMission(true);
        } else if (location.pathname === '/open-mission') {
          setShowOpenMission(true);
        }
      }
    };

    void init();
    return () => {
      void releaseCurrentLock();
    };
  }, [loadDraft, location.pathname, location.search, releaseCurrentLock, repository, updateFromBundle]);

  useEffect(() => {
    if (!appSettingsReadyRef.current) return;

    const current = appSettingsRef.current.workspace.map_panels;
    if (
      current.top_collapsed === mapPanelsCollapsed.top &&
      current.left_collapsed === mapPanelsCollapsed.left &&
      current.right_collapsed === mapPanelsCollapsed.right
    ) {
      return;
    }

    const nextSettings: AppSettingsV1 = {
      ...appSettingsRef.current,
      workspace: {
        map_panels: {
          top_collapsed: mapPanelsCollapsed.top,
          left_collapsed: mapPanelsCollapsed.left,
          right_collapsed: mapPanelsCollapsed.right,
        },
      },
    };

    appSettingsRef.current = nextSettings;
    void platform.settings.writeJson(APP_SETTINGS_STORAGE_KEY, nextSettings).catch(() => {
      // Best effort persistence for workspace layout.
    });
  }, [mapPanelsCollapsed]);

  useEffect(() => {
    // Per R-015: recording is no longer auto-started for all agents.
    // Active tracks are restored from mission.active_tracks by createTrackRecorderState.
    if (!isLoaded || isDraft || !shouldAutoStartRecording) return;
    setShouldAutoStartRecording(false);
    // If mission had active_tracks saved, they are already restored by hydration.
    // No additional start events needed.
  }, [isDraft, isLoaded, shouldAutoStartRecording]);

  useEffect(() => {
    if (!isLoaded || !missionDocument || !missionRootPath) return;
    if (walStageTimerRef.current !== null) {
      window.clearTimeout(walStageTimerRef.current);
    }
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
    }

    const buildCurrentBundle = () =>
      buildMissionBundle(
        missionRootPath,
        missionDocument,
        trackPointsByTrackId,
        objects,
        laneFeatures,
        isFollowing,
        layers,
        missionDivers,
        baseStationNavigationSource,
        baseStationTrackColor,
        baseStationMarkerSizePx,
        hiddenTrackIds,
        baseStationTelemetry,
        mapView,
        coordPrecision,
        gridSettings,
        segmentLengthsMode,
        styles,
        rasterOverlays,
        vectorOverlays,
        leftPanelSectionsCollapsed,
        rightPanelSectionsCollapsed,
        leftPanelWidthPx,
        rightPanelWidthPx,
        mapPanelsCollapsed,
      );

    walStageTimerRef.current = window.setTimeout(async () => {
      walStageTimerRef.current = null;
      try {
        await repository.stageMission(buildCurrentBundle());
      } catch {
        // keep checkpoint autosave running; status reflects checkpoint result
      }
    }, WAL_STAGE_DELAY_MS);

    setAutoSaveStatus('saving');
    autosaveTimerRef.current = window.setTimeout(async () => {
      autosaveTimerRef.current = null;
      try {
        await repository.saveMission(buildCurrentBundle());
        setAutoSaveStatus('saved');
      } catch {
        setAutoSaveStatus('error');
      }
    }, AUTOSAVE_DELAY_MS);

    return () => {
      if (walStageTimerRef.current !== null) {
        window.clearTimeout(walStageTimerRef.current);
        walStageTimerRef.current = null;
      }
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [
    buildMissionBundle,
    isFollowing,
    isLoaded,
    layers,
    missionDocument,
    missionRootPath,
    objects,
    laneFeatures,
    missionDivers,
    baseStationNavigationSource,
    baseStationTrackColor,
    baseStationMarkerSizePx,
    hiddenTrackIds,
    baseStationTelemetry,
    repository,
    trackPointsByTrackId,
    mapView,
    coordPrecision,
    gridSettings,
    segmentLengthsMode,
    styles,
    rasterOverlays,
    vectorOverlays,
    leftPanelSectionsCollapsed,
    rightPanelSectionsCollapsed,
    leftPanelWidthPx,
    rightPanelWidthPx,
    mapPanelsCollapsed,
  ]);

  const applyPrimaryConnectionState = useCallback((nextState: TelemetryConnectionState) => {
    const previousState = connectionStateRef.current;
    connectionStateRef.current = nextState;
    setConnectionStatus(nextState);

    if (nextState === 'ok') {
      if (previousState !== 'ok') {
        // Dispatch connectionRestored for all agents that are recording
        const divers = missionDiversRef.current;
        for (const diver of divers) {
          setRecordingState((prev) => trackRecorderReduce(prev, { type: 'connectionRestored', agentId: diver.uid }));
        }
        setRecordingState((prev) => trackRecorderReduce(prev, { type: 'connectionRestored', agentId: BASE_STATION_AGENT_ID }));
      }
      setConnectionLostSeconds(0);
      return;
    }

    setHasPrimaryTelemetry(false);
    setConnectionLostSeconds(Math.max(1, Math.floor((Date.now() - lastFixAtRef.current) / 1000)));
  }, []);

  const syncDiverTelemetry = useCallback(() => {
    const divers = missionDiversRef.current;
    const nextById: Record<string, DiverTelemetryState> = {};

    divers.forEach((diver) => {
      const source = diver.navigation_source;
      if (!isSourceEnabled(source)) {
        return;
      }
      const providerSource = resolveProviderSource(source);
      if (!providerSource) return;
      let telemetry: DiverTelemetryState | null = null;

      if (providerSource === 'gnss-udp') {
        telemetry = gnssFixRef.current;
      } else if (providerSource === 'gnss-com') {
        telemetry = gnssComFixRef.current;
      } else if (providerSource === 'simulation') {
        telemetry = simulationFixRef.current;
      } else {
        const beaconKey = normalizeBeaconBindingKey(diver.beacon_id ?? diver.id);
        if (beaconKey) {
          telemetry = zimaRemFixByBeaconRef.current[beaconKey] ?? null;
        }
      }

      const diverKey = diver.id.trim();
      if (telemetry && diverKey) {
        nextById[diverKey] = telemetry;
      }
    });

    setDiverTelemetryById((prev) => {
      const keys = new Set([...Object.keys(prev), ...Object.keys(nextById)]);
      for (const key of keys) {
        if (!isSameTelemetryState(prev[key], nextById[key])) {
          return nextById;
        }
      }
      return prev;
    });

    const primarySource = primaryNavigationSourceRef.current;
    const primaryProviderSource = resolveProviderSource(primarySource);
    const primaryFix =
      primaryProviderSource === 'zima2r'
        ? zimaAzmLocFixRef.current
        : primaryProviderSource === 'gnss-udp'
          ? gnssFixRef.current
          : primaryProviderSource === 'gnss-com'
            ? gnssComFixRef.current
          : primaryProviderSource === 'simulation'
            ? simulationFixRef.current
            : null;

    if (!primaryFix) {
      setHasPrimaryTelemetry(false);
      return;
    }

    setHasPrimaryTelemetry(true);
    setHasPrimaryTelemetryHistory(true);

    setDiverData({
      lat: primaryFix.lat,
      lon: primaryFix.lon,
      speed: primaryFix.speed,
      course: Math.round(primaryFix.course),
      depth: primaryFix.depth,
    });

    // Dispatch per-agent fix events for all agents that have telemetry
    divers.forEach((diver) => {
      const diverKey = diver.id.trim();
      const agentTelemetry = nextById[diverKey];
      if (!agentTelemetry) return;

      const lastRecordedAt = lastRecordedFixByAgentRef.current[diver.uid] ?? 0;
      if (agentTelemetry.received_at === lastRecordedAt) return;
      lastRecordedFixByAgentRef.current[diver.uid] = agentTelemetry.received_at;

      setRecordingState((prev) =>
        trackRecorderReduce(prev, {
          type: 'fixReceived',
          agentId: diver.uid,
          fix: {
            lat: agentTelemetry.lat,
            lon: agentTelemetry.lon,
            speed: agentTelemetry.speed,
            course: agentTelemetry.course,
            depth: agentTelemetry.depth,
            timestamp: new Date(agentTelemetry.received_at).toISOString(),
          },
        }),
      );
    });
  }, [isSourceEnabled, resolveProviderSource]);

  const resolveTelemetryBySource = useCallback((sourceId: NavigationSourceId | null): DiverTelemetryState | null => {
    const providerSource = resolveProviderSource(sourceId);
    if (providerSource === 'zima2r') return zimaAzmLocFixRef.current;
    if (providerSource === 'gnss-udp') return gnssFixRef.current;
    if (providerSource === 'gnss-com') return gnssComFixRef.current;
    if (providerSource === 'simulation') return simulationFixRef.current;
    return null;
  }, [resolveProviderSource]);

  const syncBaseStationTelemetry = useCallback(() => {
    if (!baseStationNavigationSource || !isSourceEnabled(baseStationNavigationSource)) {
      setBaseStationTelemetry(null);
      return;
    }

    const telemetry = resolveTelemetryBySource(baseStationNavigationSource);
    if (!telemetry) return;

    const status = trackStatusByAgentId[BASE_STATION_AGENT_ID] ?? 'stopped';
    if (status === 'recording') {
      const lastRecordedAt = lastRecordedFixByAgentRef.current[BASE_STATION_AGENT_ID] ?? 0;
      if (telemetry.received_at !== lastRecordedAt) {
        lastRecordedFixByAgentRef.current[BASE_STATION_AGENT_ID] = telemetry.received_at;
        setRecordingState((prev) =>
          trackRecorderReduce(prev, {
            type: 'fixReceived',
            agentId: BASE_STATION_AGENT_ID,
            fix: {
              lat: telemetry.lat,
              lon: telemetry.lon,
              speed: telemetry.speed,
              course: telemetry.course,
              depth: telemetry.depth,
              timestamp: new Date(telemetry.received_at).toISOString(),
            },
          }),
        );
      }
    }

    const next: BaseStationTelemetryState = {
      lat: telemetry.lat,
      lon: telemetry.lon,
      speed: telemetry.speed,
      course: telemetry.course,
      heading: telemetry.heading,
      depth: telemetry.depth,
      received_at: telemetry.received_at,
      sourceId: baseStationNavigationSource,
    };

    setBaseStationTelemetry((prev) => {
      if (!prev) return next;
      if (
        prev.lat === next.lat &&
        prev.lon === next.lon &&
        prev.heading === next.heading &&
        prev.course === next.course &&
        prev.speed === next.speed &&
        prev.depth === next.depth &&
        prev.received_at === next.received_at &&
        prev.sourceId === next.sourceId
      ) {
        return prev;
      }
      return next;
    });
  }, [baseStationNavigationSource, isSourceEnabled, resolveTelemetryBySource, trackStatusByAgentId]);

  const handleTelemetryFix = useCallback(
    (sourceId: ProviderSourceId, fix: TelemetryFix) => {
      lastFixAtBySourceRef.current[sourceId] = fix.received_at;
      hadFixBySourceRef.current[sourceId] = true;

      const telemetryState: DiverTelemetryState = {
        lat: fix.lat,
        lon: fix.lon,
        speed: fix.speed,
        course: fix.course,
        heading:
          typeof fix.heading === 'number' && Number.isFinite(fix.heading)
            ? fix.heading
            : typeof fix.course === 'number' && Number.isFinite(fix.course)
              ? fix.course
              : null,
        depth: fix.depth,
        received_at: fix.received_at,
      };

      if (sourceId === 'zima2r') {
        if (fix.source === 'AZMLOC') {
          zimaAzmLocFixRef.current = telemetryState;
        } else if (fix.source === 'AZMREM') {
          const beaconKey = normalizeBeaconBindingKey(fix.beaconId ?? fix.remoteAddress);
          if (beaconKey) {
            zimaRemFixByBeaconRef.current[beaconKey] = telemetryState;
          }
        }
      } else if (sourceId === 'gnss-udp') {
        gnssFixRef.current = telemetryState;
      } else if (sourceId === 'gnss-com') {
        gnssComFixRef.current = telemetryState;
      } else {
        simulationFixRef.current = telemetryState;
      }

      if (resolveProviderSource(primaryNavigationSourceRef.current) === sourceId) {
        lastFixAtRef.current = fix.received_at;
        setConnectionLostSeconds(0);
        setHasPrimaryTelemetryHistory(true);
      }

      syncDiverTelemetry();
      syncBaseStationTelemetry();
    },
    [resolveProviderSource, syncBaseStationTelemetry, syncDiverTelemetry],
  );

  useEffect(() => {
    syncDiverTelemetry();
  }, [missionDivers, syncDiverTelemetry]);

  useEffect(() => {
    syncBaseStationTelemetry();
  }, [baseStationNavigationSource, syncBaseStationTelemetry]);

  const handleDeviceConnectionState = useCallback(
    (sourceId: ProviderSourceId, nextState: TelemetryConnectionState) => {
      if (sourceId === 'zima2r' || sourceId === 'gnss-udp' || sourceId === 'gnss-com') {
        setDeviceConnectionStatus((prev) => ({ ...prev, [sourceId]: nextState }));
      } else {
        setSimulationConnectionStatus(nextState);
      }
      if (resolveProviderSource(primaryNavigationSourceRef.current) === sourceId) {
        applyPrimaryConnectionState(nextState);
      }
    },
    [applyPrimaryConnectionState, resolveProviderSource],
  );

  useEffect(() => {
    primaryNavigationSourceRef.current = primaryNavigationSource;
    const primaryProviderSource = resolveProviderSource(primaryNavigationSource);
    lastFixAtRef.current = primaryProviderSource ? (lastFixAtBySourceRef.current[primaryProviderSource] ?? Date.now()) : Date.now();
    setHasPrimaryTelemetryHistory(Boolean(primaryProviderSource && hadFixBySourceRef.current[primaryProviderSource]));

    const nextStatus =
      primaryProviderSource === 'zima2r' ||
      primaryProviderSource === 'gnss-udp' ||
      primaryProviderSource === 'gnss-com'
        ? deviceConnectionStatus[primaryProviderSource]
        : primaryProviderSource === 'simulation'
          ? simulationConnectionStatus
          : 'timeout';
    applyPrimaryConnectionState(nextStatus ?? 'ok');
    syncDiverTelemetry();
    syncBaseStationTelemetry();
  }, [
    applyPrimaryConnectionState,
    deviceConnectionStatus,
    primaryNavigationSource,
    resolveProviderSource,
    simulationConnectionStatus,
    syncBaseStationTelemetry,
    syncDiverTelemetry,
  ]);

  useEffect(() => {
    if (isPrimarySourceEnabled) return;
    const primaryProviderSource = resolveProviderSource(primaryNavigationSource);
    if (primaryProviderSource) {
      hadFixBySourceRef.current[primaryProviderSource] = false;
    }
    setHasPrimaryTelemetry(false);
    setHasPrimaryTelemetryHistory(false);
    syncDiverTelemetry();
    syncBaseStationTelemetry();
  }, [isPrimarySourceEnabled, primaryNavigationSource, resolveProviderSource, syncBaseStationTelemetry, syncDiverTelemetry]);

  useEffect(() => {
    if (isElectronRuntime) {
      const unsubscribeZimaFix = zimaTelemetryProvider.onFix((fix) => handleTelemetryFix('zima2r', fix));
      const unsubscribeZimaConnection = zimaTelemetryProvider.onConnectionState((state) =>
        handleDeviceConnectionState('zima2r', state),
      );
      const unsubscribeGnssFix = gnssTelemetryProvider.onFix((fix) => handleTelemetryFix('gnss-udp', fix));
      const unsubscribeGnssConnection = gnssTelemetryProvider.onConnectionState((state) =>
        handleDeviceConnectionState('gnss-udp', state),
      );
      const unsubscribeGnssComFix = gnssComTelemetryProvider.onFix((fix) => handleTelemetryFix('gnss-com', fix));
      const unsubscribeGnssComConnection = gnssComTelemetryProvider.onConnectionState((state) =>
        handleDeviceConnectionState('gnss-com', state),
      );
      zimaTelemetryProvider.start();
      gnssTelemetryProvider.start();
      gnssComTelemetryProvider.start();

      return () => {
        unsubscribeZimaFix();
        unsubscribeZimaConnection();
        unsubscribeGnssFix();
        unsubscribeGnssConnection();
        unsubscribeGnssComFix();
        unsubscribeGnssComConnection();
        zimaTelemetryProvider.stop();
        gnssTelemetryProvider.stop();
        gnssComTelemetryProvider.stop();
      };
    }

    const unsubscribeSimulationFix = simulationTelemetryProvider.onFix((fix) => handleTelemetryFix('simulation', fix));
    const unsubscribeSimulationConnection = simulationTelemetryProvider.onConnectionState((state) =>
      handleDeviceConnectionState('simulation', state),
    );
    simulationTelemetryProvider.start();
    return () => {
      unsubscribeSimulationFix();
      unsubscribeSimulationConnection();
      simulationTelemetryProvider.stop();
    };
  }, [
    gnssComTelemetryProvider,
    gnssTelemetryProvider,
    handleDeviceConnectionState,
    handleTelemetryFix,
    isElectronRuntime,
    simulationTelemetryProvider,
    zimaTelemetryProvider,
  ]);

  useEffect(() => {
    if (isElectronRuntime) {
      const zimaEnabled = navigationSourceOptions.some(
        (option) => option.schemaId === 'zima2r' && Boolean(equipmentEnabledBySource[option.id]),
      );
      const gnssEnabled = navigationSourceOptions.some(
        (option) => option.schemaId === 'gnss-udp' && Boolean(equipmentEnabledBySource[option.id]),
      );
      const gnssComEnabled = navigationSourceOptions.some(
        (option) => option.schemaId === 'gnss-com' && Boolean(equipmentEnabledBySource[option.id]),
      );
      zimaTelemetryProvider.setEnabled(zimaEnabled);
      gnssTelemetryProvider.setEnabled(gnssEnabled);
      gnssComTelemetryProvider.setEnabled(gnssComEnabled);
      return;
    }
    simulationTelemetryProvider.setEnabled(simulationEnabled);
  }, [
    equipmentEnabledBySource,
    gnssComTelemetryProvider,
    gnssTelemetryProvider,
    isElectronRuntime,
    navigationSourceOptions,
    simulationEnabled,
    simulationTelemetryProvider,
    zimaTelemetryProvider,
  ]);

  useEffect(() => {
    if (isElectronRuntime) return;
    simulationTelemetryProvider.setSimulateConnectionError(simulateConnectionError);
  }, [isElectronRuntime, simulateConnectionError, simulationTelemetryProvider]);

  useEffect(() => {
    if (!isElectronRuntime) return;
    void loadActiveEquipmentProfile();
  }, [isElectronRuntime, loadActiveEquipmentProfile]);

  useEffect(() => {
    if (!isElectronRuntime || !showSettings) return;
    void loadActiveEquipmentProfile();
  }, [isElectronRuntime, loadActiveEquipmentProfile, showSettings]);

  useEffect(() => {
    if (connectionStatus === 'ok') {
      return;
    }
    const intervalId = window.setInterval(() => {
      setConnectionLostSeconds(Math.max(1, Math.floor((Date.now() - lastFixAtRef.current) / 1000)));
    }, 1000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [connectionStatus]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setDeviceConnectionLostSeconds({
        zima2r:
          deviceConnectionStatus.zima2r === 'ok'
            ? 0
            : Math.max(1, Math.floor((Date.now() - lastFixAtBySourceRef.current.zima2r) / 1000)),
        'gnss-udp':
          deviceConnectionStatus['gnss-udp'] === 'ok'
            ? 0
            : Math.max(1, Math.floor((Date.now() - lastFixAtBySourceRef.current['gnss-udp']) / 1000)),
        'gnss-com':
          deviceConnectionStatus['gnss-com'] === 'ok'
            ? 0
            : Math.max(1, Math.floor((Date.now() - lastFixAtBySourceRef.current['gnss-com']) / 1000)),
      });
    }, 1000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [deviceConnectionStatus]);

  useEffect(() => {
    const handlePageHide = () => {
      persistMissionBestEffort();
      void releaseCurrentLock();
    };
    const handleBeforeUnload = () => {
      persistMissionBestEffort();
      void releaseCurrentLock();
    };
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      persistMissionBestEffort();
      void releaseCurrentLock();
    };
  }, [persistMissionBestEffort, releaseCurrentLock]);

  useEffect(() => {
    if (!isElectronRuntime) return;
    const lifecycleApi = getElectronLifecycleApi();
    if (!lifecycleApi) return;

    const unsubscribe = lifecycleApi.onPrepareClose((payload) => {
      const token = typeof payload?.token === 'string' ? payload.token : '';
      if (!token) {
        lifecycleApi.resolvePrepareClose({ token: '', ok: false, error: 'missing prepare-close token' });
        return;
      }

      const runPrepareClose = async () => {
        try {
          await persistMissionSnapshot(latestSnapshotRef.current, { closeActiveTrack: true });
        } catch {
          // Keep close flow resilient; lock release still attempted.
        }

        try {
          await releaseCurrentLock();
        } catch {
          // Main process still applies timeout fallback.
        }
      };

      const inFlight = prepareCloseInFlightRef.current ?? runPrepareClose();
      prepareCloseInFlightRef.current = inFlight;

      void inFlight
        .then(() => {
          lifecycleApi.resolvePrepareClose({ token, ok: true });
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          lifecycleApi.resolvePrepareClose({ token, ok: false, error: message });
        })
        .finally(() => {
          if (prepareCloseInFlightRef.current === inFlight) {
            prepareCloseInFlightRef.current = null;
          }
        });
    });

    return () => {
      unsubscribe();
    };
  }, [isElectronRuntime, persistMissionSnapshot, releaseCurrentLock]);

  const handleToolChange = (tool: Tool) => {
    setActiveTool(tool);
  };

  const measureObjectsCount = useMemo(
    () => objects.reduce((count, obj) => (obj.type === 'measure' ? count + 1 : count), 0),
    [objects],
  );

  const handleOpenClearMeasuresDialog = useCallback(() => {
    setShowClearMeasuresDialog(true);
  }, []);

  const handleClearAllMeasures = useCallback(() => {
    setObjects((prevObjects) => {
      const removedIds = new Set(
        prevObjects.filter((obj) => obj.type === 'measure').map((obj) => obj.id),
      );
      if (removedIds.size === 0) return prevObjects;
      const nextObjects = prevObjects.filter((obj) => obj.type !== 'measure');
      setSelectedObjectId((currentSelectedId) => {
        if (!currentSelectedId) return currentSelectedId;
        return removedIds.has(currentSelectedId) ? null : currentSelectedId;
      });
      return nextObjects;
    });
    setShowClearMeasuresDialog(false);
  }, []);

  const handleMapViewChange = useCallback((next: { center_lat: number; center_lon: number; zoom: number }) => {
    setMapView((prev) => {
      if (!prev) return next;
      const dLat = Math.abs(prev.center_lat - next.center_lat);
      const dLon = Math.abs(prev.center_lon - next.center_lon);
      if (dLat < 1e-7 && dLon < 1e-7 && prev.zoom === next.zoom) return prev;
      return next;
    });
  }, []);

  const handleMapBoundsChange = useCallback((next: MapBounds) => {
    setMapBounds((prev) => {
      if (
        prev &&
        prev.north === next.north &&
        prev.south === next.south &&
        prev.east === next.east &&
        prev.west === next.west
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  const handleLayerToggle = (layer: keyof LayersState) => {
    if (layer === 'diver') return;
    setLayers((prev) => ({ ...prev, [layer]: !prev[layer] }));
  };

  const handleTrackAction = (action: 'pause' | 'resume') => {
    if (!isRecordingControlsEnabled) return;

    if (action === 'pause') {
      setRecordingState((prev) => {
        let next = prev;
        for (const diver of missionDivers) {
          const agentId = diver.uid;
          if (!agentId) continue;
          const status = next.trackStatusByAgentId[agentId] ?? 'stopped';
          if (status === 'recording') {
            next = trackRecorderReduce(next, { type: 'pause', agentId });
          }
        }
        const baseStationStatus = next.trackStatusByAgentId[BASE_STATION_AGENT_ID] ?? 'stopped';
        if (baseStationStatus === 'recording') {
          next = trackRecorderReduce(next, { type: 'pause', agentId: BASE_STATION_AGENT_ID });
        }
        return next;
      });
      return;
    }

    if (isDraft) {
      setShowCreateMission(true);
      return;
    }

    setRecordingState((prev) => {
      let next = prev;
        for (const diver of missionDivers) {
          const agentId = diver.uid;
          if (!agentId) continue;
          const status = next.trackStatusByAgentId[agentId] ?? 'stopped';
          if (status !== 'recording') {
            next = trackRecorderReduce(next, {
              type: 'resume',
              agentId,
              trackColor: diver.track_color ?? styles.track.color,
            });
          }
        }
        const baseStationStatus = next.trackStatusByAgentId[BASE_STATION_AGENT_ID] ?? 'stopped';
        if (baseStationStatus !== 'recording') {
          next = trackRecorderReduce(next, {
            type: 'resume',
            agentId: BASE_STATION_AGENT_ID,
            trackColor: baseStationTrackColor || styles.track.color,
          });
        }
        return next;
      });
  };

  const handleAgentToggleRecording = (agentUid: string) => {
    if (!isRecordingControlsEnabled) return;
    if (isDraft) {
      setShowCreateMission(true);
      return;
    }
    const currentStatus = trackStatusByAgentId[agentUid] ?? 'stopped';
    const diver = missionDivers.find((item) => item.uid === agentUid);
    const trackColor = diver?.track_color ?? styles.track.color;
    if (currentStatus === 'recording') {
      setRecordingState((prev) => trackRecorderReduce(prev, { type: 'pause', agentId: agentUid }));
    } else {
      setRecordingState((prev) =>
        trackRecorderReduce(prev, { type: 'start', agentId: agentUid, trackColor }),
      );
    }
  };

  const handleBaseStationTrackAction = useCallback(
    (action: 'start' | 'pause' | 'stop') => {
      if (!isRecordingControlsEnabled) return;
      if (isDraft && action === 'start') {
        setShowCreateMission(true);
        return;
      }
      if (isDraft) return;
      setRecordingState((prev) =>
        trackRecorderReduce(prev, {
          type: action === 'start' ? 'start' : action,
          agentId: BASE_STATION_AGENT_ID,
          ...(action === 'start' ? { trackColor: baseStationTrackColor || styles.track.color } : {}),
        }),
      );
    },
    [baseStationTrackColor, isDraft, isRecordingControlsEnabled, styles.track.color],
  );

  const handleAgentPin = useCallback((agentUid: string) => {
    setPinnedAgentId((prev) => (prev === agentUid ? null : agentUid));
  }, []);

  const handleAgentCenter = useCallback(
    (agentUid: string) => {
      if (agentUid === BASE_STATION_AGENT_ID) {
        if (baseStationTelemetry) {
          setPinnedAgentId(null);
          setMapView({
            center_lat: baseStationTelemetry.lat,
            center_lon: baseStationTelemetry.lon,
            zoom: mapView?.zoom ?? 16,
          });
        }
        return;
      }
      const diver = missionDivers.find((d) => d.uid === agentUid);
      if (!diver) return;
      const key = diver.id.trim();
      const telemetry = diverTelemetryById[key];
      if (telemetry) {
        setPinnedAgentId(null);
        setMapView({
          center_lat: telemetry.lat,
          center_lon: telemetry.lon,
          zoom: mapView?.zoom ?? 16,
        });
      }
    },
    [baseStationTelemetry, diverTelemetryById, mapView?.zoom, missionDivers],
  );

  const handleTrackDelete = (trackId: string) => {
    const track = missionDocument?.tracks.find((item) => item.id === trackId);
    if (!track) return;

    // Check if this is an active track for any agent
    const ownerAgentId = track.agent_id;
    const isActive = ownerAgentId
      ? missionDocument?.active_tracks[ownerAgentId] === trackId
      : missionDocument?.active_track_id === trackId;
    const question = isActive
      ? 'Удалить активный трек? Запись будет остановлена.'
      : 'Удалить выбранный трек?';
    if (!window.confirm(question)) {
      return;
    }

    setRecordingState((prev) => trackRecorderReduce(prev, { type: 'deleteTrack', trackId }));
  };

  const handleObjectSelect = (id: string | null) => {
    setSelectedObjectId(id);
    if (id && centerOnObjectSelect) {
      requestCenterOnObject(id);
    }
  };

  const handleCreateMission = async (name: string, path: string) => {
    try {
      await releaseCurrentLock();

      const ensureDraftReadyForConversion = async () => {
        const draftMissionPath = `${DRAFT_ROOT_PATH}/mission.json`;
        const draftExists = await platform.fileStore.exists(draftMissionPath);
        if (!draftExists) {
          await loadDraft('resume');
        }
        await persistMissionSnapshot(latestSnapshotRef.current, { closeActiveTrack: true });
      };

      let bundle: MissionBundle;
      if (isDraft) {
        await ensureDraftReadyForConversion();
        try {
          bundle = await repository.convertDraftToMission({
            draftRootPath: DRAFT_ROOT_PATH,
            missionRootPath: path,
            name,
          });
        } catch (error) {
          if (!isMissionFileMissingError(error)) {
            throw error;
          }
          await ensureDraftReadyForConversion();
          bundle = await repository.convertDraftToMission({
            draftRootPath: DRAFT_ROOT_PATH,
            missionRootPath: path,
            name,
          });
        }
      } else {
        bundle = await repository.createMission(
          { rootPath: path, name, ui: toMissionUiFromDefaults(appSettingsRef.current.defaults) },
          { acquireLock: true },
        );
      }

      lockOwnerRootRef.current = bundle.rootPath;
      updateFromBundle(bundle, false);
      setShowCreateMission(false);
      navigate(`/map?mission=${encodeURIComponent(bundle.rootPath)}`, { replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось создать миссию';
      window.alert(message);
    }
  };

  const handleOpenMission = async (path: string) => {
    try {
      await releaseCurrentLock();
      const bundle = await repository.openMission(path, { acquireLock: true, recoverLock: true });
      lockOwnerRootRef.current = bundle.rootPath;
      updateFromBundle(bundle, false);
      setShowOpenMission(false);
      navigate(`/map?mission=${encodeURIComponent(bundle.rootPath)}`, { replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось открыть миссию';
      window.alert(message);
    }
  };

  const handleSettingsApply = async (next: AppUiDefaults) => {
    const nextSettings: AppSettingsV1 = {
      schema_version: DEFAULT_APP_SETTINGS.schema_version,
      defaults: next,
      workspace: appSettingsRef.current.workspace,
    };

    appSettingsRef.current = nextSettings;
    await platform.settings.writeJson(APP_SETTINGS_STORAGE_KEY, nextSettings);

    // Apply immediately and let autosave persist mission overrides.
    setPinnedAgentId(next.follow_diver ? missionDivers[0]?.uid ?? null : null);
    setCenterOnObjectSelect(next.interactions.center_on_object_select);
    setConnectionSettings(next.connection);
    setLayers((prev) => ({
      ...prev,
      track: next.layers.track,
      routes: next.layers.routes,
      markers: next.layers.markers,
      baseStation: next.layers.base_station,
      grid: next.layers.grid,
      scaleBar: next.layers.scale_bar,
      diver: true,
    }));
    setCoordPrecision(next.coordinates.precision);
    setCoordinateInputCrs(next.coordinates.input_crs);
    setCoordinateInputFormat(next.coordinates.input_format);
    setGridSettings(next.measurements.grid);
    setSegmentLengthsMode(next.measurements.segment_lengths_mode);
    setStyles(next.styles);

    toast({ title: 'Настройки применены' });
  };

  const handleCoordinateInputCrsChange = useCallback(
    async (crs: CrsId) => {
      setCoordinateInputCrs(crs);
      const nextSettings: AppSettingsV1 = {
        ...appSettingsRef.current,
        defaults: {
          ...appSettingsRef.current.defaults,
          coordinates: {
            ...appSettingsRef.current.defaults.coordinates,
            input_crs: crs,
          },
        },
      };
      appSettingsRef.current = nextSettings;
      await platform.settings.writeJson(APP_SETTINGS_STORAGE_KEY, nextSettings);
    },
    [],
  );

  const handleCoordinateInputFormatChange = useCallback(
    async (format: CoordinateInputFormat) => {
      setCoordinateInputFormat(format);
      const nextSettings: AppSettingsV1 = {
        ...appSettingsRef.current,
        defaults: {
          ...appSettingsRef.current.defaults,
          coordinates: {
            ...appSettingsRef.current.defaults.coordinates,
            input_format: format,
          },
        },
      };
      appSettingsRef.current = nextSettings;
      await platform.settings.writeJson(APP_SETTINGS_STORAGE_KEY, nextSettings);
    },
    [],
  );

  const handleSettingsReset = async () => {
    await handleSettingsApply(DEFAULT_APP_SETTINGS.defaults);
    setBaseStationNavigationSource(null);
    setBaseStationTrackColor(DEFAULT_BASE_STATION_TRACK_COLOR);
    setBaseStationMarkerSizePx(DEFAULT_BASE_STATION_MARKER_SIZE_PX);
  };

  const handleDiversApply = (next: DiverUiConfig[]) => {
    const normalizedNext = normalizeDivers(next);
    const prevByUid = new Map(missionDivers.map((diver) => [diver.uid, diver.track_color] as const));
    setMissionDivers(normalizedNext);
    setRecordingState((prev) => {
      if (!prev.mission) return prev;
      const activeTracks = prev.mission.active_tracks;
      const changedColorByTrackId = new Map<string, string>();
      for (const diver of normalizedNext) {
        const prevColor = prevByUid.get(diver.uid);
        if (!prevColor || prevColor === diver.track_color) continue;
        const activeTrackId = activeTracks[diver.uid];
        if (activeTrackId) {
          changedColorByTrackId.set(activeTrackId, diver.track_color);
        }
      }
      if (changedColorByTrackId.size === 0) return prev;
      return {
        ...prev,
        mission: {
          ...prev.mission,
          tracks: prev.mission.tracks.map((track) =>
            changedColorByTrackId.has(track.id)
              ? { ...track, color: changedColorByTrackId.get(track.id) }
              : track,
          ),
        },
      };
    });
  };

  const handleDiversReset = () => {
    setMissionDivers(createDefaultDivers(1));
  };

  const handleBaseStationNavigationSourceApply = (next: NavigationSourceId | null) => {
    setBaseStationNavigationSource(next);
    if (!next) {
      setBaseStationTelemetry(null);
    } else {
      const telemetry = resolveTelemetryBySource(next);
      if (telemetry) {
        setBaseStationTelemetry({
          lat: telemetry.lat,
          lon: telemetry.lon,
          speed: telemetry.speed,
          course: telemetry.course,
          heading: telemetry.heading,
          depth: telemetry.depth,
          received_at: telemetry.received_at,
          sourceId: next,
        });
      }
    }
  };

  const handleBaseStationTrackColorApply = (next: string) => {
    const resolved = next.trim() || DEFAULT_BASE_STATION_TRACK_COLOR;
    setBaseStationTrackColor(resolved);
    setRecordingState((prev) => {
      if (!prev.mission) return prev;
      const activeTrackId = prev.mission.active_tracks[BASE_STATION_AGENT_ID];
      if (!activeTrackId) return prev;
      return {
        ...prev,
        mission: {
          ...prev.mission,
          tracks: prev.mission.tracks.map((track) =>
            track.id === activeTrackId ? { ...track, color: resolved } : track,
          ),
        },
      };
    });
  };


  const handleBaseStationMarkerSizePxApply = (next: number) => {
    setBaseStationMarkerSizePx(
      Number.isFinite(next) ? Math.max(1, Math.min(256, Math.trunc(next))) : DEFAULT_BASE_STATION_MARKER_SIZE_PX,
    );
  };

  const handleToggleEquipmentConnection = (sourceId: string, enabled: boolean) => {
    setEquipmentEnabledBySource((prev) => ({ ...prev, [sourceId]: enabled }));
    const sourceOption = navigationSourceOptions.find((option) => option.id === sourceId);
    const title = sourceOption?.label ?? sourceId;
    toast({ title: `${title}: ${enabled ? 'включено' : 'выключено'}` });
  };

  const handleExport = async (request: ExportRequest) => {
    if (!missionRootPath || !missionDocument) {
      toast({ title: 'Экспорт недоступен', description: 'Откройте миссию перед экспортом.' });
      return;
    }

    const exportRoot = request.exportPath.trim() || `${missionRootPath}/exports`;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseName = safeFilename(missionName ?? missionDocument.name ?? 'mission');
    const created: string[] = [];

    try {
      if (request.tracks) {
        const diverTitleByAgentId = new Map(missionDivers.map((diver) => [diver.uid, diver.title] as const));
        const resolveTrackName = (agentId: string | null, index: number): string => {
          if (agentId === BASE_STATION_AGENT_ID) return 'Базовая станция';
          if (agentId && diverTitleByAgentId.has(agentId)) return diverTitleByAgentId.get(agentId) as string;
          return `Трек ${index + 1}`;
        };
        const metaById = new Map(
          missionDocument.tracks.map((track, i) => [track.id, { meta: track, name: resolveTrackName(track.agent_id, i) }]),
        );
        const resolveActive = (): string[] => {
          const activeByAgent = Object.values(missionDocument.active_tracks).filter((id, idx, all) => all.indexOf(id) === idx);
          if (activeByAgent.length > 0) {
            return activeByAgent.filter((id) => metaById.has(id));
          }
          if (missionDocument.active_track_id && metaById.has(missionDocument.active_track_id)) {
            return [missionDocument.active_track_id];
          }
          const last = missionDocument.tracks[missionDocument.tracks.length - 1];
          return last ? [last.id] : [];
        };

        const ids =
          request.tracks.mode === 'all'
            ? missionDocument.tracks.map((t) => t.id)
            : request.tracks.mode === 'active'
              ? resolveActive()
              : (request.tracks.selectedTrackIds ?? []).filter((id) => metaById.has(id));

        const tracks = ids.map((id) => ({
          id,
          name: metaById.get(id)?.name ?? id,
          points: trackPointsByTrackId[id] ?? [],
        }));

        const content =
          request.tracks.format === 'kml'
            ? tracksToKml(tracks, coordPrecision)
            : request.tracks.format === 'csv'
              ? tracksToCsv(tracks, coordPrecision, request.tracks.csv)
              : tracksToGpx(tracks, coordPrecision);

        const filename = `${baseName}-${stamp}-tracks.${request.tracks.format}`;
        const path = joinExportPath(exportRoot, filename);
        await platform.fileStore.writeText(path, content);
        created.push(path);
      }

      if (request.routes) {
        const allPlanning = objects.filter((o) => o.type === 'route' || o.type === 'zone');
        const selected =
          request.routes.mode === 'all'
            ? allPlanning
            : allPlanning.filter((o) => (request.routes?.selectedObjectIds ?? []).includes(o.id));

        const selectedZoneIds = new Set(selected.filter((o) => o.type === 'zone').map((o) => o.id));
        const lanesToExport =
          request.routes.mode === 'all'
            ? laneFeatures
            : laneFeatures.filter((lane) => selectedZoneIds.has(lane.properties.parent_area_id));

        const content =
          request.routes.format === 'kml'
            ? routesToKml(selected, lanesToExport, coordPrecision)
            : request.routes.format === 'csv'
              ? routesToCsv(selected, lanesToExport, coordPrecision, request.routes.csv)
              : routesToGpx(selected, lanesToExport, coordPrecision);

        const filename = `${baseName}-${stamp}-routes.${request.routes.format}`;
        const path = joinExportPath(exportRoot, filename);
        await platform.fileStore.writeText(path, content);
        created.push(path);
      }

      if (request.markers) {
        const allMarkers = objects.filter((o) => o.type === 'marker');
        const selected =
          request.markers.mode === 'all'
            ? allMarkers
            : allMarkers.filter((o) => (request.markers?.selectedObjectIds ?? []).includes(o.id));

        const content =
          request.markers.format === 'csv'
            ? markersToCsv(selected, coordPrecision, request.markers.csv)
            : markersToGpx(selected, coordPrecision);

        const filename = `${baseName}-${stamp}-markers.${request.markers.format}`;
        const path = joinExportPath(exportRoot, filename);
        await platform.fileStore.writeText(path, content);
        created.push(path);
      }

      toast({
        title: `Экспорт завершен (${created.length})`,
        description: created.length > 0 ? created.join('\n') : undefined,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось выполнить экспорт';
      toast({ title: 'Ошибка экспорта', description: message });
    }
  };

  const handleGoToStart = useCallback(() => {
    if (
      autoSaveStatus === 'error' &&
      !window.confirm('Автосохранение завершилось с ошибкой. Перейти на стартовый экран?')
    ) {
      return;
    }

    void (async () => {
      try {
        await persistMissionSnapshot(latestSnapshotRef.current, { closeActiveTrack: true });
      } catch {
        // ignore
      }

      try {
        await releaseCurrentLock();
      } catch {
        // ignore
      }

      navigate('/');
    })();
  }, [autoSaveStatus, navigate, persistMissionSnapshot, releaseCurrentLock]);

  const handleOpenEquipmentScreen = useCallback(() => {
    const returnPath = isDraft
      ? '/map?mode=draft'
      : missionRootPath
        ? `/map?mission=${encodeURIComponent(missionRootPath)}`
        : '/map';

    void (async () => {
      try {
        await persistMissionSnapshot(latestSnapshotRef.current, { closeActiveTrack: true });
      } catch {
        // ignore
      }

      try {
        await releaseCurrentLock();
      } catch {
        // ignore
      }

      setShowSettings(false);
      navigate(`/equipment?return=${encodeURIComponent(returnPath)}`);
    })();
  }, [isDraft, missionRootPath, navigate, persistMissionSnapshot, releaseCurrentLock]);

  const openCreateMissionDialog = useCallback(() => {
    window.requestAnimationFrame(() => setShowCreateMission(true));
  }, []);

  const openOpenMissionDialog = useCallback(() => {
    window.requestAnimationFrame(() => setShowOpenMission(true));
  }, []);

  const openExportDialog = useCallback(() => {
    window.requestAnimationFrame(() => setShowExport(true));
  }, []);

  const openSettingsDialog = useCallback(() => {
    window.requestAnimationFrame(() => setShowSettings(true));
  }, []);

  const openOfflineMapsDialog = useCallback(() => {
    window.requestAnimationFrame(() => setShowOfflineMaps(true));
  }, []);

  const handleFinishMission = () => {
    if (isDraft) return;
    if (!window.confirm('Завершить миссию и перейти в черновик?')) {
      return;
    }

    void (async () => {
      try {
        await persistMissionSnapshot(latestSnapshotRef.current, { closeActiveTrack: true });
      } catch {
        // ignore
      } finally {
        await loadDraft('resume');
        navigate('/map?mode=draft', { replace: true });
      }
    })();
  };

  const showLaneGenerationError = useCallback(() => {
    window.alert('Не удалось сгенерировать галсы для зоны. Проверьте геометрию и параметры.');
  }, []);

  const handleObjectUpdate = useCallback(
    (id: string, updates: Partial<MapObject>) => {
      const zoneBeforeUpdate = objects.find((obj) => obj.id === id && obj.type === 'zone');
      const nextUpdates = { ...updates };

      if (zoneBeforeUpdate && nextUpdates.geometry?.type === 'zone') {
        nextUpdates.geometry = {
          ...nextUpdates.geometry,
          points: toConvexZonePolygon(nextUpdates.geometry.points),
        };
      }

      setObjects((prev) => prev.map((obj) => (obj.id === id ? { ...obj, ...nextUpdates } : obj)));

      if (zoneBeforeUpdate && didZoneLaneInputsChange(zoneBeforeUpdate, nextUpdates)) {
        setOutdatedZoneIds((prev) => markZoneLanesOutdated(prev, id));
      }
    },
    [objects],
  );

  const handleObjectDelete = useCallback(
    (id: string) => {
      const target = objects.find((obj) => obj.id === id);
      if (target?.type === 'zone') {
        const laneCount = countZoneLanes(laneFeatures, id);
        if (!window.confirm(`Удалить зону и ${laneCount} галсов?`)) {
          return;
        }

        const result = cascadeDeleteZone({
          objects,
          laneFeatures,
          outdatedZoneIds,
          zoneId: id,
        });
        setObjects(result.objects);
        setLaneFeatures(result.laneFeatures);
        setOutdatedZoneIds(result.outdatedZoneIds);
      } else {
        setObjects((prev) => prev.filter((obj) => obj.id !== id));
      }

      setSelectedObjectId((prev) => (prev === id ? null : prev));
    },
    [laneFeatures, objects, outdatedZoneIds],
  );

  const handleRegenerateLanes = useCallback(
    (id: string, updates?: Partial<MapObject>) => {
      let zone = objects.find((obj) => obj.id === id && obj.type === 'zone');
      if (!zone) return;

      if (updates) {
        zone = { ...zone, ...updates };
        setObjects((prev) => prev.map((obj) => (obj.id === id ? { ...obj, ...updates } : obj)));
      }

      const nextLanes = generateLanesFromZoneObject(zone);
      if (nextLanes.length === 0) {
        setOutdatedZoneIds((prev) => markZoneLanesOutdated(prev, id));
        showLaneGenerationError();
        return;
      }

      setLaneFeatures((prev) => replaceZoneLanes(prev, id, nextLanes));
      setOutdatedZoneIds((prev) => clearZoneLanesOutdated(prev, id));
    },
    [objects, showLaneGenerationError],
  );

  const beginPickLaneEdge = useCallback((zoneId: string) => {
    setActiveTool('select');
    setLanePickState({ mode: 'edge', zoneId });
  }, []);

  const beginPickLaneStart = useCallback((zoneId: string) => {
    setActiveTool('select');
    setLanePickState({ mode: 'start', zoneId });
  }, []);

  const cancelLanePick = useCallback(() => {
    setLanePickState({ mode: 'none', zoneId: null });
  }, []);

  const handlePickedLaneEdge = useCallback(
    (zoneId: string, bearingDeg: number) => {
      handleObjectUpdate(zoneId, { laneBearingDeg: bearingDeg });
      setLanePickState({ mode: 'none', zoneId: null });
    },
    [handleObjectUpdate],
  );

  const handlePickedLaneStart = useCallback(
    (zoneId: string, point: { lat: number; lon: number }) => {
      handleObjectUpdate(zoneId, { laneStart: point });
      setLanePickState({ mode: 'none', zoneId: null });
    },
    [handleObjectUpdate],
  );

  const getNextObjectName = (type: string) => {
    const prefix =
      type === 'marker' ? 'Маркер' : type === 'route' ? 'Маршрут' : type === 'measure' ? 'Измерение' : 'Зона';
    const existingNames = objects.filter((o) => o.type === type).map((o) => o.name);

    let counter = 1;
    while (existingNames.includes(`${prefix} ${counter}`)) {
      counter++;
    }
    return `${prefix} ${counter}`;
  };

  const getDefaultObjectColor = (type: MapObject['type']): string => {
    if (type === 'zone') return styles.survey_area.stroke_color;
    if (type === 'marker') return styles.marker.color;
    if (type === 'lane') return styles.lane.color;
    if (type === 'measure') return '#f97316';
    if (type === 'route') return styles.route.color;
    return '#0ea5e9';
  };

  const handleObjectCreate = (
    geometry: NonNullable<MapObject['geometry']>,
    options?: { preserveActiveTool?: boolean; initial?: Partial<MapObject> },
  ) => {
    const normalizedGeometry =
      geometry.type === 'zone'
        ? {
            ...geometry,
            points: toConvexZonePolygon(geometry.points),
          }
        : geometry;

    if (normalizedGeometry.type === 'zone' && !isConvexZonePolygon(normalizedGeometry.points)) return;

    const { id: _id, type: _type, geometry: _geometry, ...initial } = options?.initial ?? {};
    const newObject: MapObject = {
      id: crypto.randomUUID(),
      type: normalizedGeometry.type,
      name: getNextObjectName(normalizedGeometry.type),
      visible: true,
      geometry: normalizedGeometry,
      color: getDefaultObjectColor(normalizedGeometry.type),
      laneAngle: normalizedGeometry.type === 'zone' ? 0 : undefined,
      laneWidth: normalizedGeometry.type === 'zone' ? 5 : undefined,
      note: '',
      ...initial,
    };

    setObjects((prev) => [...prev, newObject]);
    if (newObject.type === 'zone') {
      const nextLanes = generateLanesFromZoneObject(newObject);
      if (nextLanes.length > 0) {
        setLaneFeatures((prev) => replaceZoneLanes(prev, newObject.id, nextLanes));
        setOutdatedZoneIds((prev) => clearZoneLanesOutdated(prev, newObject.id));
      } else {
        setOutdatedZoneIds((prev) => markZoneLanesOutdated(prev, newObject.id));
        showLaneGenerationError();
      }
    }

    if (!options?.preserveActiveTool) {
      setActiveTool('select');
    }
    setSelectedObjectId(newObject.id);
  };

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden relative">
      <MapWorkspaceFrame
        collapsed={mapPanelsCollapsed}
        onCollapsedChange={setMapPanelsCollapsed}
        sideWidths={{ left: leftPanelWidthPx, right: rightPanelWidthPx }}
        onSideWidthsChange={(next) => {
          setLeftPanelWidthPx(next.left);
          setRightPanelWidthPx(next.right);
        }}
        minSideWidthPx={MIN_SIDE_PANEL_WIDTH_PX}
        maxSideWidthPx={MAX_SIDE_PANEL_WIDTH_PX}
        top={
          <TopToolbar
            missionName={missionName}
            isDraft={isDraft}
            autoSaveStatus={autoSaveStatus}
            activeTool={activeTool}
            trackStatus={trackStatus}
            showSimulationControls={showSimulationControls}
            isRecordingEnabled={isRecordingControlsEnabled}
            simulationEnabled={showSimulationControls ? simulationEnabled : undefined}
            simulateConnectionError={showSimulationControls ? simulateConnectionError : undefined}
            onToolChange={handleToolChange}
            onTrackAction={handleTrackAction}
            onSimulationToggle={showSimulationControls ? () => setSimulationEnabled((prev) => !prev) : undefined}
            onSimulationErrorToggle={
              showSimulationControls ? () => setSimulateConnectionError((prev) => !prev) : undefined
            }
            onOpenCreate={openCreateMissionDialog}
            onOpenOpen={openOpenMissionDialog}
            onOpenExport={openExportDialog}
            onOpenSettings={openSettingsDialog}
            onOpenOfflineMaps={openOfflineMapsDialog}
            onOpenCoordinateBuilder={setCoordinateBuilderType}
            onMeasureClearAll={handleOpenClearMeasuresDialog}
            onImportRasterFiles={importRasterFiles}
            onImportDxfFiles={importDxfFiles}
            onFinishMission={handleFinishMission}
            onGoToStart={handleGoToStart}
          />
        }
        left={
          <LeftPanel
            layers={layers}
            onLayerToggle={handleLayerToggle}
            divers={missionDivers}
            trackStatusByAgentId={trackStatusByAgentId}
            baseStationTrackStatus={trackStatusByAgentId[BASE_STATION_AGENT_ID] ?? 'stopped'}
            selectedAgentId={selectedAgentId}
            pinnedAgentId={pinnedAgentId}
            onAgentSelect={setSelectedAgentId}
            onAgentCenter={handleAgentCenter}
            onAgentToggleRecording={handleAgentToggleRecording}
            onBaseStationTrackAction={handleBaseStationTrackAction}
            onAgentPin={handleAgentPin}
            isDraft={isDraft}
            isRecordingEnabled={isRecordingControlsEnabled}
            objects={objects}
            rasterOverlays={rasterOverlays.map((overlay) => ({
              id: overlay.id,
              name: overlay.name,
              visible: overlay.visible,
              opacity: overlay.opacity,
              zIndex: overlay.z_index,
            }))}
            vectorOverlays={vectorOverlays.map((overlay) => ({
              id: overlay.id,
              name: overlay.name,
              color: overlay.color ?? DEFAULT_VECTOR_OVERLAY_COLOR,
              visible: overlay.visible,
              opacity: overlay.opacity,
              zIndex: overlay.z_index,
            }))}
            selectedObjectId={selectedObjectId}
            onObjectSelect={handleObjectSelect}
            onObjectCenter={handleObjectCenter}
            onObjectDelete={handleObjectDelete}
            onRasterOverlayToggle={toggleRasterOverlayVisible}
            onRasterOverlayOpacityChange={setRasterOverlayOpacity}
            onRasterOverlayMove={moveRasterOverlay}
            onRasterOverlayDelete={deleteRasterOverlay}
            onRasterOverlayCenter={centerRasterOverlay}
            onRasterOverlayToggleAll={toggleAllRasterOverlaysVisible}
            onVectorOverlayToggle={toggleVectorOverlayVisible}
            onVectorOverlayOpacityChange={setVectorOverlayOpacity}
            onVectorOverlayColorChange={setVectorOverlayColor}
            onVectorOverlayMove={moveVectorOverlay}
            onVectorOverlayDelete={deleteVectorOverlay}
            onVectorOverlayCenter={centerVectorOverlay}
            onVectorOverlayToggleAll={toggleAllVectorOverlaysVisible}
            sectionsCollapsed={leftPanelSectionsCollapsed}
            onSectionsCollapsedChange={setLeftPanelSectionsCollapsed}
          />
        }
        center={
          <MapCanvas
            activeTool={activeTool}
            laneFeatures={laneFeatures}
            outdatedZoneIds={outdatedZoneIds}
            lanePickMode={lanePickState.mode}
            lanePickZoneId={lanePickState.zoneId}
            layers={layers}
            grid={gridSettings}
            segmentLengthsMode={segmentLengthsMode}
            styles={styles}
            mapView={mapView}
            objects={objects}
            selectedObjectId={selectedObjectId}
            centerRequest={centerRequest}
            diverData={diverData}
            baseStationData={
              baseStationTelemetry
                ? {
                    lat: baseStationTelemetry.lat,
                    lon: baseStationTelemetry.lon,
                    course: baseStationTelemetry.course,
                    sourceId: baseStationTelemetry.sourceId,
                  }
                : null
            }
            isBaseStationSourceAssigned={baseStationNavigationSource !== null}
            baseStationMarkerSizePx={baseStationMarkerSizePx}
            divers={missionDivers}
            diverPositionsById={diverTelemetryById}
            trackSegments={visibleTrackSegments}
            rasterOverlays={rasterOverlaysForMap}
            vectorOverlays={vectorOverlaysForMap}
            followAgentId={pinnedAgentId}
            connectionStatus={connectionStatus}
            connectionLostSeconds={connectionLostSeconds}
            showTelemetryObjects={showTelemetryObjects}
            showNoDataWarning={realtimeVisibility.showNoDataWarning}
            onToolChange={handleToolChange}
            onCursorMove={setCursorPosition}
            onObjectSelect={handleObjectSelect}
            onObjectDoubleClick={(id) => {
              handleObjectSelect(id);
            }}
            onMapDrag={() => setPinnedAgentId(null)}
            onObjectCreate={handleObjectCreate}
            onObjectUpdate={handleObjectUpdate}
            onObjectDelete={handleObjectDelete}
            onRegenerateLanes={handleRegenerateLanes}
            onLanePickCancel={cancelLanePick}
            onLanePickEdge={handlePickedLaneEdge}
            onLanePickStart={handlePickedLaneStart}
            onMapScaleChange={setMapScale}
            onMapViewChange={handleMapViewChange}
            onMapBoundsChange={handleMapBoundsChange}
          />
        }
        right={
          <RightPanel
            diverData={selectedAgentDiverData}
            hasTelemetryData={hasSelectedAgentTelemetry}
            hasTelemetryHistory={hasPrimaryTelemetryHistory}
            coordPrecision={coordPrecision}
            coordinateInputCrs={coordinateInputCrs}
            coordinateInputFormat={coordinateInputFormat}
            styles={styles}
            connectionStatus={connectionStatus}
            isConnectionEnabled={isPrimarySourceEnabled}
            selectedAgent={selectedAgent}
            selectedAgentTrackStatus={selectedAgentTrackStatus}
            selectedAgentActiveTrackNumber={selectedAgentActiveTrackNumber}
            missionDocument={missionDocument}
            trackStatusByAgentId={trackStatusByAgentId}
            hiddenTrackIds={hiddenTrackIds}
            selectedObject={selectedObject}
            onObjectSelect={handleObjectSelect}
            onObjectUpdate={handleObjectUpdate}
            onCoordinateInputCrsChange={handleCoordinateInputCrsChange}
            onCoordinateInputFormatChange={handleCoordinateInputFormatChange}
            onObjectDelete={handleObjectDelete}
            onRegenerateLanes={handleRegenerateLanes}
            onPickLaneEdge={beginPickLaneEdge}
            onPickLaneStart={beginPickLaneStart}
            selectedZoneLanesOutdated={selectedZoneLanesOutdated}
            selectedZoneLaneCount={selectedZoneLaneCount}
            selectedZoneLaneFeatures={selectedZoneLaneFeatures}
            onTrackDelete={handleTrackDelete}
            onTrackVisibilityToggle={toggleTrackHidden}
            onTracksVisibilitySet={setTracksHiddenForSelection}
            sectionsCollapsed={rightPanelSectionsCollapsed}
            onSectionsCollapsedChange={setRightPanelSectionsCollapsed}
          />
        }
        status={
          <StatusBar
            cursorPosition={cursorPosition}
            coordPrecision={coordPrecision}
            scale={mapScale}
            activeTool={activeTool}
          />
        }
      />

      <CreateMissionDialog
        open={showCreateMission}
        onOpenChange={setShowCreateMission}
        onConfirm={handleCreateMission}
      />

      <OpenMissionDialog open={showOpenMission} onOpenChange={setShowOpenMission} onConfirm={handleOpenMission} />

      <ExportDialog
        open={showExport}
        onOpenChange={setShowExport}
        missionRootPath={missionRootPath}
        missionName={missionName}
        missionDocument={missionDocument}
        trackPointsByTrackId={trackPointsByTrackId}
        objects={objects}
        laneFeatures={laneFeatures}
        defaultCoordinateCrs={coordinateInputCrs}
        defaultCoordinateFormat={coordinateInputFormat}
        onExport={handleExport}
      />

      <SettingsDialog
        open={showSettings}
        onOpenChange={setShowSettings}
        value={settingsValue}
        missionDivers={missionDivers}
        isZimaAssignedInProfile={navigationSourceOptions.some((option) => option.schemaId === 'zima2r')}
        baseStationNavigationSource={baseStationNavigationSource}
        onApply={handleSettingsApply}
        onApplyDivers={handleDiversApply}
        onApplyBaseStationNavigationSource={handleBaseStationNavigationSourceApply}
        baseStationTrackColor={baseStationTrackColor}
        onApplyBaseStationTrackColor={handleBaseStationTrackColorApply}
        baseStationMarkerSizePx={baseStationMarkerSizePx}
        onApplyBaseStationMarkerSizePx={handleBaseStationMarkerSizePxApply}
        onReset={handleSettingsReset}
        onResetDivers={handleDiversReset}
        navigationSourceOptions={navigationSourceOptions}
        equipmentItems={
          isElectronRuntime
            ? navigationSourceOptions.map((sourceOption) => {
                const sourceSchemaId = sourceOption.schemaId;
                const enabled = Boolean(equipmentEnabledBySource[sourceOption.id]);
                const deviceState =
                  sourceSchemaId === 'zima2r' ||
                  sourceSchemaId === 'gnss-udp' ||
                  sourceSchemaId === 'gnss-com'
                    ? deviceConnectionStatus[sourceSchemaId]
                    : 'ok';
                const lostSeconds =
                  sourceSchemaId === 'zima2r' ||
                  sourceSchemaId === 'gnss-udp' ||
                  sourceSchemaId === 'gnss-com'
                    ? deviceConnectionLostSeconds[sourceSchemaId]
                    : 0;
                const statusText = enabled
                  ? deviceState === 'ok'
                    ? `Подключено (${selectedEquipmentProfileName})`
                    : deviceState === 'timeout'
                      ? `Нет данных ${lostSeconds} сек`
                      : 'Ошибка'
                  : 'Выключено';
                return {
                  id: sourceOption.id,
                  name: sourceOption.label,
                  enabled,
                  statusText,
                  canToggle: true,
                };
              })
            : []
        }
        onToggleEquipment={isElectronRuntime ? handleToggleEquipmentConnection : undefined}
        onOpenEquipment={handleOpenEquipmentScreen}
      />

      <CoordinateBuilderDialog
        open={coordinateBuilderType !== null}
        objectType={coordinateBuilderType}
        inputCrs={coordinateInputCrs}
        inputFormat={coordinateInputFormat}
        onInputCrsChange={handleCoordinateInputCrsChange}
        onInputFormatChange={handleCoordinateInputFormatChange}
        onOpenChange={(open) => {
          if (!open) setCoordinateBuilderType(null);
        }}
        onBuild={(geometry: MapObjectGeometry) => {
          handleObjectCreate(geometry, { preserveActiveTool: true });
          setCoordinateBuilderType(null);
        }}
      />

      <OfflineMapsDialog
        open={showOfflineMaps}
        onOpenChange={setShowOfflineMaps}
        tileUrlTemplate={platform.map.tileLayerUrl()}
        tileSubdomains={platform.map.tileSubdomains()}
        providerKey={platform.map.tileLayerUrl()}
        maxZoom={platform.map.maxZoom()}
        maxNativeZoom={platform.map.maxNativeZoom()}
        viewBounds={mapBounds}
        currentZoom={mapView?.zoom ?? 12}
      />

      <AlertDialog open={showClearMeasuresDialog} onOpenChange={setShowClearMeasuresDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить все измерения?</AlertDialogTitle>
            <AlertDialogDescription>
              {measureObjectsCount > 0
                ? `Будут удалены все объекты типа «Измерение» (${measureObjectsCount} шт.) без возможности восстановления.`
                : 'Измерений пока нет. Подтвердите, чтобы закрыть диалог.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearAllMeasures} disabled={measureObjectsCount === 0}>
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default MapWorkspace;
