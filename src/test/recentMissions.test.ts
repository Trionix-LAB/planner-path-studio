import { loadRecentMissions } from '@/features/mission/model/recentMissions';
import type { Platform } from '@/platform';

type TestPlatformOptions = {
  isElectron: boolean;
  files?: Record<string, string>;
  mtimes?: Record<string, number>;
};

const createPlatform = ({ isElectron, files = {}, mtimes = {} }: TestPlatformOptions): Platform => ({
  runtime: { isElectron },
  paths: {
    defaultMissionsDir: () => 'C:/Missions',
    defaultExportsDir: () => 'C:/Exports',
  },
  map: {
    tileLayerUrl: () => '',
    tileLayerAttribution: () => '',
    maxNativeZoom: () => 19,
    maxZoom: () => 22,
    tileSubdomains: () => undefined,
    tileSize: () => undefined,
    detectRetina: () => undefined,
    overlayTileLayerUrl: () => undefined,
    overlayTileLayerAttribution: () => undefined,
    overlayMaxNativeZoom: () => undefined,
    overlayMaxZoom: () => undefined,
    overlayTileSubdomains: () => undefined,
    overlayTileSize: () => undefined,
    overlayDetectRetina: () => undefined,
    zoomSnap: () => 0.25,
    zoomDelta: () => 0.25,
    wheelPxPerZoomLevel: () => 120,
  },
  fs: {
    pickDirectory: async () => null,
  },
  settings: {
    readJson: async () => null,
    writeJson: async () => {},
    remove: async () => {},
  },
  fileStore: {
    exists: async (path) => Object.prototype.hasOwnProperty.call(files, path),
    readText: async (path) => files[path] ?? null,
    writeText: async () => {},
    appendText: async () => {},
    flush: async () => {},
    remove: async () => {},
    list: async (prefix) => Object.keys(files).filter((key) => key.startsWith(prefix)),
    stat: async (path) => {
      const mtimeMs = mtimes[path];
      return Number.isFinite(mtimeMs) ? { mtimeMs } : null;
    },
  },
});

describe('loadRecentMissions (R-014 — Recent missions)', () => {
  it('sorts by mtime and applies limit in electron mode', async () => {
    const files = {
      'C:/Missions/A/mission.json': JSON.stringify({ name: 'Mission A', updated_at: '2026-01-01T10:00:00.000Z' }),
      'C:/Missions/B/mission.json': JSON.stringify({ name: 'Mission B', updated_at: '2026-01-02T10:00:00.000Z' }),
      'C:/Missions/C/mission.json': JSON.stringify({ name: 'Mission C', updated_at: '2026-01-03T10:00:00.000Z' }),
      'C:/Missions/D/mission.json': JSON.stringify({ name: 'Mission D', updated_at: '2026-01-04T10:00:00.000Z' }),
      'C:/Missions/E/mission.json': JSON.stringify({ name: 'Mission E', updated_at: '2026-01-05T10:00:00.000Z' }),
      'C:/Missions/F/mission.json': JSON.stringify({ name: 'Mission F', updated_at: '2026-01-06T10:00:00.000Z' }),
      'C:/Missions/ignored.txt': 'noop',
    };

    const mtimes = {
      'C:/Missions/A/mission.json': 100,
      'C:/Missions/B/mission.json': 600,
      'C:/Missions/C/mission.json': 300,
      'C:/Missions/D/mission.json': 500,
      'C:/Missions/E/mission.json': 200,
      'C:/Missions/F/mission.json': 400,
    };

    const platform = createPlatform({ isElectron: true, files, mtimes });
    const recent = await loadRecentMissions(platform, { limit: 5 });

    expect(recent).toHaveLength(5);
    expect(recent.map((mission) => mission.name)).toEqual(['Mission B', 'Mission D', 'Mission F', 'Mission C', 'Mission E']);
    expect(recent[0].rootPath).toBe('C:/Missions/B');
    expect(recent[0].dateLabel).not.toBe('—');
  });

  it('sorts by updated_at when not running in electron', async () => {
    const files = {
      'C:/Missions/A/mission.json': JSON.stringify({ name: 'Mission A', updated_at: '2026-01-01T10:00:00.000Z' }),
      'C:/Missions/B/mission.json': JSON.stringify({ name: 'Mission B', updated_at: '2026-01-03T10:00:00.000Z' }),
      'C:/Missions/C/mission.json': JSON.stringify({ name: 'Mission C', updated_at: '2026-01-02T10:00:00.000Z' }),
    };

    const platform = createPlatform({ isElectron: false, files });
    const recent = await loadRecentMissions(platform);

    expect(recent.map((mission) => mission.name)).toEqual(['Mission B', 'Mission C', 'Mission A']);
  });

  it('returns empty list when there are no mission files', async () => {
    const platform = createPlatform({ isElectron: true, files: { 'C:/Missions/readme.txt': 'noop' } });
    const recent = await loadRecentMissions(platform);

    expect(recent).toEqual([]);
  });

  it('loads all missions when limit is Infinity', async () => {
    const files = {
      'C:/Missions/A/mission.json': JSON.stringify({ name: 'Mission A', updated_at: '2026-01-01T10:00:00.000Z' }),
      'C:/Missions/B/mission.json': JSON.stringify({ name: 'Mission B', updated_at: '2026-01-03T10:00:00.000Z' }),
      'C:/Missions/C/mission.json': JSON.stringify({ name: 'Mission C', updated_at: '2026-01-02T10:00:00.000Z' }),
    };

    const platform = createPlatform({ isElectron: false, files });
    const recent = await loadRecentMissions(platform, { limit: Number.POSITIVE_INFINITY });

    expect(recent).toHaveLength(3);
    expect(recent.map((mission) => mission.name)).toEqual(['Mission B', 'Mission C', 'Mission A']);
  });

  it('uses explicit missionsDir when provided', async () => {
    const files = {
      'D:/Archive/M1/mission.json': JSON.stringify({ name: 'Archive Mission', updated_at: '2026-01-05T10:00:00.000Z' }),
      'C:/Missions/A/mission.json': JSON.stringify({ name: 'Mission A', updated_at: '2026-01-01T10:00:00.000Z' }),
    };

    const platform = createPlatform({ isElectron: false, files });
    const recent = await loadRecentMissions(platform, { missionsDir: 'D:/Archive' });

    expect(recent).toHaveLength(1);
    expect(recent[0].name).toBe('Archive Mission');
    expect(recent[0].rootPath).toBe('D:/Archive/M1');
  });

  it('falls back to mission.json.bak when mission.json is invalid', async () => {
    const files = {
      'C:/Missions/A/mission.json': '{invalid',
      'C:/Missions/A/mission.json.bak': JSON.stringify({
        name: 'Mission A (backup)',
        updated_at: '2026-01-04T10:00:00.000Z',
      }),
      'C:/Missions/B/mission.json': JSON.stringify({ name: 'Mission B', updated_at: '2026-01-03T10:00:00.000Z' }),
    };

    const platform = createPlatform({ isElectron: false, files });
    const recent = await loadRecentMissions(platform, { limit: Number.POSITIVE_INFINITY });

    expect(recent).toHaveLength(2);
    expect(recent.map((mission) => mission.name)).toEqual(['Mission A (backup)', 'Mission B']);
  });

  it('skips mission when both primary and backup metadata are invalid', async () => {
    const files = {
      'C:/Missions/A/mission.json': '{invalid',
      'C:/Missions/B/mission.json': JSON.stringify({ name: 'Mission B', updated_at: '2026-01-03T10:00:00.000Z' }),
    };

    const platform = createPlatform({ isElectron: false, files });
    const recent = await loadRecentMissions(platform, { limit: Number.POSITIVE_INFINITY });

    expect(recent).toHaveLength(1);
    expect(recent[0].name).toBe('Mission B');
    expect(recent[0].rootPath).toBe('C:/Missions/B');
  });
});
