import { useCallback, useEffect, useState } from 'react';
import { loadRecentMissions, RECENT_MISSIONS_LIMIT, type RecentMissionItem } from '@/features/mission/model/recentMissions';
import { platform } from '@/platform';

type UseRecentMissionsOptions = {
  limit?: number;
  missionsDir?: string;
};

export const useRecentMissions = (options?: number | UseRecentMissionsOptions) => {
  const parsed =
    typeof options === 'number'
      ? { limit: options, missionsDir: undefined }
      : { limit: options?.limit ?? RECENT_MISSIONS_LIMIT, missionsDir: options?.missionsDir };
  const { limit, missionsDir } = parsed;
  const [missions, setMissions] = useState<RecentMissionItem[]>([]);
  const reload = useCallback(async () => {
    try {
      const recent = await loadRecentMissions(platform, { limit, missionsDir });
      setMissions(recent);
    } catch {
      setMissions([]);
    }
  }, [limit, missionsDir]);

  useEffect(() => {
    let isMounted = true;

    const run = async () => {
      try {
        const recent = await loadRecentMissions(platform, { limit, missionsDir });
        if (!isMounted) return;
        setMissions(recent);
      } catch {
        if (!isMounted) return;
        setMissions([]);
      }
    };

    void run();

    return () => {
      isMounted = false;
    };
  }, [limit, missionsDir]);

  return { missions, reload };
};
