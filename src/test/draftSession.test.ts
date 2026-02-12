import { describe, expect, it, vi } from 'vitest';
import { loadDraftSession, resolveDraftLoadMode } from '@/features/mission/model/draftSession';
import type { MissionBundle } from '@/features/mission';

const asBundle = (id: string): MissionBundle => ({ id } as unknown as MissionBundle);

describe('draft session mode resolver', () => {
  it('maps query mode to draft load mode', () => {
    expect(resolveDraftLoadMode('new-draft')).toBe('new');
    expect(resolveDraftLoadMode('recover')).toBe('recover');
    expect(resolveDraftLoadMode('draft')).toBe('resume');
    expect(resolveDraftLoadMode(null)).toBe('resume');
  });
});

describe('loadDraftSession', () => {
  it('new mode clears old autosave and creates empty draft', async () => {
    const clearDraft = vi.fn().mockResolvedValue(undefined);
    const createDraft = vi.fn().mockResolvedValue(asBundle('created'));
    const openDraft = vi.fn().mockResolvedValue(asBundle('opened'));
    const draftExists = vi.fn().mockResolvedValue(true);
    const onRecoverMissing = vi.fn();

    const result = await loadDraftSession('new', {
      clearDraft,
      createDraft,
      openDraft,
      draftExists,
      onRecoverMissing,
    });

    expect(result).toEqual(asBundle('created'));
    expect(clearDraft).toHaveBeenCalledTimes(1);
    expect(createDraft).toHaveBeenCalledTimes(1);
    expect(openDraft).not.toHaveBeenCalled();
    expect(draftExists).not.toHaveBeenCalled();
    expect(onRecoverMissing).not.toHaveBeenCalled();
  });

  it('recover mode opens existing draft', async () => {
    const openDraft = vi.fn().mockResolvedValue(asBundle('opened'));
    const result = await loadDraftSession('recover', {
      draftExists: vi.fn().mockResolvedValue(true),
      clearDraft: vi.fn().mockResolvedValue(undefined),
      createDraft: vi.fn().mockResolvedValue(asBundle('created')),
      openDraft,
      onRecoverMissing: vi.fn(),
    });

    expect(result).toEqual(asBundle('opened'));
    expect(openDraft).toHaveBeenCalledTimes(1);
  });

  it('recover mode creates new draft when autosave is missing', async () => {
    const onRecoverMissing = vi.fn();
    const createDraft = vi.fn().mockResolvedValue(asBundle('created'));
    const result = await loadDraftSession('recover', {
      draftExists: vi.fn().mockResolvedValue(false),
      clearDraft: vi.fn().mockResolvedValue(undefined),
      createDraft,
      openDraft: vi.fn().mockResolvedValue(asBundle('opened')),
      onRecoverMissing,
    });

    expect(result).toEqual(asBundle('created'));
    expect(onRecoverMissing).toHaveBeenCalledTimes(1);
    expect(createDraft).toHaveBeenCalledTimes(1);
  });

  it('resume mode opens existing draft and creates one when absent', async () => {
    const openDraft = vi.fn().mockResolvedValue(asBundle('opened'));
    const createDraft = vi.fn().mockResolvedValue(asBundle('created'));

    const existing = await loadDraftSession('resume', {
      draftExists: vi.fn().mockResolvedValue(true),
      clearDraft: vi.fn().mockResolvedValue(undefined),
      createDraft,
      openDraft,
      onRecoverMissing: vi.fn(),
    });
    expect(existing).toEqual(asBundle('opened'));

    const missing = await loadDraftSession('resume', {
      draftExists: vi.fn().mockResolvedValue(false),
      clearDraft: vi.fn().mockResolvedValue(undefined),
      createDraft,
      openDraft,
      onRecoverMissing: vi.fn(),
    });
    expect(missing).toEqual(asBundle('created'));
  });
});
