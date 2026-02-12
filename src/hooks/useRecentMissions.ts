import { useEffect, useState } from 'react';
import { loadRecentMissions, RECENT_MISSIONS_LIMIT, type RecentMissionItem } from '@/features/mission/model/recentMissions';
import { platform } from '@/platform';

export const useRecentMissions = (limit = RECENT_MISSIONS_LIMIT) => {
  const [missions, setMissions] = useState<RecentMissionItem[]>([]);

  useEffect(() => {
    let isMounted = true;

    const run = async () => {
      try {
        const recent = await loadRecentMissions(platform, { limit });
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
  }, [limit]);

  return { missions };
};
