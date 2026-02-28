import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import TopToolbar from '@/components/map/TopToolbar';
import RightPanel from '@/components/map/RightPanel';
import LeftPanel from '@/components/map/LeftPanel';
import StatusBar from '@/components/map/StatusBar';
import MapCanvas from '@/components/map/MapCanvas';
import MapWorkspaceFrame, { type MapPanelsCollapsedState } from '@/components/map/MapWorkspaceFrame';
import CreateMissionDialog from '@/components/dialogs/CreateMissionDialog';
import OpenMissionDialog from '@/components/dialogs/OpenMissionDialog';
import ExportDialog from '@/components/dialogs/ExportDialog';
import SettingsDialog from '@/components/dialogs/SettingsDialog';
import OfflineMapsDialog from '@/components/dialogs/OfflineMapsDialog';
import type { MapObject, Tool } from '@/features/map/model/types';

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
  routesToGpx,
  routesToKml,
  safeFilename,
  tracksToGpx,
  tracksToKml,
  type ExportRequest,
} from '@/features/export';
import { platform } from '@/platform';
import { toast } from '@/hooks/use-toast';

const DRAFT_ROOT_PATH = 'draft/current';
const DRAFT_MISSION_NAME = 'Черновик';
const CONNECTION_TIMEOUT_MS = 5000;
const WAL_STAGE_DELAY_MS = 250;
const AUTOSAVE_DELAY_MS = 900;

const DEFAULT_APP_SETTINGS = createDefaultAppSettings();

type LayersState = {
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
  baseStationTelemetry: BaseStationTelemetryState | null;
  mapView: MissionUiState['map_view'] | null;
  coordPrecision: number;
  grid: AppUiDefaults['measurements']['grid'];
  segmentLengthsMode: SegmentLengthsMode;
  styles: AppUiDefaults['styles'];
  isLoaded: boolean;
};

type MapBounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

const DEFAULT_DIVER_DATA = {
  lat: 59.93428,
  lon: 30.335099,
  speed: 0.8,
  course: 45,
  depth: 12.5,
};

const DEFAULT_LAYERS: LayersState = {
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

const toMissionUiFromDefaults = (defaults: AppUiDefaults): MissionUiState => ({
  follow_diver: defaults.follow_diver,
  divers: createDefaultDivers(1),
  layers: { ...defaults.layers },
  base_station: {
    navigation_source: null,
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
  const [cursorPosition, setCursorPosition] = useState({ lat: 59.934, lon: 30.335 });
  const [mapScale, setMapScale] = useState('1:--');
  const [mapPanelsCollapsed, setMapPanelsCollapsed] = useState<MapPanelsCollapsedState>(
    DEFAULT_MAP_PANELS_COLLAPSED,
  );
  const [mapView, setMapView] = useState<MissionUiState['map_view'] | null>(null);
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null);
  const [coordPrecision, setCoordPrecision] = useState(DEFAULT_APP_SETTINGS.defaults.coordinates.precision);
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
    baseStationTelemetry: null,
    mapView: null,
    coordPrecision: DEFAULT_APP_SETTINGS.defaults.coordinates.precision,
    grid: DEFAULT_APP_SETTINGS.defaults.measurements.grid,
    segmentLengthsMode: DEFAULT_APP_SETTINGS.defaults.measurements.segment_lengths_mode,
    styles: DEFAULT_APP_SETTINGS.defaults.styles,
    isLoaded: false,
  });

  const trackSegments = useMemo(() => {
    const segments = buildTrackSegments(trackPointsByTrackId);
    const fallbackColor = styles.track.color;
    const agentColorByUid = new Map(
      missionDivers.map((diver) => [diver.uid, diver.track_color ?? fallbackColor] as const),
    );
    const trackAgentById = new Map(missionDocument?.tracks.map((track) => [track.id, track.agent_id]) ?? []);

    return segments.map((segment) => {
      const agentId = trackAgentById.get(segment.trackId) ?? null;
      const color = (agentId && agentColorByUid.get(agentId)) ?? fallbackColor;
      return { points: segment.points, color };
    });
  }, [missionDocument?.tracks, missionDivers, styles.track.color, trackPointsByTrackId]);
  const activeTrackNumber = useMemo(() => {
    if (!missionDocument) return 0;
    if (!missionDocument.active_track_id) return missionDocument.tracks.length;
    const index = missionDocument.tracks.findIndex((track) => track.id === missionDocument.active_track_id);
    return index >= 0 ? index + 1 : missionDocument.tracks.length;
  }, [missionDocument]);

  // Selected agent derived values
  const selectedAgent = useMemo(
    () => missionDivers.find((d) => d.uid === selectedAgentId) ?? null,
    [missionDivers, selectedAgentId],
  );
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
  }, [diverData, diverTelemetryById, selectedAgent, selectedAgentId]);

  const hasSelectedAgentTelemetry = useMemo(() => {
    if (!selectedAgentId || !selectedAgent) return hasPrimaryTelemetry;
    const key = selectedAgent.id.trim();
    return key in diverTelemetryById;
  }, [diverTelemetryById, hasPrimaryTelemetry, selectedAgent, selectedAgentId]);

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
      coordinates: { precision: coordPrecision },
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
      baseStationTelemetry,
      mapView,
      coordPrecision,
      grid: gridSettings,
      segmentLengthsMode,
      styles,
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
    baseStationTelemetry,
    mapView,
    coordPrecision,
    gridSettings,
    segmentLengthsMode,
    styles,
    isLoaded,
  ]);

  useEffect(() => {
    missionDiversRef.current = missionDivers;
  }, [missionDivers]);

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
      baseStationTelemetryState: BaseStationTelemetryState | null,
      nextMapView: MissionUiState['map_view'] | null,
      nextCoordPrecision: number,
      nextGrid: AppUiDefaults['measurements']['grid'],
      nextSegmentLengthsMode: SegmentLengthsMode,
      nextStyles: AppUiDefaults['styles'],
    ): MissionBundle => {
      const geo = mapObjectsToGeoJson(missionObjects);
      const nextMission: MissionDocument = {
        ...mission,
        ui: {
          ...(mission.ui ?? {}),
          follow_diver: followEnabled,
          divers: diversState,
          layers: {
            track: layersState.track,
            routes: layersState.routes,
            markers: layersState.markers,
            base_station: layersState.baseStation,
            grid: layersState.grid,
            scale_bar: layersState.scaleBar,
          },
          base_station: {
            navigation_source: baseStationSourceState,
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
        snapshot.baseStationTelemetry,
        snapshot.mapView,
        snapshot.coordPrecision,
        snapshot.grid,
        snapshot.segmentLengthsMode,
        snapshot.styles,
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
      track: effective.layers.track,
      routes: effective.layers.routes,
      markers: effective.layers.markers,
      baseStation: effective.layers.base_station,
      grid: effective.layers.grid,
      scaleBar: effective.layers.scale_bar,
      diver: true,
    });
    const baseStationUi = bundle.mission.ui?.base_station;
    const nextBaseStationSource = normalizeNavigationSourceId(
      baseStationUi?.navigation_source ?? baseStationUi?.source_id ?? null,
    );
    setBaseStationNavigationSource(nextBaseStationSource);
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
    setGridSettings(effective.measurements.grid);
    setSegmentLengthsMode(effective.measurements.segment_lengths_mode);
    setStyles(effective.styles);
    setMapView(bundle.mission.ui?.map_view ?? null);
    setAutoSaveStatus('saved');
    setSelectedObjectId(null);
    setCenterRequest(null);
    setIsLoaded(true);
    setShouldAutoStartRecording(!draftMode);
  }, []);

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
        baseStationTelemetry,
        mapView,
        coordPrecision,
        gridSettings,
        segmentLengthsMode,
        styles,
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
    baseStationTelemetry,
    repository,
    trackPointsByTrackId,
    mapView,
    coordPrecision,
    gridSettings,
    segmentLengthsMode,
    styles,
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

    divers.forEach((diver, index) => {
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
        if (!telemetry && index === 0) {
          telemetry = zimaAzmLocFixRef.current;
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
  }, [baseStationNavigationSource, isSourceEnabled, resolveTelemetryBySource]);

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
    if (missionDivers.length === 0 || !isRecordingControlsEnabled) return;

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
          next = trackRecorderReduce(next, { type: 'resume', agentId });
        }
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
    if (currentStatus === 'recording') {
      setRecordingState((prev) => trackRecorderReduce(prev, { type: 'pause', agentId: agentUid }));
    } else {
      setRecordingState((prev) => trackRecorderReduce(prev, { type: 'start', agentId: agentUid }));
    }
  };

  const handleAgentPin = useCallback((agentUid: string) => {
    setPinnedAgentId((prev) => (prev === agentUid ? null : agentUid));
  }, []);

  const handleAgentCenter = useCallback(
    (agentUid: string) => {
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
    [diverTelemetryById, mapView?.zoom, missionDivers],
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
    setGridSettings(next.measurements.grid);
    setSegmentLengthsMode(next.measurements.segment_lengths_mode);
    setStyles(next.styles);

    toast({ title: 'Настройки применены' });
  };

  const handleSettingsReset = async () => {
    await handleSettingsApply(DEFAULT_APP_SETTINGS.defaults);
    setBaseStationNavigationSource(null);
  };

  const handleDiversApply = (next: DiverUiConfig[]) => {
    setMissionDivers(normalizeDivers(next));
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
        const metaById = new Map(missionDocument.tracks.map((t, i) => [t.id, { meta: t, name: `Трек ${i + 1}` }]));
        const resolveActive = (): string[] => {
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
            ? markersToCsv(selected, coordPrecision)
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
    const prefix = type === 'marker' ? 'Маркер' : type === 'route' ? 'Маршрут' : 'Зона';
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
            selectedAgentId={selectedAgentId}
            pinnedAgentId={pinnedAgentId}
            onAgentSelect={setSelectedAgentId}
            onAgentCenter={handleAgentCenter}
            onAgentToggleRecording={handleAgentToggleRecording}
            onAgentPin={handleAgentPin}
            isDraft={isDraft}
            isRecordingEnabled={isRecordingControlsEnabled}
            objects={objects}
            selectedObjectId={selectedObjectId}
            onObjectSelect={handleObjectSelect}
            onObjectCenter={handleObjectCenter}
            onObjectDelete={handleObjectDelete}
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
                    heading: baseStationTelemetry.heading,
                    sourceId: baseStationTelemetry.sourceId,
                  }
                : null
            }
            isBaseStationSourceAssigned={baseStationNavigationSource !== null}
            divers={missionDivers}
            diverPositionsById={diverTelemetryById}
            trackSegments={trackSegments}
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
            styles={styles}
            connectionStatus={connectionStatus}
            isConnectionEnabled={isPrimarySourceEnabled}
            selectedAgent={selectedAgent}
            selectedAgentTrackStatus={selectedAgentTrackStatus}
            selectedAgentActiveTrackNumber={selectedAgentActiveTrackNumber}
            missionDocument={missionDocument}
            trackStatusByAgentId={trackStatusByAgentId}
            selectedObject={selectedObject}
            onObjectSelect={handleObjectSelect}
            onObjectUpdate={handleObjectUpdate}
            onObjectDelete={handleObjectDelete}
            onRegenerateLanes={handleRegenerateLanes}
            onPickLaneEdge={beginPickLaneEdge}
            onPickLaneStart={beginPickLaneStart}
            selectedZoneLanesOutdated={selectedZoneLanesOutdated}
            selectedZoneLaneCount={selectedZoneLaneCount}
            selectedZoneLaneFeatures={selectedZoneLaneFeatures}
            onTrackDelete={handleTrackDelete}
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
    </div>
  );
};

export default MapWorkspace;
