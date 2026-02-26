import { describe, expect, it } from 'vitest';
import { createDefaultDiver, normalizeDivers } from '@/features/mission';

describe('divers model (R-017 — beacon id)', () => {
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

  it('accepts arbitrary marker size and clamps only by common range', () => {
    const [diverWithCustomSize] = normalizeDivers([
      {
        uid: 'u-1',
        id: 'agent-1',
        beacon_id: '1',
        title: 'Agent 1',
        marker_color: '#0ea5e9',
        marker_size_px: 27,
        track_color: '#a855f7',
        navigation_source: 'zima2r',
      },
    ]);
    const [diverAboveMax] = normalizeDivers([
      {
        uid: 'u-2',
        id: 'agent-2',
        beacon_id: '2',
        title: 'Agent 2',
        marker_color: '#0ea5e9',
        marker_size_px: 999,
        track_color: '#a855f7',
        navigation_source: 'zima2r',
      },
    ]);

    expect(diverWithCustomSize.marker_size_px).toBe(27);
    expect(diverAboveMax.marker_size_px).toBe(256);
  });
});
