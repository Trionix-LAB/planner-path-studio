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
  buildTrackSegments,
  bundleToMapObjects,
  cascadeDeleteZone,
  clearZoneLanesOutdated,
  countZoneLanes,
  createMissionRepository,
  createSimulationTelemetryProvider,
  createTrackRecorderState,
  didZoneLaneInputsChange,
  generateLanesFromZoneObject,
  markZoneLanesOutdated,
  mapObjectsToGeoJson,
  replaceZoneLanes,
  trackRecorderReduce,
  type LaneFeature,
  type MissionBundle,
  type MissionDocument,
  type MissionUiState,
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
  grid: boolean;
  scaleBar: boolean;
  diver: boolean;
};

type WorkspaceSnapshot = {
  missionRootPath: string | null;
  recordingState: TrackRecorderState;
  objects: MapObject[];
  laneFeatures: LaneFeature[];
  isFollowing: boolean;
  layers: LayersState;
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
  grid: false,
  scaleBar: true,
  diver: true,
};

const toMissionUiFromDefaults = (defaults: AppUiDefaults): MissionUiState => ({
  follow_diver: defaults.follow_diver,
  layers: { ...defaults.layers },
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

const MapWorkspace = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const repository = useMemo(() => createMissionRepository(platform.fileStore), []);
  const telemetryProvider = useMemo(
    () => createSimulationTelemetryProvider({ timeoutMs: CONNECTION_TIMEOUT_MS }),
    [],
  );

  const [missionRootPath, setMissionRootPath] = useState<string | null>(null);
  const [missionName, setMissionName] = useState<string | null>(null);
  const [isDraft, setIsDraft] = useState(true);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [activeTool, setActiveTool] = useState<Tool>('select');
  const [isFollowing, setIsFollowing] = useState(true);
  const [simulationEnabled, setSimulationEnabled] = useState(true);
  const [simulateConnectionError, setSimulateConnectionError] = useState(false);
  const [diverData, setDiverData] = useState(DEFAULT_DIVER_DATA);
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
  const [isLoaded, setIsLoaded] = useState(false);
  const [shouldAutoStartRecording, setShouldAutoStartRecording] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<TelemetryConnectionState>('ok');
  const [connectionLostSeconds, setConnectionLostSeconds] = useState(0);
  const [recordingState, setRecordingState] = useState<TrackRecorderState>(() =>
    createTrackRecorderState(null, {}, 'stopped'),
  );

  const missionDocument = recordingState.mission;
  const trackPointsByTrackId = recordingState.trackPointsByTrackId;
  const trackStatus = recordingState.trackStatus;

  const lockOwnerRootRef = useRef<string | null>(null);
  const autosaveTimerRef = useRef<number | null>(null);
  const lastFixAtRef = useRef<number>(Date.now());
  const connectionStateRef = useRef<TelemetryConnectionState>('ok');
  const simulationEnabledRef = useRef<boolean>(simulationEnabled);
  const appSettingsRef = useRef<AppSettingsV1>(DEFAULT_APP_SETTINGS);
  const latestSnapshotRef = useRef<WorkspaceSnapshot>({
    missionRootPath: null,
    recordingState: createTrackRecorderState(null, {}, 'stopped'),
    objects: [],
    laneFeatures: [],
    isFollowing: true,
    layers: DEFAULT_LAYERS,
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

  const settingsValue = useMemo<AppUiDefaults>(
    () => ({
      follow_diver: isFollowing,
      layers: {
        track: layers.track,
        routes: layers.routes,
        markers: layers.markers,
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
      coordPrecision,
      gridSettings,
      isFollowing,
      layers.grid,
      layers.markers,
      layers.routes,
      layers.scaleBar,
      layers.track,
      segmentLengthsMode,
      styles,
    ],
  );

  useEffect(() => {
    latestSnapshotRef.current = {
      missionRootPath,
      recordingState,
      objects,
      laneFeatures,
      isFollowing,
      layers,
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
    mapView,
    coordPrecision,
    gridSettings,
    segmentLengthsMode,
    styles,
    isLoaded,
  ]);

  useEffect(() => {
    simulationEnabledRef.current = simulationEnabled;
  }, [simulationEnabled]);

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
          layers: {
            track: layersState.track,
            routes: layersState.routes,
            markers: layersState.markers,
            grid: layersState.grid,
            scale_bar: layersState.scaleBar,
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
    setIsFollowing(effective.follow_diver);
    setLayers({
      track: effective.layers.track,
      routes: effective.layers.routes,
      markers: effective.layers.markers,
      grid: effective.layers.grid,
      scaleBar: effective.layers.scale_bar,
      diver: true,
    });
    setCoordPrecision(effective.coordinates.precision);
    setGridSettings(effective.measurements.grid);
    setSegmentLengthsMode(effective.measurements.segment_lengths_mode);
    setStyles(effective.styles);
    setMapView(bundle.mission.ui?.map_view ?? null);
    setAutoSaveStatus('saved');
    setSelectedObjectId(null);
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
    repository,
    trackPointsByTrackId,
    mapView,
    coordPrecision,
    gridSettings,
    segmentLengthsMode,
    styles,
  ]);

  const handleTelemetryFix = useCallback((fix: TelemetryFix) => {
    lastFixAtRef.current = fix.received_at;
    setConnectionLostSeconds(0);
    setDiverData({
      lat: fix.lat,
      lon: fix.lon,
      speed: fix.speed,
      course: Math.round(fix.course),
      depth: fix.depth,
    });
    setRecordingState((prev) =>
      trackRecorderReduce(prev, {
        type: 'fixReceived',
        fix: {
          lat: fix.lat,
          lon: fix.lon,
          speed: fix.speed,
          course: fix.course,
          depth: fix.depth,
          timestamp: new Date(fix.received_at).toISOString(),
        },
      }),
    );
  }, []);

  const handleConnectionState = useCallback((nextState: TelemetryConnectionState) => {
    const previousState = connectionStateRef.current;
    connectionStateRef.current = nextState;
    setConnectionStatus(nextState);

    if (nextState === 'ok') {
      if (previousState !== 'ok' && simulationEnabledRef.current) {
        setRecordingState((prev) => trackRecorderReduce(prev, { type: 'connectionRestored' }));
      }
      setConnectionLostSeconds(0);
      return;
    }

    setConnectionLostSeconds(Math.max(1, Math.floor((Date.now() - lastFixAtRef.current) / 1000)));
  }, []);

  useEffect(() => {
    const unsubscribeFix = telemetryProvider.onFix(handleTelemetryFix);
    const unsubscribeConnection = telemetryProvider.onConnectionState(handleConnectionState);
    telemetryProvider.start();
    return () => {
      unsubscribeFix();
      unsubscribeConnection();
      telemetryProvider.stop();
    };
  }, [handleConnectionState, handleTelemetryFix, telemetryProvider]);

  useEffect(() => {
    telemetryProvider.setEnabled(simulationEnabled);
  }, [simulationEnabled, telemetryProvider]);

  useEffect(() => {
    telemetryProvider.setSimulateConnectionError(simulateConnectionError);
  }, [simulateConnectionError, telemetryProvider]);

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
    setLayers((prev) => ({
      ...prev,
      track: next.layers.track,
      routes: next.layers.routes,
      markers: next.layers.markers,
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
        simulationEnabled={simulationEnabled}
        simulateConnectionError={simulateConnectionError}
        onToolChange={handleToolChange}
        onTrackAction={handleTrackAction}
        onFollowToggle={() => setIsFollowing(!isFollowing)}
        onSimulationToggle={() => setSimulationEnabled((prev) => !prev)}
        onSimulationErrorToggle={() => setSimulateConnectionError((prev) => !prev)}
        onOpenCreate={() => setShowCreateMission(true)}
        onOpenOpen={() => setShowOpenMission(true)}
        onOpenExport={() => setShowExport(true)}
        onOpenSettings={() => setShowSettings(true)}
        onFinishMission={handleFinishMission}
      />

      <div className="flex-1 flex overflow-hidden">
        <LeftPanel
          layers={layers}
          onLayerToggle={handleLayerToggle}
          objects={objects}
          missionDocument={missionDocument}
          trackStatus={trackStatus}
          selectedObjectId={selectedObjectId}
          onObjectSelect={handleObjectSelect}
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
            styles={styles}
            mapView={mapView}
            objects={objects}
            selectedObjectId={selectedObjectId}
            diverData={diverData}
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
          coordPrecision={coordPrecision}
          styles={styles}
          connectionStatus={connectionStatus}
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
        onApply={handleSettingsApply}
        onReset={handleSettingsReset}
      />
    </div>
  );
};

export default MapWorkspace;
