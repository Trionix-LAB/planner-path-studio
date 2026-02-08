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
  type TelemetryConnectionState,
  type TelemetryFix,
  type TrackRecorderState,
} from '@/features/mission';
import { platform } from '@/platform';

const DRAFT_ROOT_PATH = 'draft/current';
const DRAFT_MISSION_NAME = 'Черновик';
const CONNECTION_TIMEOUT_MS = 5000;
const AUTOSAVE_DELAY_MS = 1200;

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
  const latestSnapshotRef = useRef<WorkspaceSnapshot>({
    missionRootPath: null,
    recordingState: createTrackRecorderState(null, {}, 'stopped'),
    objects: [],
    laneFeatures: [],
    isFollowing: true,
    layers: DEFAULT_LAYERS,
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

  useEffect(() => {
    latestSnapshotRef.current = {
      missionRootPath,
      recordingState,
      objects,
      laneFeatures,
      isFollowing,
      layers,
      isLoaded,
    };
  }, [missionRootPath, recordingState, objects, laneFeatures, isFollowing, layers, isLoaded]);

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
    setMissionRootPath(bundle.rootPath);
    setRecordingState(createTrackRecorderState(bundle.mission, bundle.trackPointsByTrackId));
    setObjects(bundleToMapObjects(bundle));
    setLaneFeatures(bundle.routes.features.filter((feature): feature is LaneFeature => feature.properties.kind === 'lane'));
    setOutdatedZoneIds({});
    setMissionName(bundle.mission.name);
    setIsDraft(draftMode);
    setIsFollowing(bundle.mission.ui?.follow_diver ?? true);
    setLayers({
      track: bundle.mission.ui?.layers?.track ?? true,
      routes: bundle.mission.ui?.layers?.routes ?? true,
      markers: bundle.mission.ui?.layers?.markers ?? true,
      grid: bundle.mission.ui?.layers?.grid ?? false,
      scaleBar: bundle.mission.ui?.layers?.scale_bar ?? true,
      diver: true,
    });
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
      const bundle = await repository.createMission({ rootPath: path, name }, { acquireLock: true });
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
    if (type === 'zone') return '#f59e0b';
    if (type === 'marker') return '#22c55e';
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
          />
        </div>

        <RightPanel
          diverData={diverData}
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

      <StatusBar cursorPosition={cursorPosition} scale={mapScale} activeTool={activeTool} />

      <CreateMissionDialog
        open={showCreateMission}
        onOpenChange={setShowCreateMission}
        onConfirm={handleCreateMission}
      />

      <OpenMissionDialog open={showOpenMission} onOpenChange={setShowOpenMission} onConfirm={handleOpenMission} />

      <ExportDialog open={showExport} onOpenChange={setShowExport} />

      <SettingsDialog open={showSettings} onOpenChange={setShowSettings} />
    </div>
  );
};

export default MapWorkspace;
