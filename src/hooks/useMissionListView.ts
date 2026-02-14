import { useEffect, useMemo, useState } from 'react';
import { RECENT_MISSIONS_LIMIT, type RecentMissionItem } from '@/features/mission/model/recentMissions';

export type MissionSortMode = 'date-desc' | 'date-asc' | 'name';

const missionDateValue = (mission: RecentMissionItem): number =>
  Number.isFinite(mission.updatedAtMs) ? mission.updatedAtMs : 0;

const sortByName = (left: RecentMissionItem, right: RecentMissionItem): number =>
  left.name.localeCompare(right.name, 'ru', { sensitivity: 'base' });

const sortByDateDesc = (left: RecentMissionItem, right: RecentMissionItem): number => {
  const byDate = missionDateValue(right) - missionDateValue(left);
  if (byDate !== 0) return byDate;
  return sortByName(left, right);
};

const sortByDateAsc = (left: RecentMissionItem, right: RecentMissionItem): number => {
  const byDate = missionDateValue(left) - missionDateValue(right);
  if (byDate !== 0) return byDate;
  return sortByName(left, right);
};

export const useMissionListView = (
  missions: RecentMissionItem[],
  options?: { pageSize?: number; initialSort?: MissionSortMode },
) => {
  const pageSize = Math.max(1, options?.pageSize ?? RECENT_MISSIONS_LIMIT);
  const [sortMode, setSortMode] = useState<MissionSortMode>(options?.initialSort ?? 'date-desc');
  const [page, setPage] = useState(1);

  const sortedMissions = useMemo(() => {
    const clone = [...missions];
    if (sortMode === 'date-asc') {
      return clone.sort(sortByDateAsc);
    }
    if (sortMode === 'name') {
      return clone.sort(sortByName);
    }
    return clone.sort(sortByDateDesc);
  }, [missions, sortMode]);

  const totalPages = Math.max(1, Math.ceil(sortedMissions.length / pageSize));

  useEffect(() => {
    setPage(1);
  }, [sortMode, pageSize, missions]);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  const pagedMissions = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedMissions.slice(start, start + pageSize);
  }, [page, pageSize, sortedMissions]);

  return {
    sortMode,
    setSortMode,
    page,
    setPage,
    totalPages,
    pagedMissions,
  };
};
