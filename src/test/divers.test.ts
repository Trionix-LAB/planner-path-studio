import { describe, expect, it } from 'vitest';
import { createDefaultDiver, normalizeDivers } from '@/features/mission';

describe('divers model', () => {
  it('creates default diver with separate beacon id', () => {
    const diver = createDefaultDiver(0);
    expect(diver.id).toBe('1');
    expect(diver.beacon_id).toBe('0');
  });

  it('increments default beacon ids from zero', () => {
    const diver = createDefaultDiver(1);
    expect(diver.id).toBe('2');
    expect(diver.beacon_id).toBe('1');
  });

  it('keeps explicit beacon id and agent id independent', () => {
    const [diver] = normalizeDivers([
      {
        uid: 'u-1',
        id: 'agent-7',
        beacon_id: '3',
        title: 'Agent 7',
        marker_color: '#0ea5e9',
        marker_size_px: 32,
        track_color: '#a855f7',
        navigation_source: 'zima2r',
      },
    ]);

    expect(diver.id).toBe('agent-7');
    expect(diver.beacon_id).toBe('3');
  });

  it('uses legacy numeric id as beacon id when beacon_id is missing', () => {
    const [diver] = normalizeDivers([
      {
        uid: 'u-1',
        id: '2',
        title: 'Legacy',
        marker_color: '#0ea5e9',
        marker_size_px: 32,
        track_color: '#a855f7',
        navigation_source: 'zima2r',
      },
    ]);

    expect(diver.id).toBe('2');
    expect(diver.beacon_id).toBe('2');
  });
});
