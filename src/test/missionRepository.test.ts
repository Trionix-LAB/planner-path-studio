import { createMissionRepository } from '@/features/mission';
import type { FileStoreBridge } from '@/platform/contracts';

const createMemoryStore = (): FileStoreBridge => {
  const db = new Map<string, string>();
  return {
    exists: async (path) => db.has(path),
    readText: async (path) => db.get(path) ?? null,
    writeText: async (path, content) => {
      db.set(path, content);
    },
    remove: async (path) => {
      db.delete(path);
    },
    list: async (prefix) => Array.from(db.keys()).filter((key) => key.startsWith(prefix)),
  };
};

const createMemoryStoreWithReadLog = (): { store: FileStoreBridge; readLog: string[] } => {
  const db = new Map<string, string>();
  const readLog: string[] = [];
  return {
    readLog,
    store: {
      exists: async (path) => db.has(path),
      readText: async (path) => {
        readLog.push(path);
        return db.get(path) ?? null;
      },
      writeText: async (path, content) => {
        db.set(path, content);
      },
      remove: async (path) => {
        db.delete(path);
      },
      list: async (prefix) => Array.from(db.keys()).filter((key) => key.startsWith(prefix)),
    },
  };
};

describe('mission repository', () => {
  it('creates mission files and reopens mission without data loss', async () => {
    const store = createMemoryStore();
    const repository = createMissionRepository(store);
    const rootPath = 'C:/Missions/TestMission';

    const created = await repository.createMission({
      rootPath,
      name: 'Dive 1',
      now: new Date('2026-02-03T10:00:00.000Z'),
    });

    expect(await store.exists('C:/Missions/TestMission/mission.json')).toBe(true);
    expect(await store.exists('C:/Missions/TestMission/routes/routes.geojson')).toBe(true);
    expect(await store.exists('C:/Missions/TestMission/markers/markers.geojson')).toBe(true);

    created.mission.tracks.push({
      id: 'track-1',
      file: 'tracks/track-0001.csv',
      started_at: '2026-02-03T10:01:00.000Z',
      ended_at: null,
      note: null,
    });
    created.mission.active_track_id = 'track-1';
    created.trackPointsByTrackId['track-1'] = [
      {
        timestamp: '2026-02-03T10:01:01.000Z',
        lat: 59.93863,
        lon: 30.31413,
        segment_id: 1,
        depth_m: 5.1,
      },
      {
        timestamp: '2026-02-03T10:01:03.000Z',
        lat: 59.9387,
        lon: 30.3142,
        segment_id: 1,
        depth_m: 5.2,
      },
    ];

    created.routes.features.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [30.31413, 59.93863],
          [30.3142, 59.9387],
        ],
      },
      properties: {
        id: 'route-1',
        kind: 'route',
        name: 'Route 1',
        note: null,
        created_at: '2026-02-03T10:01:00.000Z',
        updated_at: '2026-02-03T10:01:00.000Z',
      },
    });

    created.markers.features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [30.3144, 59.9389],
      },
      properties: {
        id: 'marker-1',
        kind: 'marker',
        name: 'Marker 1',
        note: null,
        created_at: '2026-02-03T10:02:00.000Z',
        updated_at: '2026-02-03T10:02:00.000Z',
        description: 'Debris',
      },
    });

    await repository.saveMission(created);

    const opened = await repository.openMission(rootPath, { acquireLock: false });
    expect(opened.mission.name).toBe('Dive 1');
    expect(opened.mission.tracks).toHaveLength(1);
    expect(opened.routes.features).toHaveLength(1);
    expect(opened.markers.features).toHaveLength(1);
    expect(opened.trackPointsByTrackId['track-1']).toHaveLength(2);
    expect(opened.trackPointsByTrackId['track-1'][0].segment_id).toBe(1);
  });

  it('fails fast on newer schema_version and avoids partial parsing', async () => {
    const { store, readLog } = createMemoryStoreWithReadLog();
    const repository = createMissionRepository(store);
    const rootPath = 'C:/Missions/NewerSchema';

    const missionJson = {
      schema_version: 999,
      mission_id: 'mission-1',
      name: 'Future mission',
      created_at: '2026-02-03T10:00:00.000Z',
      updated_at: '2026-02-03T10:00:00.000Z',
      active_track_id: null,
      tracks: [],
      files: {
        routes: 'routes/routes.geojson',
        markers: 'markers/markers.geojson',
      },
    };

    await store.writeText(`${rootPath}/mission.json`, JSON.stringify(missionJson));
    await store.writeText(`${rootPath}/routes/routes.geojson`, '{"type":"FeatureCollection","features":[]}');
    await store.writeText(`${rootPath}/markers/markers.geojson`, '{"type":"FeatureCollection","features":[]}');

    await expect(repository.openMission(rootPath)).rejects.toThrow('newer than supported');
    expect(readLog).toContain(`${rootPath}/mission.json`);
    expect(readLog).not.toContain(`${rootPath}/routes/routes.geojson`);
    expect(readLog).not.toContain(`${rootPath}/markers/markers.geojson`);
  });

  it('creates and releases mission lock', async () => {
    const store = createMemoryStore();
    const repository = createMissionRepository(store);
    const rootPath = 'C:/Missions/LockMission';

    await repository.createMission(
      {
        rootPath,
        name: 'Lock mission',
        now: new Date('2026-02-03T10:00:00.000Z'),
      },
      { acquireLock: true },
    );

    expect(await repository.hasLock(rootPath)).toBe(true);
    await repository.releaseLock(rootPath);
    expect(await repository.hasLock(rootPath)).toBe(false);
  });
});
