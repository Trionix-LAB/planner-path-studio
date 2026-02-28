import type { FileStoreBridge } from '@/platform/contracts';
import {
  MISSION_SCHEMA_VERSION,
  type CreateMissionInput,
  type FeatureCollection,
  type MarkerFeature,
  type MissionBundle,
  type MissionDocument,
  type MissionUiState,
  type RoutesFeature,
  type TrackPoint,
} from './types';

export type MissionRepository = {
  createMission: (input: CreateMissionInput, options?: { acquireLock?: boolean }) => Promise<MissionBundle>;
  openMission: (rootPath: string, options?: { acquireLock?: boolean; recoverLock?: boolean }) => Promise<MissionBundle>;
  convertDraftToMission: (input: {
    draftRootPath: string;
    missionRootPath: string;
    name: string;
    now?: Date;
  }) => Promise<MissionBundle>;
  stageMission: (bundle: MissionBundle) => Promise<void>;
  flushMission: (rootPath: string) => Promise<void>;
  saveMission: (bundle: MissionBundle) => Promise<void>;
  hasLock: (rootPath: string) => Promise<boolean>;
  acquireLock: (rootPath: string) => Promise<void>;
  releaseLock: (rootPath: string) => Promise<void>;
};

const normalizePath = (path: string): string => path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
const joinPath = (base: string, part: string): string => `${normalizePath(base)}/${part.replace(/^\/+/, '')}`;
const toIso = (date: Date): string => date.toISOString();

const createId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const emptyRoutes = (): FeatureCollection<RoutesFeature> => ({ type: 'FeatureCollection', features: [] });
const emptyMarkers = (): FeatureCollection<MarkerFeature> => ({ type: 'FeatureCollection', features: [] });
const MISSION_FILE_NAME = 'mission.json';
const MISSION_BACKUP_FILE_NAME = 'mission.json.bak';
const MISSION_WAL_FILE_NAME = 'logs/wal/current.wal';
const MISSION_WAL_SCHEMA_VERSION = 1;
const lockPath = (rootPath: string): string => joinPath(rootPath, 'mission.lock');
const walPath = (rootPath: string): string => joinPath(rootPath, MISSION_WAL_FILE_NAME);
const isLockError = (error: unknown): boolean =>
  error instanceof Error && error.message.startsWith('Mission is locked:');

const parseNumber = (value: string | undefined): number | undefined => {
  if (value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const REQUIRED_TRACK_HEADERS = ['timestamp', 'lat', 'lon', 'segment_id'] as const;

const parseCsvTrack = (csv: string): TrackPoint[] => {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length <= 1) return [];

  const headers = lines[0].split(',');
  const indexByHeader = new Map<string, number>();
  headers.forEach((header, index) => indexByHeader.set(header.trim(), index));

  const missingHeaders = REQUIRED_TRACK_HEADERS.filter((header) => !indexByHeader.has(header));
  if (missingHeaders.length > 0) {
    throw new Error(`Track CSV is missing required headers: ${missingHeaders.join(', ')}`);
  }

  const points: TrackPoint[] = [];
  for (const line of lines.slice(1)) {
    const columns = line.split(',');
    const get = (header: string): string | undefined => {
      const index = indexByHeader.get(header);
      return index === undefined ? undefined : columns[index];
    };

    const timestamp = get('timestamp')?.trim() ?? '';
    const lat = Number(get('lat'));
    const lon = Number(get('lon'));
    const segmentId = Number(get('segment_id'));

    if (!timestamp || !Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(segmentId)) {
      continue;
    }

    points.push({
      timestamp,
      lat,
      lon,
      segment_id: Math.max(1, Math.trunc(segmentId)),
      depth_m: parseNumber(get('depth_m')),
      sog_mps: parseNumber(get('sog_mps')),
      cog_deg: parseNumber(get('cog_deg')),
    });
  }
  return points;
};

const toCsvTrack = (points: TrackPoint[]): string => {
  const header = 'timestamp,lat,lon,segment_id,depth_m,sog_mps,cog_deg';
  const rows = points.map((point) => {
    const depth = point.depth_m ?? '';
    const sog = point.sog_mps ?? '';
    const cog = point.cog_deg ?? '';
    return `${point.timestamp},${point.lat},${point.lon},${point.segment_id},${depth},${sog},${cog}`;
  });
  return [header, ...rows].join('\n');
};

const readJson = async <T>(store: FileStoreBridge, path: string): Promise<T | null> => {
  const content = await store.readText(path);
  if (content === null) return null;
  if (content.trim().length === 0) return null;
  return JSON.parse(content) as T;
};

const writeJson = async (store: FileStoreBridge, path: string, value: unknown): Promise<void> => {
  await store.writeText(path, JSON.stringify(value, null, 2));
};

type MissionWalDocument = {
  schema_version: number;
  created_at: string;
  mission: MissionDocument;
  routes: FeatureCollection<RoutesFeature>;
  markers: FeatureCollection<MarkerFeature>;
  track_points_by_track_id: Record<string, TrackPoint[]>;
};

const validateMissionDocument = (mission: MissionDocument): void => {
  if (typeof mission.schema_version !== 'number' || !Number.isFinite(mission.schema_version)) {
    throw new Error('Mission schema_version is invalid');
  }
  if (mission.schema_version > MISSION_SCHEMA_VERSION) {
    throw new Error(
      `Mission schema_version ${mission.schema_version} is newer than supported ${MISSION_SCHEMA_VERSION}. App update required.`,
    );
  }
  if (mission.schema_version < MISSION_SCHEMA_VERSION) {
    throw new Error(
      `Mission schema_version ${mission.schema_version} is older than supported ${MISSION_SCHEMA_VERSION}.`,
    );
  }
  if (!mission.files?.routes || !mission.files?.markers) {
    throw new Error('Mission files map is missing');
  }
};

const missionUpdatedAtMs = (mission: MissionDocument): number => {
  const parsed = Date.parse(mission.updated_at);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeLoadedMissionDocument = (mission: MissionDocument): MissionDocument => {
  const normalized: MissionDocument = {
    ...mission,
    active_tracks: mission.active_tracks ? { ...mission.active_tracks } : {},
    tracks: mission.tracks.map((track) => ({
      ...track,
      agent_id: track.agent_id ?? null,
    })),
  };

  if (normalized.active_track_id && Object.keys(normalized.active_tracks).length === 0) {
    const primaryAgentId = (normalized.ui?.divers?.[0] as { uid?: string } | undefined)?.uid ?? 'primary';
    normalized.active_tracks[primaryAgentId] = normalized.active_track_id;
    normalized.active_track_id = null;
  }

  return normalized;
};

const withUpdatedAt = (bundle: MissionBundle, now: Date = new Date()): MissionBundle => ({
  ...bundle,
  mission: {
    ...bundle.mission,
    updated_at: toIso(now),
  },
});

const toWalDocument = (bundle: MissionBundle): MissionWalDocument => ({
  schema_version: MISSION_WAL_SCHEMA_VERSION,
  created_at: toIso(new Date()),
  mission: bundle.mission,
  routes: bundle.routes,
  markers: bundle.markers,
  track_points_by_track_id: bundle.trackPointsByTrackId,
});

export const createMissionRepository = (store: FileStoreBridge): MissionRepository => {
  const saveQueuesByRootPath = new Map<string, Promise<void>>();

  const enqueueByRootPath = async <T>(rootPathInput: string, operation: () => Promise<T>): Promise<T> => {
    const rootPath = normalizePath(rootPathInput);
    const previous = saveQueuesByRootPath.get(rootPath) ?? Promise.resolve();
    let result: T | undefined;
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        result = await operation();
      });
    saveQueuesByRootPath.set(rootPath, next);

    try {
      await next;
      return result as T;
    } finally {
      if (saveQueuesByRootPath.get(rootPath) === next) {
        saveQueuesByRootPath.delete(rootPath);
      }
    }
  };

  const hasLock = async (rootPath: string): Promise<boolean> => {
    return store.exists(lockPath(rootPath));
  };

  const acquireLock = async (rootPath: string): Promise<void> => {
    const normalized = normalizePath(rootPath);
    const path = lockPath(normalized);
    if (await store.exists(path)) {
      throw new Error(`Mission is locked: ${normalized}`);
    }

    await store.writeText(
      path,
      JSON.stringify(
        {
          created_at: toIso(new Date()),
          owner: 'planner-path-studio:web',
        },
        null,
        2,
      ),
    );
  };

  const releaseLock = async (rootPath: string): Promise<void> => {
    await store.remove(lockPath(rootPath));
  };

  const loadBundleFromMissionDocument = async (rootPath: string, missionInput: MissionDocument): Promise<MissionBundle> => {
    validateMissionDocument(missionInput);
    const mission = normalizeLoadedMissionDocument(missionInput);

    const routesPath = joinPath(rootPath, mission.files.routes);
    const markersPath = joinPath(rootPath, mission.files.markers);
    const routes = (await readJson<FeatureCollection<RoutesFeature>>(store, routesPath)) ?? emptyRoutes();
    const markers = (await readJson<FeatureCollection<MarkerFeature>>(store, markersPath)) ?? emptyMarkers();

    const trackPointsByTrackId: Record<string, TrackPoint[]> = {};
    for (const track of mission.tracks) {
      const trackPath = joinPath(rootPath, track.file);
      const trackCsv = await store.readText(trackPath);
      trackPointsByTrackId[track.id] = trackCsv ? parseCsvTrack(trackCsv) : [];
    }

    return {
      rootPath,
      mission,
      routes,
      markers,
      trackPointsByTrackId,
    };
  };

  const stageWalSnapshot = async (
    bundleInput: MissionBundle,
    options?: { touchUpdatedAt?: boolean },
  ): Promise<MissionBundle> => {
    const rootPath = normalizePath(bundleInput.rootPath);
    const normalizedBundle: MissionBundle = {
      ...bundleInput,
      rootPath,
    };
    const stagedBundle = options?.touchUpdatedAt === false ? normalizedBundle : withUpdatedAt(normalizedBundle);
    const path = walPath(rootPath);
    await writeJson(store, path, toWalDocument(stagedBundle));
    await store.flush(path);
    return stagedBundle;
  };

  const readWalSnapshot = async (rootPathInput: string): Promise<MissionBundle | null> => {
    const rootPath = normalizePath(rootPathInput);
    const wal = await readJson<MissionWalDocument>(store, walPath(rootPath));
    if (!wal) return null;
    if (wal.schema_version !== MISSION_WAL_SCHEMA_VERSION) {
      return null;
    }
    validateMissionDocument(wal.mission);
    return {
      rootPath,
      mission: normalizeLoadedMissionDocument(wal.mission),
      routes: wal.routes ?? emptyRoutes(),
      markers: wal.markers ?? emptyMarkers(),
      trackPointsByTrackId: wal.track_points_by_track_id ?? {},
    };
  };

  const writeCheckpoint = async (bundleInput: MissionBundle, options?: { clearWal?: boolean }): Promise<void> => {
    const rootPath = normalizePath(bundleInput.rootPath);
    const bundle: MissionBundle = {
      ...bundleInput,
      rootPath,
    };
    const mission = bundle.mission;

    const missionPath = joinPath(rootPath, MISSION_FILE_NAME);
    const missionBackupPath = joinPath(rootPath, MISSION_BACKUP_FILE_NAME);
    const routesPath = joinPath(rootPath, mission.files.routes);
    const markersPath = joinPath(rootPath, mission.files.markers);

    await writeJson(store, missionBackupPath, mission);
    await writeJson(store, missionPath, mission);
    await writeJson(store, routesPath, bundle.routes);
    await writeJson(store, markersPath, bundle.markers);
    await Promise.allSettled([store.flush(missionBackupPath), store.flush(missionPath)]);

    for (const track of mission.tracks) {
      const points = bundle.trackPointsByTrackId[track.id] ?? [];
      const csvPath = joinPath(rootPath, track.file);
      await store.writeText(csvPath, toCsvTrack(points));
    }

    if (options?.clearWal !== false) {
      await store.remove(walPath(rootPath));
    }
  };

  const createMission = async (
    input: CreateMissionInput,
    options?: { acquireLock?: boolean },
  ): Promise<MissionBundle> => {
    const rootPath = normalizePath(input.rootPath);
    const now = input.now ?? new Date();
    const nowIso = toIso(now);

    const defaultUi: MissionUiState = {
      follow_diver: true,
      layers: {
        track: true,
        routes: true,
        markers: true,
        base_station: true,
        grid: false,
        scale_bar: true,
      },
      base_station: {
        navigation_source: null,
      },
    };

    const mission: MissionDocument = {
      schema_version: MISSION_SCHEMA_VERSION,
      mission_id: createId(),
      name: input.name.trim(),
      created_at: nowIso,
      updated_at: nowIso,
      active_track_id: null,
      active_tracks: {},
      tracks: [],
      files: {
        routes: 'routes/routes.geojson',
        markers: 'markers/markers.geojson',
      },
      ui: input.ui ?? defaultUi,
    };

    const bundle: MissionBundle = {
      rootPath,
      mission,
      routes: emptyRoutes(),
      markers: emptyMarkers(),
      trackPointsByTrackId: {},
    };

    const shouldAcquireLock = options?.acquireLock !== false;
    if (shouldAcquireLock) {
      await acquireLock(rootPath);
    }

    try {
      await saveMission(bundle);
    } catch (error) {
      if (shouldAcquireLock) {
        await releaseLock(rootPath);
      }
      throw error;
    }
    return bundle;
  };

  const openMission = async (
    rootPathInput: string,
    options?: { acquireLock?: boolean; recoverLock?: boolean },
  ): Promise<MissionBundle> => {
    const rootPath = normalizePath(rootPathInput);
    const shouldAcquireLock = options?.acquireLock !== false;
    if (shouldAcquireLock) {
      try {
        await acquireLock(rootPath);
      } catch (error) {
        if (!options?.recoverLock || !isLockError(error)) {
          throw error;
        }
        await releaseLock(rootPath);
        await acquireLock(rootPath);
      }
    }

    try {
      const missionPath = joinPath(rootPath, MISSION_FILE_NAME);
      const missionBackupPath = joinPath(rootPath, MISSION_BACKUP_FILE_NAME);
      let missionDocument: MissionDocument | null = null;
      let missionReadError: unknown = null;

      try {
        missionDocument = await readJson<MissionDocument>(store, missionPath);
      } catch (error) {
        missionReadError = error;
      }

      if (!missionDocument) {
        try {
          missionDocument = await readJson<MissionDocument>(store, missionBackupPath);
        } catch (error) {
          if (!missionReadError) {
            missionReadError = error;
          }
        }

        if (missionDocument) {
          try {
            await writeJson(store, missionPath, missionDocument);
          } catch {
            // Best effort: opening should still succeed from backup.
          }
        }
      }

      let diskBundle: MissionBundle | null = null;
      if (missionDocument) {
        try {
          diskBundle = await loadBundleFromMissionDocument(rootPath, missionDocument);
        } catch (error) {
          missionReadError = missionReadError ?? error;
        }
      }

      let walBundle: MissionBundle | null = null;
      let walReadError: unknown = null;
      try {
        walBundle = await readWalSnapshot(rootPath);
      } catch (error) {
        walReadError = error;
      }

      if (!diskBundle && !walBundle) {
        if (missionReadError) {
          throw missionReadError;
        }
        if (walReadError) {
          throw walReadError;
        }
        throw new Error(`Mission file not found: ${missionPath}`);
      }

      const selectedBundle =
        diskBundle && walBundle
          ? missionUpdatedAtMs(walBundle.mission) >= missionUpdatedAtMs(diskBundle.mission)
            ? walBundle
            : diskBundle
          : (walBundle ?? diskBundle)!;

      if (selectedBundle === walBundle) {
        try {
          await enqueueByRootPath(rootPath, () => writeCheckpoint(walBundle, { clearWal: true }));
        } catch {
          // Best effort self-healing on recovery.
        }
      } else if (walBundle) {
        try {
          await store.remove(walPath(rootPath));
        } catch {
          // ignore stale WAL cleanup failure
        }
      }

      return selectedBundle;
    } catch (error) {
      if (shouldAcquireLock) {
        await releaseLock(rootPath);
      }
      throw error;
    }
  };

  const convertDraftToMission = async (input: {
    draftRootPath: string;
    missionRootPath: string;
    name: string;
    now?: Date;
  }): Promise<MissionBundle> => {
    const draftRootPath = normalizePath(input.draftRootPath);
    const missionRootPath = normalizePath(input.missionRootPath);
    const openedDraft = await openMission(draftRootPath, { acquireLock: false });
    const createdMission = await createMission(
      {
        rootPath: missionRootPath,
        name: input.name,
        now: input.now,
        ui: openedDraft.mission.ui,
      },
      { acquireLock: true },
    );

    const convertedMission = {
      ...openedDraft.mission,
      mission_id: createdMission.mission.mission_id,
      name: input.name.trim(),
      created_at: createdMission.mission.created_at,
      updated_at: createdMission.mission.updated_at,
    };

    const convertedBundle: MissionBundle = {
      rootPath: createdMission.rootPath,
      mission: convertedMission,
      routes: openedDraft.routes,
      markers: openedDraft.markers,
      trackPointsByTrackId: openedDraft.trackPointsByTrackId,
    };

    try {
      await saveMission(convertedBundle);
      if (draftRootPath !== missionRootPath) {
        await store.remove(draftRootPath);
      }
      return convertedBundle;
    } catch (error) {
      await releaseLock(missionRootPath);
      throw error;
    }
  };

  const saveMissionInternal = async (bundle: MissionBundle): Promise<void> => {
    const stagedWalBundle = await stageWalSnapshot(bundle, { touchUpdatedAt: true });
    await writeCheckpoint(stagedWalBundle, { clearWal: true });
  };

  const stageMission = async (bundle: MissionBundle): Promise<void> => {
    await enqueueByRootPath(bundle.rootPath, () => stageWalSnapshot(bundle, { touchUpdatedAt: true }));
  };

  const flushMission = async (rootPath: string): Promise<void> => {
    await enqueueByRootPath(rootPath, async () => {
      await store.flush(walPath(rootPath));
    });
  };

  const saveMission = async (bundle: MissionBundle): Promise<void> => {
    await enqueueByRootPath(bundle.rootPath, () => saveMissionInternal(bundle));
  };

  return {
    createMission,
    openMission,
    convertDraftToMission,
    stageMission,
    flushMission,
    saveMission,
    hasLock,
    acquireLock,
    releaseLock,
  };
};
