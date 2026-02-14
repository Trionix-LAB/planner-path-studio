import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useMissionListView } from '@/hooks/useMissionListView';
import type { RecentMissionItem } from '@/features/mission/model/recentMissions';

const createMission = (name: string, updatedAtMs: number): RecentMissionItem => ({
  name,
  rootPath: `C:/Missions/${name}`,
  dateLabel: String(updatedAtMs),
  updatedAtMs,
});

describe('useMissionListView', () => {
  it('sorts by date desc by default and paginates 5 items per page', () => {
    const missions: RecentMissionItem[] = [
      createMission('Mission A', 100),
      createMission('Mission B', 700),
      createMission('Mission C', 200),
      createMission('Mission D', 600),
      createMission('Mission E', 500),
      createMission('Mission F', 400),
      createMission('Mission G', 300),
    ];

    const { result } = renderHook(() => useMissionListView(missions));

    expect(result.current.totalPages).toBe(2);
    expect(result.current.pagedMissions).toHaveLength(5);
    expect(result.current.pagedMissions.map((mission) => mission.name)).toEqual([
      'Mission B',
      'Mission D',
      'Mission E',
      'Mission F',
      'Mission G',
    ]);

    act(() => {
      result.current.setPage(2);
    });

    expect(result.current.pagedMissions.map((mission) => mission.name)).toEqual(['Mission C', 'Mission A']);
  });

  it('supports alphabetical sorting by name', () => {
    const missions: RecentMissionItem[] = [
      createMission('Zulu', 200),
      createMission('Bravo', 100),
      createMission('Alpha', 300),
    ];

    const { result } = renderHook(() => useMissionListView(missions, { pageSize: 5 }));

    act(() => {
      result.current.setSortMode('name');
    });

    expect(result.current.pagedMissions.map((mission) => mission.name)).toEqual(['Alpha', 'Bravo', 'Zulu']);
  });

  it('returns empty list and one page for empty input', () => {
    const { result } = renderHook(() => useMissionListView([]));

    expect(result.current.totalPages).toBe(1);
    expect(result.current.page).toBe(1);
    expect(result.current.pagedMissions).toEqual([]);
  });
});
