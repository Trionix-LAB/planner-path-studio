import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const loadRecentMissionsMock = vi.fn();

vi.mock('@/features/mission/model/recentMissions', async () => {
  const actual = await vi.importActual<typeof import('@/features/mission/model/recentMissions')>(
    '@/features/mission/model/recentMissions',
  );
  return {
    ...actual,
    loadRecentMissions: (...args: unknown[]) => loadRecentMissionsMock(...args),
  };
});

import { useRecentMissions } from '@/hooks/useRecentMissions';

describe('useRecentMissions', () => {
  it('reloads when missionsDir or limit changes and exposes reload()', async () => {
    loadRecentMissionsMock.mockResolvedValue([{ name: 'A', rootPath: 'C:/Missions/A', dateLabel: 'x' }]);

    const { result, rerender } = renderHook(
      ({ missionsDir, limit }: { missionsDir: string; limit: number }) =>
        useRecentMissions({ missionsDir, limit }),
      { initialProps: { missionsDir: 'C:/Missions', limit: 5 } },
    );

    await waitFor(() => {
      expect(loadRecentMissionsMock).toHaveBeenCalledTimes(1);
    });
    expect(loadRecentMissionsMock).toHaveBeenLastCalledWith(expect.anything(), {
      missionsDir: 'C:/Missions',
      limit: 5,
    });

    rerender({ missionsDir: 'D:/Archive', limit: 5 });
    await waitFor(() => {
      expect(loadRecentMissionsMock).toHaveBeenCalledTimes(2);
    });
    expect(loadRecentMissionsMock).toHaveBeenLastCalledWith(expect.anything(), {
      missionsDir: 'D:/Archive',
      limit: 5,
    });

    rerender({ missionsDir: 'D:/Archive', limit: 10 });
    await waitFor(() => {
      expect(loadRecentMissionsMock).toHaveBeenCalledTimes(3);
    });
    expect(loadRecentMissionsMock).toHaveBeenLastCalledWith(expect.anything(), {
      missionsDir: 'D:/Archive',
      limit: 10,
    });

    await act(async () => {
      await result.current.reload();
    });
    expect(loadRecentMissionsMock).toHaveBeenCalledTimes(4);
  });
});
