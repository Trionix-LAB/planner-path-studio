import { useCallback, useEffect, useRef, useState } from 'react';
import type { Platform } from '@/platform';

export type PendingMissionDeletion = {
  rootPath: string;
  name: string;
  expiresAt: number;
};

type UseDelayedMissionDeletionOptions = {
  platform: Platform;
  delayMs: number;
  onAfterDelete?: () => Promise<void> | void;
};

type MissionInfo = {
  rootPath: string;
  name: string;
};

type PendingInternal = PendingMissionDeletion & {
  filePaths: string[];
  timerId: number;
};

export const useDelayedMissionDeletion = ({
  platform,
  delayMs,
  onAfterDelete,
}: UseDelayedMissionDeletionOptions) => {
  const [pendingMissions, setPendingMissions] = useState<PendingMissionDeletion[]>([]);
  const pendingRef = useRef<Record<string, PendingInternal>>({});

  const clearPending = useCallback((rootPath: string) => {
    const existing = pendingRef.current[rootPath];
    if (!existing) return;
    window.clearTimeout(existing.timerId);
    delete pendingRef.current[rootPath];
    setPendingMissions((prev) => prev.filter((item) => item.rootPath !== rootPath));
  }, []);

  const commitDelete = useCallback(
    async (rootPath: string) => {
      const entry = pendingRef.current[rootPath];
      if (!entry) return;

      delete pendingRef.current[rootPath];
      setPendingMissions((prev) => prev.filter((item) => item.rootPath !== rootPath));

      await Promise.allSettled(entry.filePaths.map((path) => platform.fileStore.remove(path)));
      await platform.fileStore.remove(rootPath);
      await onAfterDelete?.();
    },
    [onAfterDelete, platform.fileStore],
  );

  const scheduleDelete = useCallback(
    async (mission: MissionInfo) => {
      clearPending(mission.rootPath);
      const filePaths = await platform.fileStore.list(mission.rootPath);
      const expiresAt = Date.now() + delayMs;
      const timerId = window.setTimeout(() => {
        void commitDelete(mission.rootPath);
      }, delayMs);

      pendingRef.current[mission.rootPath] = {
        rootPath: mission.rootPath,
        name: mission.name,
        expiresAt,
        filePaths,
        timerId,
      };
      setPendingMissions((prev) => [
        ...prev.filter((item) => item.rootPath !== mission.rootPath),
        { rootPath: mission.rootPath, name: mission.name, expiresAt },
      ]);
    },
    [clearPending, commitDelete, delayMs, platform.fileStore],
  );

  const undoDelete = useCallback(
    (rootPath: string) => {
      clearPending(rootPath);
    },
    [clearPending],
  );

  useEffect(() => {
    return () => {
      Object.values(pendingRef.current).forEach((item) => {
        window.clearTimeout(item.timerId);
      });
      pendingRef.current = {};
    };
  }, []);

  return { pendingMissions, scheduleDelete, undoDelete };
};
