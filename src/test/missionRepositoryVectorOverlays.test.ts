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

describe('mission repository vector overlays persistence (T-102)', () => {
  it('persists vector_overlays metadata in mission ui', async () => {
    const store = createMemoryStore();
    const repository = createMissionRepository(store);
    const rootPath = 'C:/Missions/VectorMission';

    await repository.createMission(
      {
        rootPath,
        name: 'Vector mission',
        now: new Date('2026-03-03T10:00:00.000Z'),
        ui: {
          vector_overlays: [
            {
              id: 'overlay-1',
              name: 'plan-1',
              file: 'overlays/vectors/overlay-1.dxf',
              cache_file: 'overlays/vectors/overlay-1.vector-cache.json',
              type: 'dxf',
              utm_zone: 37,
              utm_hemisphere: 'N',
              opacity: 0.75,
              visible: true,
              z_index: 1,
            },
            {
              id: 'overlay-2',
              name: 'plan-2',
              file: 'overlays/vectors/overlay-2.dwg.b64',
              cache_file: 'overlays/vectors/overlay-2.vector-cache.json',
              type: 'dwg',
              file_encoding: 'base64',
              utm_zone: 37,
              utm_hemisphere: 'N',
              opacity: 1,
              visible: true,
              z_index: 2,
            },
          ],
        },
      },
      { acquireLock: false },
    );

    const opened = await repository.openMission(rootPath, { acquireLock: false });
    expect(opened.mission.ui?.vector_overlays).toHaveLength(2);
    expect(opened.mission.ui?.vector_overlays?.[0].file).toBe('overlays/vectors/overlay-1.dxf');
    expect(opened.mission.ui?.vector_overlays?.[0].cache_file).toBe('overlays/vectors/overlay-1.vector-cache.json');
    expect(opened.mission.ui?.vector_overlays?.[0].type).toBe('dxf');
    expect(opened.mission.ui?.vector_overlays?.[0].utm_zone).toBe(37);
    expect(opened.mission.ui?.vector_overlays?.[1].file).toBe('overlays/vectors/overlay-2.dwg.b64');
    expect(opened.mission.ui?.vector_overlays?.[1].cache_file).toBe('overlays/vectors/overlay-2.vector-cache.json');
    expect(opened.mission.ui?.vector_overlays?.[1].type).toBe('dwg');
    expect(opened.mission.ui?.vector_overlays?.[1].file_encoding).toBe('base64');
  });
});
