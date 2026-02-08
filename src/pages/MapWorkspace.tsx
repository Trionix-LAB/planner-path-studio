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
  createMissionRepository,
  mapObjectsToGeoJson,
  type MissionBundle,
  type MissionDocument,
  type TrackPoint,
} from '@/features/mission';
import { platform } from '@/platform';

const DRAFT_ROOT_PATH = 'draft/current';
const DRAFT_MISSION_NAME = 'Черновик';
const CONNECTION_TIMEOUT_MS = 5000;

const nowIso = (): string => new Date().toISOString();

const MapWorkspace = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const repository = useMemo(() => createMissionRepository(platform.fileStore), []);

  const [missionRootPath, setMissionRootPath] = useState<string | null>(null);
  const [missionDocument, setMissionDocument] = useState<MissionDocument | null>(null);
  const [trackPointsByTrackId, setTrackPointsByTrackId] = useState<Record<string, TrackPoint[]>>({});

  const [missionName, setMissionName] = useState<string | null>(null);
  const [isDraft, setIsDraft] = useState(true);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [activeTool, setActiveTool] = useState<Tool>('select');
  const [isFollowing, setIsFollowing] = useState(true);
  const [trackStatus, setTrackStatus] = useState<'recording' | 'paused' | 'stopped'>('stopped');
  const [connectionStatus, setConnectionStatus] = useState<'ok' | 'timeout' | 'error'>('ok');
  const [simulationEnabled, setSimulationEnabled] = useState(true);
  const [simulateConnectionError, setSimulateConnectionError] = useState(false);
  const [diverData, setDiverData] = useState({
    lat: 59.934280,
    lon: 30.335099,
    speed: 0.8,
    course: 45,
    depth: 12.5,
  });
  const [layers, setLayers] = useState({
    track: true,
    routes: true,
    markers: true,
    grid: false,
    scaleBar: true,
    diver: true,
  });
  const [objects, setObjects] = useState<MapObject[]>([]);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [showCreateMission, setShowCreateMission] = useState(false);
  const [showOpenMission, setShowOpenMission] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [cursorPosition, setCursorPosition] = useState({ lat: 59.934, lon: 30.335 });
  const [mapScale, setMapScale] = useState('1:--');
  const [isLoaded, setIsLoaded] = useState(false);

  const activeTrackSegmentRef = useRef<Record<string, number>>({});
  const lockOwnerRootRef = useRef<string | null>(null);
  const autosaveTimerRef = useRef<number | null>(null);
  const lastDataAtRef = useRef<number>(Date.now());
  const tickRef = useRef<number>(0);
  const lossTicksRemainingRef = useRef<number>(0);
  const connectionStateRef = useRef<'ok' | 'timeout' | 'error'>('ok');

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

  const releaseCurrentLock = useCallback(async () => {
    if (!lockOwnerRootRef.current) return;
    const root = lockOwnerRootRef.current;
    lockOwnerRootRef.current = null;
    await repository.releaseLock(root);
  }, [repository]);

  const updateFromBundle = useCallback((bundle: MissionBundle, draftMode: boolean) => {
    setMissionRootPath(bundle.rootPath);
    setMissionDocument(bundle.mission);
    setTrackPointsByTrackId(bundle.trackPointsByTrackId);
    setObjects(bundleToMapObjects(bundle));
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
    setTrackStatus(bundle.mission.active_track_id ? 'recording' : 'stopped');
    setAutoSaveStatus('saved');
    setSelectedObjectId(null);
    setIsLoaded(true);

    const segmentMap: Record<string, number> = {};
    for (const track of bundle.mission.tracks) {
      const points = bundle.trackPointsByTrackId[track.id] ?? [];
      const maxSegment = points.reduce((max, point) => Math.max(max, point.segment_id), 1);
      segmentMap[track.id] = maxSegment;
    }
    activeTrackSegmentRef.current = segmentMap;
  }, []);

  const startNewTrack = useCallback(() => {
    setMissionDocument((prev) => {
      if (!prev) return prev;
      const nextIndex = prev.tracks.length + 1;
      const file = `tracks/track-${String(nextIndex).padStart(4, '0')}.csv`;
      const id = `track-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      activeTrackSegmentRef.current[id] = 1;

      return {
        ...prev,
        active_track_id: id,
        tracks: [
          ...prev.tracks,
          {
            id,
            file,
            started_at: nowIso(),
            ended_at: null,
            note: null,
          },
        ],
      };
    });
    setTrackStatus('recording');
  }, []);

  const closeActiveTrack = useCallback(() => {
    setMissionDocument((prev) => {
      if (!prev?.active_track_id) return prev;
      return {
        ...prev,
        active_track_id: null,
        tracks: prev.tracks.map((track) =>
          track.id === prev.active_track_id ? { ...track, ended_at: nowIso() } : track,
        ),
      };
    });
  }, []);

  const ensureMissionRecording = useCallback(() => {
    if (isDraft) return;
    setMissionDocument((prev) => {
      if (!prev || prev.active_track_id) return prev;
      const nextIndex = prev.tracks.length + 1;
      const file = `tracks/track-${String(nextIndex).padStart(4, '0')}.csv`;
      const id = `track-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      activeTrackSegmentRef.current[id] = 1;
      setTrackStatus('recording');

      return {
        ...prev,
        active_track_id: id,
        tracks: [
          ...prev.tracks,
          {
            id,
            file,
            started_at: nowIso(),
            ended_at: null,
            note: null,
          },
        ],
      };
    });
  }, [isDraft]);

  const appendTrackPoint = useCallback((lat: number, lon: number, speed: number, course: number, depth: number) => {
    setMissionDocument((prevDoc) => {
      if (!prevDoc?.active_track_id || trackStatus !== 'recording') return prevDoc;
      const activeTrackId = prevDoc.active_track_id;
      const segmentId = activeTrackSegmentRef.current[activeTrackId] ?? 1;

      setTrackPointsByTrackId((prevPoints) => {
        const currentTrackPoints = prevPoints[activeTrackId] ?? [];
        return {
          ...prevPoints,
          [activeTrackId]: [
            ...currentTrackPoints,
            {
              timestamp: nowIso(),
              lat,
              lon,
              segment_id: segmentId,
              depth_m: depth,
              sog_mps: speed,
              cog_deg: course,
            },
          ],
        };
      });

      return prevDoc;
    });
  }, [trackStatus]);

  const loadDraft = useCallback(async (recoverOnly: boolean) => {
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
  }, [releaseCurrentLock, repository, updateFromBundle]);

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
    if (!missionDocument || isDraft || !isLoaded) return;
    if (missionDocument.active_track_id) return;
    ensureMissionRecording();
  }, [missionDocument, isDraft, isLoaded, ensureMissionRecording]);

  useEffect(() => {
    if (!isLoaded || !missionDocument || !missionRootPath) return;
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
    }

    setAutoSaveStatus('saving');
    autosaveTimerRef.current = window.setTimeout(async () => {
      const geo = mapObjectsToGeoJson(objects);
      const nextMission: MissionDocument = {
        ...missionDocument,
        ui: {
          ...(missionDocument.ui ?? {}),
          follow_diver: isFollowing,
          layers: {
            track: layers.track,
            routes: layers.routes,
            markers: layers.markers,
            grid: layers.grid,
            scale_bar: layers.scaleBar,
          },
        },
      };

      const bundle: MissionBundle = {
        rootPath: missionRootPath,
        mission: nextMission,
        routes: geo.routes,
        markers: geo.markers,
        trackPointsByTrackId,
      };

      try {
        await repository.saveMission(bundle);
        setAutoSaveStatus('saved');
      } catch {
        setAutoSaveStatus('error');
      }
    }, 400);

    return () => {
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [isLoaded, missionDocument, missionRootPath, objects, trackPointsByTrackId, isFollowing, layers, repository]);

  useEffect(() => {
    const dataInterval = window.setInterval(() => {
      if (!simulationEnabled) {
        return;
      }
      if (simulateConnectionError) {
        connectionStateRef.current = 'error';
        setConnectionStatus('error');
        return;
      }

      tickRef.current += 1;
      if (lossTicksRemainingRef.current > 0) {
        lossTicksRemainingRef.current -= 1;
        return;
      }
      if (tickRef.current % 35 === 0) {
        lossTicksRemainingRef.current = 7;
        return;
      }

      setDiverData((prev) => {
        const next = {
          lat: prev.lat + 0.00003 * Math.sin(tickRef.current / 6),
          lon: prev.lon + 0.00003 * Math.cos(tickRef.current / 6),
          speed: Math.max(0.2, 0.8 + 0.25 * Math.sin(tickRef.current / 4)),
          course: (prev.course + 12) % 360,
          depth: Math.max(0, 12 + 2 * Math.sin(tickRef.current / 5)),
        };

        if (connectionStateRef.current !== 'ok' && missionDocument?.active_track_id) {
          const activeId = missionDocument.active_track_id;
          activeTrackSegmentRef.current[activeId] = (activeTrackSegmentRef.current[activeId] ?? 1) + 1;
        }

        lastDataAtRef.current = Date.now();
        connectionStateRef.current = 'ok';
        setConnectionStatus('ok');
        appendTrackPoint(next.lat, next.lon, next.speed, next.course, next.depth);
        return next;
      });
    }, 1000);

    const timeoutInterval = window.setInterval(() => {
      if (!simulationEnabled || simulateConnectionError) {
        return;
      }
      if (Date.now() - lastDataAtRef.current > CONNECTION_TIMEOUT_MS) {
        connectionStateRef.current = 'timeout';
        setConnectionStatus('timeout');
      }
    }, 1000);

    return () => {
      window.clearInterval(dataInterval);
      window.clearInterval(timeoutInterval);
    };
  }, [appendTrackPoint, missionDocument?.active_track_id, simulateConnectionError, simulationEnabled, trackStatus]);

  useEffect(() => {
    if (simulateConnectionError) {
      connectionStateRef.current = 'error';
      setConnectionStatus('error');
      return;
    }

    if (!simulationEnabled) {
      connectionStateRef.current = 'ok';
      setConnectionStatus('ok');
      return;
    }

    lastDataAtRef.current = Date.now();
  }, [simulateConnectionError, simulationEnabled]);

  const handleToolChange = (tool: Tool) => {
    setActiveTool(tool);
  };

  const handleLayerToggle = (layer: keyof typeof layers) => {
    if (layer === 'diver') return;
    setLayers((prev) => ({ ...prev, [layer]: !prev[layer] }));
  };

  const handleTrackAction = (action: 'pause' | 'resume' | 'stop') => {
    if (action === 'pause') {
      closeActiveTrack();
      setTrackStatus('paused');
      return;
    }
    if (action === 'resume') {
      startNewTrack();
      return;
    }
    closeActiveTrack();
    setTrackStatus('stopped');
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

  const handleBackToStart = () => {
    void releaseCurrentLock().then(() => navigate('/'));
  };

  const handleObjectUpdate = (id: string, updates: Partial<MapObject>) => {
    setObjects((prev) => prev.map((obj) => (obj.id === id ? { ...obj, ...updates } : obj)));
  };
  const handleObjectDelete = useCallback((id: string) => {
    setObjects((prev) => prev.filter((obj) => obj.id !== id));
    setSelectedObjectId((prev) => (prev === id ? null : prev));
  }, []);

  const handleRegenerateLanes = (id: string) => {
    console.log('Regenerate lanes for', id);
    // TODO: Implement lane generation logic
  };

  const getNextObjectName = (type: string) => {
    const prefix = type === 'marker' ? 'Маркер' : type === 'route' ? 'Маршрут' : 'Зона';
    const existingNames = objects
      .filter((o) => o.type === type)
      .map((o) => o.name);

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
        onBackToStart={handleBackToStart}
      />

      <div className="flex-1 flex overflow-hidden">
        <LeftPanel
          layers={layers}
          onLayerToggle={handleLayerToggle}
          objects={objects}
          selectedObjectId={selectedObjectId}
          onObjectSelect={handleObjectSelect}
          onObjectDelete={handleObjectDelete}
        />

        <div className="flex-1 relative">
          <MapCanvas
            activeTool={activeTool}
            layers={layers}
            objects={objects}
            selectedObjectId={selectedObjectId}
            diverData={diverData}
            trackSegments={trackSegments}
            isFollowing={isFollowing}
            connectionStatus={connectionStatus}
            onCursorMove={setCursorPosition}
            onObjectSelect={handleObjectSelect}
            onObjectDoubleClick={(id) => {
              handleObjectSelect(id);
            }}
            onMapDrag={() => setIsFollowing(false)}
            onObjectCreate={(geometry, options) => {
              const newObject: MapObject = {
                id: crypto.randomUUID(),
                type: geometry.type,
                name: getNextObjectName(geometry.type),
                visible: true,
                geometry: geometry,
                color: getDefaultObjectColor(geometry.type),
                // Default values
                laneAngle: geometry.type === 'zone' ? 0 : undefined,
                laneWidth: geometry.type === 'zone' ? 5 : undefined,
                note: '',
              };
              setObjects((prev) => [...prev, newObject]);
              if (!options?.preserveActiveTool) {
                setActiveTool('select');
              }
              setSelectedObjectId(newObject.id);
            }}
            onObjectUpdate={handleObjectUpdate}
            onObjectDelete={handleObjectDelete}
            onRegenerateLanes={handleRegenerateLanes}
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
        />
      </div>

      <StatusBar cursorPosition={cursorPosition} scale={mapScale} activeTool={activeTool} />

      <CreateMissionDialog
        open={showCreateMission}
        onOpenChange={setShowCreateMission}
        onConfirm={handleCreateMission}
      />

      <OpenMissionDialog
        open={showOpenMission}
        onOpenChange={setShowOpenMission}
        onConfirm={handleOpenMission}
      />

      <ExportDialog open={showExport} onOpenChange={setShowExport} />

      <SettingsDialog open={showSettings} onOpenChange={setShowSettings} />
    </div>
  );
};

export default MapWorkspace;
