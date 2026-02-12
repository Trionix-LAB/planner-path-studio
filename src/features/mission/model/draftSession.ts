import type { MissionBundle } from './types';

export type DraftLoadMode = 'new' | 'recover' | 'resume';

type DraftSessionLoadDeps = {
  draftExists: () => Promise<boolean>;
  clearDraft: () => Promise<void>;
  createDraft: () => Promise<MissionBundle>;
  openDraft: () => Promise<MissionBundle>;
  onRecoverMissing: () => void;
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
    return deps.openDraft();
  }

  return exists ? deps.openDraft() : deps.createDraft();
};
