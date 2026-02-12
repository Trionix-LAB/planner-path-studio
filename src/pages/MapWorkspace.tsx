import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import TopToolbar from '@/components/map/TopToolbar';
import RightPanel from '@/components/map/RightPanel';
import LeftPanel from '@/components/map/LeftPanel';
import StatusBar from '@/components/map/StatusBar';
import MapCanvas from '@/components/map/MapCanvas';
import CreateMissionDialog from '@/components/dialogs/CreateMissionDialog';
import OpenMissionDialog from '@/components/dialogs/OpenMissionDialog';
import ExportDialog from '@/components/dialogs/ExportDialog';
import SettingsDialog from '@/components/dialogs/SettingsDialog';
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
  countZoneLanes,
  createElectronGnssTelemetryProvider,
  createElectronZimaTelemetryProvider,
  createDefaultDivers,
  createMissionRepository,
  createSimulationTelemetryProvider,
  createTrackRecorderState,
  didZoneLaneInputsChange,
  generateLanesFromZoneObject,
  markZoneLanesOutdated,
  mapObjectsToGeoJson,
  normalizeDivers,
  replaceZoneLanes,
  trackRecorderReduce,
  type DiverUiConfig,
  type LaneFeature,
  type MissionBundle,
  type MissionDocument,
  type MissionUiState,
  type NavigationSourceId,
  type SegmentLengthsMode,
  type TelemetryConnectionState,
  type TelemetryFix,
  type TrackRecorderState,
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
const AUTOSAVE_DELAY_MS = 1200;

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

type DiverTelemetryState = {
  lat: number;
  lon: number;
  speed: number;
  course: number;
  heading: number | null;
  depth: number;
  received_at: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizePort = (value: unknown, fallback: number): number => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 65535) return fallback;
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

const isNavigationSourceId = (value: unknown): value is NavigationSourceId =>
  value === 'zima2r' || value === 'gnss-udp' || value === 'simulation';

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
    const deviceIds = selectedProfile?.device_ids ?? [];
    setSelectedEquipmentProfileName(selectedProfile?.name ?? 'Не выбрано');
    setSelectedEquipmentDeviceIds(deviceIds);
    setEquipmentEnabledByDevice((prev) => {
      const next: Record<string, boolean> = {};
      for (const [deviceId, enabled] of Object.entries(prev)) {
        next[deviceId] = deviceIds.includes(deviceId) ? enabled : false;
      }
      for (const deviceId of deviceIds) {
        if (next[deviceId] === undefined) {
          next[deviceId] = false;
        }
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
  const simulationTelemetryProvider = useMemo(
    () => createSimulationTelemetryProvider({ timeoutMs: CONNECTION_TIMEOUT_MS }),
    [],
  );

  const [missionRootPath, setMissionRootPath] = useState<string | null>(null);
  const [missionName, setMissionName] = useState<string | null>(null);
  const [isDraft, setIsDraft] = useState(true);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [activeTool, setActiveTool] = useState<Tool>('select');
  const [isFollowing, setIsFollowing] = useState(true);
  const [simulationEnabled, setSimulationEnabled] = useState(!isElectronRuntime);
  const [equipmentEnabledByDevice, setEquipmentEnabledByDevice] = useState<Record<string, boolean>>({
    zima2r: false,
    'gnss-udp': false,
  });
  const [selectedEquipmentProfileName, setSelectedEquipmentProfileName] = useState<string>('Не выбрано');
  const [selectedEquipmentDeviceIds, setSelectedEquipmentDeviceIds] = useState<string[]>([]);
  const [simulateConnectionError, setSimulateConnectionError] = useState(false);
  const [diverData, setDiverData] = useState(DEFAULT_DIVER_DATA);
  const [hasPrimaryTelemetry, setHasPrimaryTelemetry] = useState(false);
  const [diverTelemetryById, setDiverTelemetryById] = useState<Record<string, DiverTelemetryState>>({});
  const [missionDivers, setMissionDivers] = useState<DiverUiConfig[]>(() => createDefaultDivers(1));
  const [baseStationNavigationSource, setBaseStationNavigationSource] = useState<NavigationSourceId | null>(null);
  const [baseStationTelemetry, setBaseStationTelemetry] = useState<BaseStationTelemetryState | null>(null);
  const [layers, setLayers] = useState<LayersState>(DEFAULT_LAYERS);
  const [objects, setObjects] = useState<MapObject[]>([]);
  const [laneFeatures, setLaneFeatures] = useState<LaneFeature[]>([]);
  const [outdatedZoneIds, setOutdatedZoneIds] = useState<Record<string, true>>({});
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [lanePickState, setLanePickState] = useState<{ mode: 'none' | 'edge' | 'start'; zoneId: string | null }>({
    mode: 'none',
    zoneId: null,
  });
  const [showCreateMission, setShowCreateMission] = useState(false);
  const [showOpenMission, setShowOpenMission] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [cursorPosition, setCursorPosition] = useState({ lat: 59.934, lon: 30.335 });
  const [mapScale, setMapScale] = useState('1:--');
  const [mapView, setMapView] = useState<MissionUiState['map_view'] | null>(null);
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
  const [deviceConnectionStatus, setDeviceConnectionStatus] = useState<Record<'zima2r' | 'gnss-udp', TelemetryConnectionState>>({
    zima2r: 'timeout',
    'gnss-udp': 'timeout',
  });
  const [simulationConnectionStatus, setSimulationConnectionStatus] = useState<TelemetryConnectionState>('timeout');
  const [deviceConnectionLostSeconds, setDeviceConnectionLostSeconds] = useState<Record<'zima2r' | 'gnss-udp', number>>({
    zima2r: 1,
    'gnss-udp': 1,
  });
  const [recordingState, setRecordingState] = useState<TrackRecorderState>(() =>
    createTrackRecorderState(null, {}, 'stopped'),
  );

  const missionDocument = recordingState.mission;
  const trackPointsByTrackId = recordingState.trackPointsByTrackId;
  const trackStatus = recordingState.trackStatus;

  const lockOwnerRootRef = useRef<string | null>(null);
  const autosaveTimerRef = useRef<number | null>(null);
  const lastFixAtRef = useRef<number>(Date.now());
  const connectionStateRef = useRef<TelemetryConnectionState>('timeout');
  const primaryNavigationSourceRef = useRef<NavigationSourceId>('simulation');
  const lastFixAtBySourceRef = useRef<Record<NavigationSourceId, number>>({
    zima2r: Date.now(),
    'gnss-udp': Date.now(),
    simulation: Date.now(),
  });
  const zimaAzmLocFixRef = useRef<DiverTelemetryState | null>(null);
  const zimaRemFixByBeaconRef = useRef<Record<string, DiverTelemetryState>>({});
  const gnssFixRef = useRef<DiverTelemetryState | null>(null);
  const simulationFixRef = useRef<DiverTelemetryState | null>(null);
  const lastRecordedPrimaryFixAtRef = useRef<number>(0);
  const missionDiversRef = useRef<DiverUiConfig[]>(createDefaultDivers(1));
  const appSettingsRef = useRef<AppSettingsV1>(DEFAULT_APP_SETTINGS);
  const latestSnapshotRef = useRef<WorkspaceSnapshot>({
    missionRootPath: null,
    recordingState: createTrackRecorderState(null, {}, 'stopped'),
    objects: [],
    laneFeatures: [],
    isFollowing: true,
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

  const trackSegments = useMemo(() => buildTrackSegments(trackPointsByTrackId), [trackPointsByTrackId]);
  const activeTrackNumber = useMemo(() => {
    if (!missionDocument) return 0;
    if (!missionDocument.active_track_id) return missionDocument.tracks.length;
    const index = missionDocument.tracks.findIndex((track) => track.id === missionDocument.active_track_id);
    return index >= 0 ? index + 1 : missionDocument.tracks.length;
  }, [missionDocument]);
  const selectedObject = useMemo(
    () => objects.find((object) => object.id === selectedObjectId) ?? null,
    [objects, selectedObjectId],
  );
  const selectedZoneLaneCount = useMemo(() => {
    if (!selectedObject || selectedObject.type !== 'zone') return null;
    return countZoneLanes(laneFeatures, selectedObject.id);
  }, [laneFeatures, selectedObject]);
  const selectedZoneLanesOutdated = useMemo(() => {
    if (!selectedObject || selectedObject.type !== 'zone') return false;
    return Boolean(outdatedZoneIds[selectedObject.id]);
  }, [outdatedZoneIds, selectedObject]);

  const availableNavigationSources = useMemo<NavigationSourceId[]>(() => {
    if (!isElectronRuntime) return ['simulation'];
    const next: NavigationSourceId[] = [];
    if (selectedEquipmentDeviceIds.includes('zima2r')) next.push('zima2r');
    if (selectedEquipmentDeviceIds.includes('gnss-udp')) next.push('gnss-udp');
    return next.length > 0 ? next : ['zima2r'];
  }, [isElectronRuntime, selectedEquipmentDeviceIds]);

  const primaryNavigationSource = useMemo<NavigationSourceId>(() => {
    const preferred = missionDivers[0]?.navigation_source;
    if (isNavigationSourceId(preferred) && availableNavigationSources.includes(preferred)) {
      return preferred;
    }
    return availableNavigationSources[0] ?? 'simulation';
  }, [availableNavigationSources, missionDivers]);

  const isPrimarySourceEnabled = useMemo(() => {
    if (primaryNavigationSource === 'simulation') return simulationEnabled;
    return Boolean(equipmentEnabledByDevice[primaryNavigationSource]);
  }, [equipmentEnabledByDevice, primaryNavigationSource, simulationEnabled]);

  const navigationSourceOptions = useMemo(
    () =>
      availableNavigationSources.map((sourceId) => {
        if (sourceId === 'simulation') {
          return { id: sourceId, label: 'Simulation' };
        }
        const schema = deviceSchemas.find((item) => item.id === sourceId);
        return {
          id: sourceId,
          label: schema?.title ?? sourceId,
        };
      }),
    [availableNavigationSources, deviceSchemas],
  );

  const effectiveTrackColor = missionDivers[0]?.track_color ?? styles.track.color;
  const effectiveStyles = useMemo<AppUiDefaults['styles']>(
    () => ({
      ...styles,
      track: { ...styles.track, color: effectiveTrackColor },
    }),
    [effectiveTrackColor, styles],
  );

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
    setIsFollowing(false);
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
        const current = diver.navigation_source;
        if (isNavigationSourceId(current) && availableNavigationSources.includes(current)) {
          return diver;
        }
        changed = true;
        return {
          ...diver,
          navigation_source: fallbackSource,
        };
      });
      return changed ? next : prev;
    });
  }, [availableNavigationSources]);

  useEffect(() => {
    setBaseStationNavigationSource((prev) => {
      if (prev && availableNavigationSources.includes(prev)) {
        return prev;
      }
      return null;
    });
  }, [availableNavigationSources]);

  const releaseCurrentLock = useCallback(async () => {
    if (!lockOwnerRootRef.current) return;
    const root = lockOwnerRootRef.current;
    lockOwnerRootRef.current = null;
    await repository.releaseLock(root);
  }, [repository]);

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

      const finalizedRecordingState = options?.closeActiveTrack
        ? trackRecorderReduce(snapshot.recordingState, { type: 'stop' })
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
    },
    [buildMissionBundle, repository],
  );

  const persistMissionBestEffort = useCallback(() => {
    void persistMissionSnapshot(latestSnapshotRef.current, { closeActiveTrack: true }).catch(() => {
      // Best effort on unload/pagehide.
    });
  }, [persistMissionSnapshot]);

  const updateFromBundle = useCallback((bundle: MissionBundle, draftMode: boolean) => {
    const effective = mergeDefaultsWithMissionUi(appSettingsRef.current.defaults, bundle.mission.ui);
    setMissionRootPath(bundle.rootPath);
    setRecordingState(createTrackRecorderState(bundle.mission, bundle.trackPointsByTrackId));
    setObjects(bundleToMapObjects(bundle));
    setLaneFeatures(bundle.routes.features.filter((feature): feature is LaneFeature => feature.properties.kind === 'lane'));
    setOutdatedZoneIds({});
    setMissionName(bundle.mission.name);
    setIsDraft(draftMode);
    setMissionDivers(normalizeDivers(bundle.mission.ui?.divers));
    setDiverData(DEFAULT_DIVER_DATA);
    setHasPrimaryTelemetry(false);
    setDiverTelemetryById({});
    zimaAzmLocFixRef.current = null;
    zimaRemFixByBeaconRef.current = {};
    gnssFixRef.current = null;
    simulationFixRef.current = null;
    lastRecordedPrimaryFixAtRef.current = 0;
    setIsFollowing(effective.follow_diver);
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
    const nextBaseStationSource =
      baseStationUi?.navigation_source ??
      baseStationUi?.source_id ??
      null;
    setBaseStationNavigationSource(
      nextBaseStationSource && isNavigationSourceId(nextBaseStationSource) ? nextBaseStationSource : null,
    );
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
        sourceId: nextBaseStationSource && isNavigationSourceId(nextBaseStationSource) ? nextBaseStationSource : null,
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
    async (recoverOnly: boolean) => {
      const exists = await platform.fileStore.exists(`${DRAFT_ROOT_PATH}/mission.json`);
      if (!exists && recoverOnly) {
        window.alert('Автосохраненный черновик не найден. Создан новый черновик.');
      }

      let bundle: MissionBundle;
      if (exists) {
        bundle = await repository.openMission(DRAFT_ROOT_PATH, { acquireLock: false });
      } else {
        bundle = await repository.createMission(
          {
            rootPath: DRAFT_ROOT_PATH,
            name: DRAFT_MISSION_NAME,
            ui: toMissionUiFromDefaults(appSettingsRef.current.defaults),
          },
          { acquireLock: false },
        );
      }
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

        if (location.pathname === '/create-mission') {
          setShowCreateMission(true);
          await loadDraft(false);
          return;
        }

        if (location.pathname === '/open-mission') {
          setShowOpenMission(true);
          await loadDraft(false);
          return;
        }

        if (missionPath) {
          await releaseCurrentLock();
          const bundle = await repository.openMission(missionPath, { acquireLock: true });
          lockOwnerRootRef.current = bundle.rootPath;
          updateFromBundle(bundle, false);
          return;
        }

        if (mode === 'recover') {
          await loadDraft(true);
          return;
        }

        await loadDraft(mode === 'draft');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Не удалось открыть миссию';
        window.alert(message);
        await loadDraft(false);
      }
    };

    void init();
    return () => {
      void releaseCurrentLock();
    };
  }, [loadDraft, location.pathname, location.search, releaseCurrentLock, repository, updateFromBundle]);

  useEffect(() => {
    if (!isLoaded || isDraft || !shouldAutoStartRecording) return;
    setRecordingState((prev) => trackRecorderReduce(prev, { type: 'start' }));
    setShouldAutoStartRecording(false);
  }, [isDraft, isLoaded, shouldAutoStartRecording]);

  useEffect(() => {
    if (!isLoaded || !missionDocument || !missionRootPath) return;
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
    }

    setAutoSaveStatus('saving');
    autosaveTimerRef.current = window.setTimeout(async () => {
      try {
        const bundle = buildMissionBundle(
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
        await repository.saveMission(bundle);
        setAutoSaveStatus('saved');
      } catch {
        setAutoSaveStatus('error');
      }
    }, AUTOSAVE_DELAY_MS);

    return () => {
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current);
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
        setRecordingState((prev) => trackRecorderReduce(prev, { type: 'connectionRestored' }));
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
    let primaryFix: DiverTelemetryState | null = null;

    divers.forEach((diver, index) => {
      const source = diver.navigation_source;
      let telemetry: DiverTelemetryState | null = null;

      if (source === 'gnss-udp') {
        telemetry = gnssFixRef.current;
      } else if (source === 'simulation') {
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

      if (index === 0) {
        primaryFix = telemetry;
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

    if (!primaryFix) {
      setHasPrimaryTelemetry(false);
      return;
    }

    setHasPrimaryTelemetry(true);

    setDiverData({
      lat: primaryFix.lat,
      lon: primaryFix.lon,
      speed: primaryFix.speed,
      course: Math.round(primaryFix.course),
      depth: primaryFix.depth,
    });

    if (primaryFix.received_at === lastRecordedPrimaryFixAtRef.current) return;
    lastRecordedPrimaryFixAtRef.current = primaryFix.received_at;
    setRecordingState((prev) =>
      trackRecorderReduce(prev, {
        type: 'fixReceived',
        fix: {
          lat: primaryFix.lat,
          lon: primaryFix.lon,
          speed: primaryFix.speed,
          course: primaryFix.course,
          depth: primaryFix.depth,
          timestamp: new Date(primaryFix.received_at).toISOString(),
        },
      }),
    );
  }, []);

  const resolveTelemetryBySource = useCallback((sourceId: NavigationSourceId | null): DiverTelemetryState | null => {
    if (sourceId === 'zima2r') return zimaAzmLocFixRef.current;
    if (sourceId === 'gnss-udp') return gnssFixRef.current;
    if (sourceId === 'simulation') return simulationFixRef.current;
    return null;
  }, []);

  const syncBaseStationTelemetry = useCallback(() => {
    if (!baseStationNavigationSource) {
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
  }, [baseStationNavigationSource, resolveTelemetryBySource]);

  const handleTelemetryFix = useCallback(
    (sourceId: NavigationSourceId, fix: TelemetryFix) => {
      lastFixAtBySourceRef.current[sourceId] = fix.received_at;

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
      } else {
        simulationFixRef.current = telemetryState;
      }

      if (primaryNavigationSourceRef.current === sourceId) {
        lastFixAtRef.current = fix.received_at;
        setConnectionLostSeconds(0);
      }

      syncDiverTelemetry();
      syncBaseStationTelemetry();
    },
    [syncBaseStationTelemetry, syncDiverTelemetry],
  );

  useEffect(() => {
    syncDiverTelemetry();
  }, [missionDivers, syncDiverTelemetry]);

  useEffect(() => {
    syncBaseStationTelemetry();
  }, [baseStationNavigationSource, syncBaseStationTelemetry]);

  const handleDeviceConnectionState = useCallback(
    (sourceId: NavigationSourceId, nextState: TelemetryConnectionState) => {
      if (sourceId === 'zima2r' || sourceId === 'gnss-udp') {
        setDeviceConnectionStatus((prev) => ({ ...prev, [sourceId]: nextState }));
      } else {
        setSimulationConnectionStatus(nextState);
      }
      if (primaryNavigationSourceRef.current === sourceId) {
        applyPrimaryConnectionState(nextState);
      }
    },
    [applyPrimaryConnectionState],
  );

  useEffect(() => {
    primaryNavigationSourceRef.current = primaryNavigationSource;
    lastFixAtRef.current = lastFixAtBySourceRef.current[primaryNavigationSource] ?? Date.now();

    const nextStatus =
      primaryNavigationSource === 'zima2r' || primaryNavigationSource === 'gnss-udp'
        ? deviceConnectionStatus[primaryNavigationSource]
        : simulationConnectionStatus;
    applyPrimaryConnectionState(nextStatus ?? 'ok');
    syncDiverTelemetry();
    syncBaseStationTelemetry();
  }, [
    applyPrimaryConnectionState,
    deviceConnectionStatus,
    primaryNavigationSource,
    simulationConnectionStatus,
    syncBaseStationTelemetry,
    syncDiverTelemetry,
  ]);

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
      zimaTelemetryProvider.start();
      gnssTelemetryProvider.start();

      return () => {
        unsubscribeZimaFix();
        unsubscribeZimaConnection();
        unsubscribeGnssFix();
        unsubscribeGnssConnection();
        zimaTelemetryProvider.stop();
        gnssTelemetryProvider.stop();
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
    gnssTelemetryProvider,
    handleDeviceConnectionState,
    handleTelemetryFix,
    isElectronRuntime,
    simulationTelemetryProvider,
    zimaTelemetryProvider,
  ]);

  useEffect(() => {
    if (isElectronRuntime) {
      const zimaEnabled = selectedEquipmentDeviceIds.includes('zima2r') && (equipmentEnabledByDevice.zima2r ?? false);
      const gnssEnabled =
        selectedEquipmentDeviceIds.includes('gnss-udp') && Boolean(equipmentEnabledByDevice['gnss-udp']);
      zimaTelemetryProvider.setEnabled(zimaEnabled);
      gnssTelemetryProvider.setEnabled(gnssEnabled);
      return;
    }
    simulationTelemetryProvider.setEnabled(simulationEnabled);
  }, [
    equipmentEnabledByDevice,
    gnssTelemetryProvider,
    isElectronRuntime,
    selectedEquipmentDeviceIds,
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
      });
    }, 1000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [deviceConnectionStatus]);

  useEffect(() => {
    const handlePageHide = () => persistMissionBestEffort();
    const handleBeforeUnload = () => persistMissionBestEffort();
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      persistMissionBestEffort();
    };
  }, [persistMissionBestEffort]);

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

  const handleLayerToggle = (layer: keyof LayersState) => {
    if (layer === 'diver') return;
    setLayers((prev) => ({ ...prev, [layer]: !prev[layer] }));
  };

  const handleTrackAction = (action: 'pause' | 'resume') => {
    if (action === 'pause') {
      setRecordingState((prev) => trackRecorderReduce(prev, { type: 'pause' }));
      return;
    }
    if (isDraft) {
      setShowCreateMission(true);
      return;
    }
    setRecordingState((prev) => trackRecorderReduce(prev, { type: 'resume' }));
  };

  const handleTrackDelete = (trackId: string) => {
    const track = missionDocument?.tracks.find((item) => item.id === trackId);
    if (!track) return;

    const isActive = missionDocument?.active_track_id === trackId;
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
      const bundle = await repository.createMission(
        { rootPath: path, name, ui: toMissionUiFromDefaults(appSettingsRef.current.defaults) },
        { acquireLock: true },
      );
      lockOwnerRootRef.current = bundle.rootPath;
      updateFromBundle(bundle, false);
      setShowCreateMission(false);
      navigate('/map');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось создать миссию';
      window.alert(message);
    }
  };

  const handleOpenMission = async (path: string) => {
    try {
      await releaseCurrentLock();
      const bundle = await repository.openMission(path, { acquireLock: true });
      lockOwnerRootRef.current = bundle.rootPath;
      updateFromBundle(bundle, false);
      setShowOpenMission(false);
      navigate('/map');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось открыть миссию';
      window.alert(message);
    }
  };

  const handleSettingsApply = async (next: AppUiDefaults) => {
    const nextSettings: AppSettingsV1 = {
      schema_version: DEFAULT_APP_SETTINGS.schema_version,
      defaults: next,
    };

    appSettingsRef.current = nextSettings;
    await platform.settings.writeJson(APP_SETTINGS_STORAGE_KEY, nextSettings);

    // Apply immediately and let autosave persist mission overrides.
    setIsFollowing(next.follow_diver);
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

  const handleToggleEquipmentConnection = (deviceId: string, enabled: boolean) => {
    setEquipmentEnabledByDevice((prev) => ({ ...prev, [deviceId]: enabled }));
    const schema = deviceSchemas.find((item) => item.id === deviceId);
    const title = schema?.title ?? deviceId;
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
        await loadDraft(false);
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
      setObjects((prev) => prev.map((obj) => (obj.id === id ? { ...obj, ...updates } : obj)));

      if (zoneBeforeUpdate && didZoneLaneInputsChange(zoneBeforeUpdate, updates)) {
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
    (id: string) => {
      const zone = objects.find((obj) => obj.id === id && obj.type === 'zone');
      if (!zone) return;

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
    const { id: _id, type: _type, geometry: _geometry, ...initial } = options?.initial ?? {};
    const newObject: MapObject = {
      id: crypto.randomUUID(),
      type: geometry.type,
      name: getNextObjectName(geometry.type),
      visible: true,
      geometry,
      color: getDefaultObjectColor(geometry.type),
      laneAngle: geometry.type === 'zone' ? 0 : undefined,
      laneWidth: geometry.type === 'zone' ? 5 : undefined,
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
      <TopToolbar
        missionName={missionName}
        isDraft={isDraft}
        autoSaveStatus={autoSaveStatus}
        activeTool={activeTool}
        trackStatus={trackStatus}
        isFollowing={isFollowing}
        showSimulationControls={showSimulationControls}
        simulationEnabled={showSimulationControls ? simulationEnabled : undefined}
        simulateConnectionError={showSimulationControls ? simulateConnectionError : undefined}
        onToolChange={handleToolChange}
        onTrackAction={handleTrackAction}
        onFollowToggle={() => setIsFollowing(!isFollowing)}
        onSimulationToggle={showSimulationControls ? () => setSimulationEnabled((prev) => !prev) : undefined}
        onSimulationErrorToggle={
          showSimulationControls ? () => setSimulateConnectionError((prev) => !prev) : undefined
        }
        onOpenCreate={() => setShowCreateMission(true)}
        onOpenOpen={() => setShowOpenMission(true)}
        onOpenExport={() => setShowExport(true)}
        onOpenSettings={() => setShowSettings(true)}
        onFinishMission={handleFinishMission}
        onGoToStart={handleGoToStart}
      />

      <div className="flex-1 flex overflow-hidden">
        <LeftPanel
          layers={layers}
          primaryDiverTitle={
            missionDivers[0]?.title?.trim() || missionDivers[0]?.id?.trim() || 'Маяк 1'
          }
          primaryTrackColor={missionDivers[0]?.track_color ?? '#a855f7'}
          onLayerToggle={handleLayerToggle}
          objects={objects}
          missionDocument={missionDocument}
          trackStatus={trackStatus}
          selectedObjectId={selectedObjectId}
          onObjectSelect={handleObjectSelect}
          onObjectCenter={handleObjectCenter}
          onObjectDelete={handleObjectDelete}
          onTrackDelete={handleTrackDelete}
        />

        <div className="flex-1 relative">
          <MapCanvas
            activeTool={activeTool}
            laneFeatures={laneFeatures}
            outdatedZoneIds={outdatedZoneIds}
            lanePickMode={lanePickState.mode}
            lanePickZoneId={lanePickState.zoneId}
            layers={layers}
            grid={gridSettings}
            segmentLengthsMode={segmentLengthsMode}
            styles={effectiveStyles}
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
            isFollowing={isFollowing}
            connectionStatus={connectionStatus}
            connectionLostSeconds={connectionLostSeconds}
            onToolChange={handleToolChange}
            onCursorMove={setCursorPosition}
            onObjectSelect={handleObjectSelect}
            onObjectDoubleClick={(id) => {
              handleObjectSelect(id);
            }}
            onMapDrag={() => setIsFollowing(false)}
            onObjectCreate={handleObjectCreate}
            onObjectUpdate={handleObjectUpdate}
            onObjectDelete={handleObjectDelete}
            onRegenerateLanes={handleRegenerateLanes}
            onLanePickCancel={cancelLanePick}
            onLanePickEdge={handlePickedLaneEdge}
            onLanePickStart={handlePickedLaneStart}
            onMapScaleChange={setMapScale}
            onMapViewChange={handleMapViewChange}
          />
        </div>

        <RightPanel
          diverData={diverData}
          hasTelemetryData={hasPrimaryTelemetry}
          coordPrecision={coordPrecision}
          styles={styles}
          connectionStatus={connectionStatus}
          isConnectionEnabled={isPrimarySourceEnabled}
          trackStatus={trackStatus}
          trackId={activeTrackNumber}
          selectedObject={selectedObject}
          onObjectSelect={handleObjectSelect}
          onObjectUpdate={handleObjectUpdate}
          onObjectDelete={handleObjectDelete}
          onRegenerateLanes={handleRegenerateLanes}
          onPickLaneEdge={beginPickLaneEdge}
          onPickLaneStart={beginPickLaneStart}
          selectedZoneLanesOutdated={selectedZoneLanesOutdated}
          selectedZoneLaneCount={selectedZoneLaneCount}
        />
      </div>

      <StatusBar
        cursorPosition={cursorPosition}
        coordPrecision={coordPrecision}
        scale={mapScale}
        activeTool={activeTool}
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
        baseStationNavigationSource={baseStationNavigationSource}
        onApply={handleSettingsApply}
        onApplyDivers={handleDiversApply}
        onApplyBaseStationNavigationSource={handleBaseStationNavigationSourceApply}
        onReset={handleSettingsReset}
        onResetDivers={handleDiversReset}
        navigationSourceOptions={navigationSourceOptions}
        equipmentItems={
          isElectronRuntime
            ? selectedEquipmentDeviceIds.map((deviceId) => {
                const schema = deviceSchemas.find((item) => item.id === deviceId);
                const enabled = Boolean(equipmentEnabledByDevice[deviceId]);
                const deviceState =
                  deviceId === 'zima2r' || deviceId === 'gnss-udp'
                    ? deviceConnectionStatus[deviceId]
                    : 'ok';
                const lostSeconds =
                  deviceId === 'zima2r' || deviceId === 'gnss-udp'
                    ? deviceConnectionLostSeconds[deviceId]
                    : 0;
                const statusText = enabled
                  ? deviceState === 'ok'
                    ? `Подключено (${selectedEquipmentProfileName})`
                    : deviceState === 'timeout'
                      ? `Нет данных ${lostSeconds} сек`
                      : 'Ошибка'
                  : 'Выключено';
                return {
                  id: deviceId,
                  name: schema?.title ?? deviceId,
                  enabled,
                  statusText,
                  canToggle: true,
                };
              })
            : []
        }
        onToggleEquipment={isElectronRuntime ? handleToggleEquipmentConnection : undefined}
      />
    </div>
  );
};

export default MapWorkspace;
