import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDelayedMissionDeletion } from '@/hooks/useDelayedMissionDeletion';
import type { Platform } from '@/platform';

const createPlatform = (
  filesByPrefix: Record<string, string[]>,
  removeMock: ReturnType<typeof vi.fn>,
): Platform => ({
  runtime: { isElectron: true },
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
    exists: async () => true,
    readText: async () => null,
    writeText: async () => {},
    remove: removeMock,
    list: async (prefix) => filesByPrefix[prefix] ?? [],
    stat: async () => null,
  },
});

describe('useDelayedMissionDeletion', () => {
  it('cancels deletion when undo is called before timeout', async () => {
    vi.useFakeTimers();
    const removeMock = vi.fn().mockResolvedValue(undefined);
    const platform = createPlatform(
      {
        'C:/Missions/A': ['C:/Missions/A/mission.json', 'C:/Missions/A/routes/routes.geojson'],
      },
      removeMock,
    );
    const onAfterDelete = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useDelayedMissionDeletion({ platform, delayMs: 5000, onAfterDelete }),
    );

    await act(async () => {
      await result.current.scheduleDelete({ rootPath: 'C:/Missions/A', name: 'Mission A' });
    });

    expect(result.current.pendingMissions).toHaveLength(1);

    act(() => {
      result.current.undoDelete('C:/Missions/A');
      vi.advanceTimersByTime(5000);
    });

    expect(result.current.pendingMissions).toHaveLength(0);
    expect(removeMock).not.toHaveBeenCalled();
    expect(onAfterDelete).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('removes mission files after timeout and triggers reload callback', async () => {
    vi.useFakeTimers();
    const removeMock = vi.fn().mockResolvedValue(undefined);
    const platform = createPlatform(
      {
        'C:/Missions/B': ['C:/Missions/B/mission.json', 'C:/Missions/B/markers/markers.geojson'],
      },
      removeMock,
    );
    const onAfterDelete = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useDelayedMissionDeletion({ platform, delayMs: 3000, onAfterDelete }),
    );

    await act(async () => {
      await result.current.scheduleDelete({ rootPath: 'C:/Missions/B', name: 'Mission B' });
    });

    expect(result.current.pendingMissions).toHaveLength(1);

    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
    });

    expect(removeMock).toHaveBeenCalledTimes(3);
    expect(removeMock).toHaveBeenNthCalledWith(1, 'C:/Missions/B/mission.json');
    expect(removeMock).toHaveBeenNthCalledWith(2, 'C:/Missions/B/markers/markers.geojson');
    expect(removeMock).toHaveBeenNthCalledWith(3, 'C:/Missions/B');
    expect(onAfterDelete).toHaveBeenCalledTimes(1);
    expect(result.current.pendingMissions).toHaveLength(0);
    vi.useRealTimers();
  });
});
