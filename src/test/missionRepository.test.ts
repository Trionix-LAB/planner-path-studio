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
    appendText: async (path, content) => {
      const current = db.get(path) ?? '';
      db.set(path, `${current}${content}`);
    },
    flush: async () => {},
    remove: async (path) => {
      db.delete(path);
      const prefix = `${path.replace(/\/+$/g, '')}/`;
      for (const key of Array.from(db.keys())) {
        if (key.startsWith(prefix)) {
          db.delete(key);
        }
      }
    },
    list: async (prefix) => Array.from(db.keys()).filter((key) => key.startsWith(prefix)),
    stat: async () => null,
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
      appendText: async (path, content) => {
        const current = db.get(path) ?? '';
        db.set(path, `${current}${content}`);
      },
      flush: async () => {},
      remove: async (path) => {
        db.delete(path);
        const prefix = `${path.replace(/\/+$/g, '')}/`;
        for (const key of Array.from(db.keys())) {
          if (key.startsWith(prefix)) {
            db.delete(key);
          }
        }
      },
      list: async (prefix) => Array.from(db.keys()).filter((key) => key.startsWith(prefix)),
      stat: async () => null,
    },
  };
};

describe('mission repository', () => {
  it('stores provided mission ui on create (R-046)', async () => {
    const store = createMemoryStore();
    const repository = createMissionRepository(store);
    const rootPath = 'C:/Missions/UiMission';

    await repository.createMission(
      {
        rootPath,
        name: 'UI mission',
        now: new Date('2026-02-03T10:00:00.000Z'),
        ui: {
          follow_diver: false,
          layers: { track: false, routes: true, markers: true, base_station: false, grid: true, scale_bar: false },
          coordinates: { precision: 7 },
          measurements: { grid: { mode: 'manual', step_m: 100 }, segment_lengths_mode: 'always' },
          base_station: { navigation_source: null },
        },
      },
      { acquireLock: false },
    );

    const opened = await repository.openMission(rootPath, { acquireLock: false });
    expect(opened.mission.ui?.follow_diver).toBe(false);
    expect(opened.mission.ui?.layers?.track).toBe(false);
    expect(opened.mission.ui?.layers?.base_station).toBe(false);
    expect(opened.mission.ui?.layers?.grid).toBe(true);
    expect(opened.mission.ui?.coordinates?.precision).toBe(7);
    expect(opened.mission.ui?.measurements?.grid?.mode).toBe('manual');
    expect(opened.mission.ui?.measurements?.grid?.step_m).toBe(100);
    expect(opened.mission.ui?.measurements?.segment_lengths_mode).toBe('always');
  });

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
      agent_id: null,
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

  it('recovers stale mission lock when recoverLock option is enabled', async () => {
    const store = createMemoryStore();
    const repository = createMissionRepository(store);
    const rootPath = 'C:/Missions/RecoverLock';

    await repository.createMission(
      {
        rootPath,
        name: 'Recover lock mission',
        now: new Date('2026-02-03T10:00:00.000Z'),
      },
      { acquireLock: false },
    );
    await store.writeText(`${rootPath}/mission.lock`, '{"owner":"stale"}');

    await expect(repository.openMission(rootPath, { acquireLock: true })).rejects.toThrow('Mission is locked');

    const opened = await repository.openMission(rootPath, { acquireLock: true, recoverLock: true });
    expect(opened.rootPath).toBe(rootPath);
    expect(await repository.hasLock(rootPath)).toBe(true);
  });

  it('opens mission from backup when primary mission file is missing', async () => {
    const store = createMemoryStore();
    const repository = createMissionRepository(store);
    const rootPath = 'C:/Missions/BackupRecovery';

    const created = await repository.createMission(
      {
        rootPath,
        name: 'Backup recovery mission',
        now: new Date('2026-02-03T10:00:00.000Z'),
      },
      { acquireLock: false },
    );
    created.mission.name = 'Recovered from backup';
    await repository.saveMission(created);

    expect(await store.exists(`${rootPath}/mission.json.bak`)).toBe(true);
    await store.remove(`${rootPath}/mission.json`);

    const opened = await repository.openMission(rootPath, { acquireLock: false });
    expect(opened.mission.name).toBe('Recovered from backup');
    expect(await store.exists(`${rootPath}/mission.json`)).toBe(true);
  });

  it('opens mission from backup when primary mission file is empty', async () => {
    const store = createMemoryStore();
    const repository = createMissionRepository(store);
    const rootPath = 'C:/Missions/BackupRecoveryEmpty';

    await repository.createMission(
      {
        rootPath,
        name: 'Backup recovery mission',
        now: new Date('2026-02-03T10:00:00.000Z'),
      },
      { acquireLock: false },
    );

    await store.writeText(`${rootPath}/mission.json`, '');

    const opened = await repository.openMission(rootPath, { acquireLock: false });
    expect(opened.mission.name).toBe('Backup recovery mission');
    expect(await store.exists(`${rootPath}/mission.json`)).toBe(true);
  });

  it('recovers mission from WAL snapshot when mission files are missing', async () => {
    const store = createMemoryStore();
    const repository = createMissionRepository(store);
    const rootPath = 'C:/Missions/WalRecoveryMissing';

    const created = await repository.createMission(
      {
        rootPath,
        name: 'Checkpoint mission',
        now: new Date('2026-02-03T10:00:00.000Z'),
      },
      { acquireLock: false },
    );

    created.mission.name = 'Recovered from WAL';
    await repository.stageMission(created);

    await store.remove(`${rootPath}/mission.json`);
    await store.remove(`${rootPath}/mission.json.bak`);
    await store.remove(`${rootPath}/routes/routes.geojson`);
    await store.remove(`${rootPath}/markers/markers.geojson`);

    const opened = await repository.openMission(rootPath, { acquireLock: false });
    expect(opened.mission.name).toBe('Recovered from WAL');
    expect(await store.exists(`${rootPath}/mission.json`)).toBe(true);
    expect(await store.exists(`${rootPath}/mission.json.bak`)).toBe(true);
    expect(await store.exists(`${rootPath}/routes/routes.geojson`)).toBe(true);
    expect(await store.exists(`${rootPath}/markers/markers.geojson`)).toBe(true);
  });

  it('prefers newer WAL snapshot over older checkpoint metadata', async () => {
    const store = createMemoryStore();
    const repository = createMissionRepository(store);
    const rootPath = 'C:/Missions/WalRecoveryNewer';

    const created = await repository.createMission(
      {
        rootPath,
        name: 'Initial checkpoint',
        now: new Date('2026-02-03T10:00:00.000Z'),
      },
      { acquireLock: false },
    );

    created.mission.name = 'Pending WAL update';
    await repository.stageMission(created);

    const opened = await repository.openMission(rootPath, { acquireLock: false });
    expect(opened.mission.name).toBe('Pending WAL update');

    const missionContent = await store.readText(`${rootPath}/mission.json`);
    expect(missionContent).toContain('Pending WAL update');
  });

  it('converts draft mission into a regular mission and clears draft root', async () => {
    const store = createMemoryStore();
    const repository = createMissionRepository(store);
    const draftRootPath = 'draft/current';
    const missionRootPath = 'C:/Missions/Converted';

    const draft = await repository.createMission(
      {
        rootPath: draftRootPath,
        name: 'Черновик',
        now: new Date('2026-02-03T10:00:00.000Z'),
      },
      { acquireLock: false },
    );

    draft.mission.tracks.push({
      id: 'track-1',
      agent_id: null,
      file: 'tracks/track-0001.csv',
      started_at: '2026-02-03T10:01:00.000Z',
      ended_at: null,
      note: null,
    });
    draft.trackPointsByTrackId['track-1'] = [
      {
        timestamp: '2026-02-03T10:01:01.000Z',
        lat: 59.93863,
        lon: 30.31413,
        segment_id: 1,
      },
    ];

    draft.routes.features.push({
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

    await repository.saveMission(draft);

    const converted = await repository.convertDraftToMission({
      draftRootPath,
      missionRootPath,
      name: 'Converted mission',
      now: new Date('2026-02-03T10:05:00.000Z'),
    });

    expect(converted.rootPath).toBe(missionRootPath);
    expect(converted.mission.name).toBe('Converted mission');
    expect(converted.mission.tracks).toHaveLength(1);
    expect(converted.trackPointsByTrackId['track-1']).toHaveLength(1);
    expect(converted.routes.features).toHaveLength(1);
    expect(await store.exists(`${draftRootPath}/mission.json`)).toBe(false);

    const reopened = await repository.openMission(missionRootPath, { acquireLock: false });
    expect(reopened.mission.name).toBe('Converted mission');
    expect(reopened.mission.tracks).toHaveLength(1);
    expect(reopened.trackPointsByTrackId['track-1']).toHaveLength(1);
    expect(reopened.routes.features).toHaveLength(1);
  });

  it('does not write mission files when lock already exists on create', async () => {
    const store = createMemoryStore();
    const repository = createMissionRepository(store);
    const rootPath = 'C:/Missions/LockedOnCreate';
    await store.writeText(`${rootPath}/mission.lock`, '{"owner":"other"}');

    await expect(
      repository.createMission(
        {
          rootPath,
          name: 'Should fail',
          now: new Date('2026-02-03T10:00:00.000Z'),
        },
        { acquireLock: true },
      ),
    ).rejects.toThrow('Mission is locked');

    expect(await store.exists(`${rootPath}/mission.json`)).toBe(false);
    expect(await store.exists(`${rootPath}/routes/routes.geojson`)).toBe(false);
    expect(await store.exists(`${rootPath}/markers/markers.geojson`)).toBe(false);
  });

  it('fails when track csv has no required headers', async () => {
    const store = createMemoryStore();
    const repository = createMissionRepository(store);
    const rootPath = 'C:/Missions/BrokenTrack';

    const created = await repository.createMission(
      {
        rootPath,
        name: 'Broken CSV mission',
        now: new Date('2026-02-03T10:00:00.000Z'),
      },
      { acquireLock: false },
    );

    created.mission.tracks.push({
      id: 'track-1',
      agent_id: null,
      file: 'tracks/track-0001.csv',
      started_at: '2026-02-03T10:01:00.000Z',
      ended_at: null,
      note: null,
    });
    created.mission.active_track_id = 'track-1';
    await repository.saveMission(created);
    await store.writeText(`${rootPath}/tracks/track-0001.csv`, 'timestamp,lat,lon\n2026-02-03T10:01:01.000Z,59.9,30.3');

    await expect(repository.openMission(rootPath, { acquireLock: false })).rejects.toThrow(
      'missing required headers',
    );
  });
});
