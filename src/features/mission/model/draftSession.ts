import type { MissionBundle } from './types';

export type DraftLoadMode = 'new' | 'recover' | 'resume';

type DraftSessionLoadDeps = {
  draftExists: () => Promise<boolean>;
  clearDraft: () => Promise<void>;
  createDraft: () => Promise<MissionBundle>;
  openDraft: () => Promise<MissionBundle>;
  onRecoverMissing: () => void;
};

const isDraftMissionMissingError = (error: unknown): boolean => {
  return error instanceof Error && /Mission file not found/i.test(error.message);
};

export const resolveDraftLoadMode = (mode: string | null): DraftLoadMode => {
  if (mode === 'new-draft') return 'new';
  if (mode === 'recover') return 'recover';
  return 'resume';
};

export const loadDraftSession = async (
  mode: DraftLoadMode,
  deps: DraftSessionLoadDeps,
): Promise<MissionBundle> => {
  if (mode === 'new') {
    await deps.clearDraft();
    return deps.createDraft();
  }

  const exists = await deps.draftExists();
  if (mode === 'recover') {
    if (!exists) {
      deps.onRecoverMissing();
      return deps.createDraft();
    }
    try {
      return await deps.openDraft();
    } catch (error) {
      if (!isDraftMissionMissingError(error)) {
        throw error;
      }
      deps.onRecoverMissing();
      return deps.createDraft();
    }
  }

  if (!exists) {
    return deps.createDraft();
  }

  try {
    return await deps.openDraft();
  } catch (error) {
    if (!isDraftMissionMissingError(error)) {
      throw error;
    }
    return deps.createDraft();
  }
};
