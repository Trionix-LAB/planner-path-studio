import type { Platform } from '@/platform';

export const RECENT_MISSIONS_LIMIT = 5;
export const ALL_MISSIONS_LIMIT = Number.POSITIVE_INFINITY;

export type RecentMissionItem = {
  name: string;
  rootPath: string;
  dateLabel: string;
};

type MissionFileData = {
  name?: unknown;
  updated_at?: unknown;
};

type RecentMissionCandidate = {
  rootPath: string;
  name: string;
  sortValue: number;
  dateValue: number;
};

const MISSION_FILE_SUFFIX = '/mission.json';

const normalizePath = (path: string): string => path.replace(/\\/g, '/').replace(/\/+$/g, '');

const missionRootFromMissionFilePath = (path: string): string => {
  const normalized = normalizePath(path);
  if (normalized.endsWith(MISSION_FILE_SUFFIX)) {
    return normalized.slice(0, -MISSION_FILE_SUFFIX.length);
  }
  return normalized;
};

const missionNameFromRootPath = (rootPath: string): string => {
  const normalized = normalizePath(rootPath);
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? normalized;
};

const parseDateValue = (value: unknown): number => {
  if (typeof value !== 'string') return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatDate = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
};

const readMissionFileData = async (platform: Platform, missionPath: string): Promise<MissionFileData | null> => {
  const content = await platform.fileStore.readText(missionPath);
  if (!content) return null;
  try {
    const parsed = JSON.parse(content) as MissionFileData;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
};

const buildCandidate = async (platform: Platform, missionPath: string): Promise<RecentMissionCandidate> => {
  const rootPath = missionRootFromMissionFilePath(missionPath);
  const missionData = await readMissionFileData(platform, missionPath);
  const missionUpdatedAt = parseDateValue(missionData?.updated_at);
  const missionName = typeof missionData?.name === 'string' && missionData.name.trim()
    ? missionData.name.trim()
    : missionNameFromRootPath(rootPath);
  const fileStat = platform.runtime.isElectron ? await platform.fileStore.stat(missionPath) : null;
  const statMtime = Number.isFinite(fileStat?.mtimeMs) ? Number(fileStat?.mtimeMs) : 0;
  const sortValue = platform.runtime.isElectron ? (statMtime || missionUpdatedAt) : missionUpdatedAt;
  const dateValue = platform.runtime.isElectron ? (statMtime || missionUpdatedAt) : missionUpdatedAt;

  return {
    rootPath,
    name: missionName,
    sortValue,
    dateValue,
  };
};

export const loadRecentMissions = async (
  platform: Platform,
  options?: { limit?: number; missionsDir?: string },
): Promise<RecentMissionItem[]> => {
  const requestedLimit = options?.limit ?? RECENT_MISSIONS_LIMIT;
  const hasFiniteLimit = Number.isFinite(requestedLimit);
  const limit = hasFiniteLimit ? Math.max(1, Math.trunc(requestedLimit)) : ALL_MISSIONS_LIMIT;
  const missionsDir = normalizePath(options?.missionsDir ?? platform.paths.defaultMissionsDir());
  const listedPaths = await platform.fileStore.list(missionsDir);
  const missionFiles = Array.from(
    new Set(
      listedPaths
        .map((path) => normalizePath(path))
        .filter((path) => path.endsWith(MISSION_FILE_SUFFIX)),
    ),
  );

  if (missionFiles.length === 0) {
    return [];
  }

  const candidates = await Promise.all(missionFiles.map((missionPath) => buildCandidate(platform, missionPath)));

  return candidates
    .sort((left, right) => right.sortValue - left.sortValue)
    .slice(0, hasFiniteLimit ? limit : undefined)
    .map((mission) => ({
      name: mission.name,
      rootPath: mission.rootPath,
      dateLabel: formatDate(mission.dateValue),
    }));
};
