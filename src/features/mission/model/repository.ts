import type { FileStoreBridge } from '@/platform/contracts';
import {
  MISSION_SCHEMA_VERSION,
  type CreateMissionInput,
  type FeatureCollection,
  type MarkerFeature,
  type MissionBundle,
  type MissionDocument,
  type RoutesFeature,
  type TrackPoint,
} from './types';

export type MissionRepository = {
  createMission: (input: CreateMissionInput, options?: { acquireLock?: boolean }) => Promise<MissionBundle>;
  openMission: (rootPath: string, options?: { acquireLock?: boolean }) => Promise<MissionBundle>;
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
const lockPath = (rootPath: string): string => joinPath(rootPath, 'mission.lock');

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
  if (!content) return null;
  return JSON.parse(content) as T;
};

const writeJson = async (store: FileStoreBridge, path: string, value: unknown): Promise<void> => {
  await store.writeText(path, JSON.stringify(value, null, 2));
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

export const createMissionRepository = (store: FileStoreBridge): MissionRepository => {
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

  const createMission = async (
    input: CreateMissionInput,
    options?: { acquireLock?: boolean },
  ): Promise<MissionBundle> => {
    const rootPath = normalizePath(input.rootPath);
    const now = input.now ?? new Date();
    const nowIso = toIso(now);

    const mission: MissionDocument = {
      schema_version: MISSION_SCHEMA_VERSION,
      mission_id: createId(),
      name: input.name.trim(),
      created_at: nowIso,
      updated_at: nowIso,
      active_track_id: null,
      tracks: [],
      files: {
        routes: 'routes/routes.geojson',
        markers: 'markers/markers.geojson',
      },
      ui: {
        follow_diver: true,
        layers: {
          track: true,
          routes: true,
          markers: true,
          grid: false,
          scale_bar: true,
        },
      },
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
    options?: { acquireLock?: boolean },
  ): Promise<MissionBundle> => {
    const rootPath = normalizePath(rootPathInput);
    const shouldAcquireLock = options?.acquireLock !== false;
    if (shouldAcquireLock) {
      await acquireLock(rootPath);
    }

    try {
      const missionPath = joinPath(rootPath, 'mission.json');
      const mission = await readJson<MissionDocument>(store, missionPath);
      if (!mission) {
        throw new Error(`Mission file not found: ${missionPath}`);
      }
      validateMissionDocument(mission);

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
    } catch (error) {
      if (shouldAcquireLock) {
        await releaseLock(rootPath);
      }
      throw error;
    }
  };

  const saveMission = async (bundle: MissionBundle): Promise<void> => {
    const rootPath = normalizePath(bundle.rootPath);
    const nowIso = toIso(new Date());
    const mission: MissionDocument = {
      ...bundle.mission,
      updated_at: nowIso,
    };

    const missionPath = joinPath(rootPath, 'mission.json');
    const routesPath = joinPath(rootPath, mission.files.routes);
    const markersPath = joinPath(rootPath, mission.files.markers);

    await writeJson(store, missionPath, mission);
    await writeJson(store, routesPath, bundle.routes);
    await writeJson(store, markersPath, bundle.markers);

    for (const track of mission.tracks) {
      const points = bundle.trackPointsByTrackId[track.id] ?? [];
      const csvPath = joinPath(rootPath, track.file);
      await store.writeText(csvPath, toCsvTrack(points));
    }
  };

  return {
    createMission,
    openMission,
    saveMission,
    hasLock,
    acquireLock,
    releaseLock,
  };
};
