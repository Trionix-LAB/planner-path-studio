import { useCallback, useRef } from 'react';
import type { MissionBundle, MissionRepository } from '@/features/mission';

type AutoSaveStatus = 'saved' | 'saving' | 'error';

type UseMissionAutosaveParams = {
  repository: MissionRepository;
  walStageDelayMs: number;
  autosaveDelayMs: number;
  onStatusChange: (status: AutoSaveStatus) => void;
};

export const useMissionAutosave = ({
  repository,
  walStageDelayMs,
  autosaveDelayMs,
  onStatusChange,
}: UseMissionAutosaveParams) => {
  const walStageTimerRef = useRef<number | null>(null);
  const autosaveTimerRef = useRef<number | null>(null);

  const cancelPendingAutosave = useCallback(() => {
    if (autosaveTimerRef.current === null) return;
    window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = null;
  }, []);

  const cancelPendingWalStage = useCallback(() => {
    if (walStageTimerRef.current === null) return;
    window.clearTimeout(walStageTimerRef.current);
    walStageTimerRef.current = null;
  }, []);

  const cancelAllPending = useCallback(() => {
    cancelPendingWalStage();
    cancelPendingAutosave();
  }, [cancelPendingAutosave, cancelPendingWalStage]);

  const scheduleMissionAutosave = useCallback(
    (buildBundle: () => MissionBundle): (() => void) => {
      cancelAllPending();

      walStageTimerRef.current = window.setTimeout(async () => {
        walStageTimerRef.current = null;
        try {
          await repository.stageMission(buildBundle());
        } catch {
          // Keep checkpoint autosave running; status reflects checkpoint result.
        }
      }, walStageDelayMs);

      onStatusChange('saving');
      autosaveTimerRef.current = window.setTimeout(async () => {
        autosaveTimerRef.current = null;
        try {
          await repository.saveMission(buildBundle());
          onStatusChange('saved');
        } catch {
          onStatusChange('error');
        }
      }, autosaveDelayMs);

      return cancelAllPending;
    },
    [autosaveDelayMs, cancelAllPending, onStatusChange, repository, walStageDelayMs],
  );

  return {
    cancelPendingAutosave,
    cancelPendingWalStage,
    cancelAllPending,
    scheduleMissionAutosave,
  };
};
