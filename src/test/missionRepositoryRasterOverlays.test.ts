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
        if (key.startsWith(prefix)) db.delete(key);
      }
    },
    list: async (prefix) => Array.from(db.keys()).filter((key) => key.startsWith(prefix)),
    stat: async () => null,
  };
};

describe('mission repository raster overlays persistence (T-97)', () => {
  it('persists raster_overlays metadata in mission ui', async () => {
    const store = createMemoryStore();
    const repository = createMissionRepository(store);
    const rootPath = 'C:/Missions/RasterMission';

    await repository.createMission(
      {
        rootPath,
        name: 'Raster mission',
        now: new Date('2026-03-02T10:00:00.000Z'),
        ui: {
          follow_diver: true,
          raster_overlays: [
            {
              id: 'overlay-1',
              name: 'scan-1',
              file: 'overlays/rasters/overlay-1.tif.b64',
              bounds: { north: 60, south: 59, east: 31, west: 30 },
              opacity: 0.8,
              visible: true,
              z_index: 1,
              source: 'geotiff',
            },
          ],
        },
      },
      { acquireLock: false },
    );

    const opened = await repository.openMission(rootPath, { acquireLock: false });
    expect(opened.mission.ui?.raster_overlays).toHaveLength(1);
    expect(opened.mission.ui?.raster_overlays?.[0].file).toBe('overlays/rasters/overlay-1.tif.b64');
    expect(opened.mission.ui?.raster_overlays?.[0].source).toBe('geotiff');
  });
});
