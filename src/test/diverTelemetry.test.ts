import { describe, expect, it } from 'vitest';
import type { DiverUiConfig } from '@/features/mission';
import {
  buildVisibleDiverMarkers,
  normalizeDiverTelemetryById,
  resolveFollowDiverPosition,
  resolvePrimaryDiverPosition,
  type DiverTelemetryPosition,
} from '@/components/map/diverTelemetry';

const createDiver = (overrides?: Partial<DiverUiConfig>): DiverUiConfig => ({
  uid: overrides?.uid ?? 'agent-1',
  id: overrides?.id ?? '1',
  beacon_id: overrides?.beacon_id ?? '1',
  title: overrides?.title ?? 'Diver 1',
  marker_color: overrides?.marker_color ?? '#22c55e',
  marker_size_px: overrides?.marker_size_px ?? 24,
  track_color: overrides?.track_color ?? '#22c55e',
  navigation_source: overrides?.navigation_source ?? 'zima2r',
});

describe('diver telemetry mapping', () => {
  it('normalizes telemetry keys by trimming ids', () => {
    const normalized = normalizeDiverTelemetryById({
      ' 1 ': { lat: 59.9, lon: 30.3 },
      '': { lat: 0, lon: 0 },
      '  ': { lat: 0, lon: 0 },
    });

    expect(normalized).toEqual({
      '1': { lat: 59.9, lon: 30.3 },
    });
  });

  it('builds markers only for divers that have their own telemetry', () => {
    const divers = [createDiver({ uid: 'agent-1', id: '1' }), createDiver({ uid: 'agent-2', id: '2' })];
    const telemetryById: Record<string, DiverTelemetryPosition> = {
      '1': { lat: 59.9, lon: 30.3, course: 45 },
    };

    const markers = buildVisibleDiverMarkers(divers, telemetryById);

    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({
      uid: 'agent-1',
      position: [59.9, 30.3],
      course: 45,
    });
  });

  it('does not resolve follow position when pinned diver has no telemetry', () => {
    const divers = [createDiver({ uid: 'agent-1', id: '1' }), createDiver({ uid: 'agent-2', id: '2' })];
    const telemetryById: Record<string, DiverTelemetryPosition> = {
      '1': { lat: 59.9, lon: 30.3, course: 45 },
    };

    const followPosition = resolveFollowDiverPosition(divers, telemetryById, 'agent-2');
    expect(followPosition).toBeNull();
  });

  it('resolves follow position for pinned diver telemetry', () => {
    const divers = [createDiver({ uid: 'agent-1', id: '1' }), createDiver({ uid: 'agent-2', id: '2' })];
    const telemetryById: Record<string, DiverTelemetryPosition> = {
      '1': { lat: 59.9, lon: 30.3, course: 45 },
      '2': { lat: 59.91, lon: 30.31, course: 180 },
    };

    const followPosition = resolveFollowDiverPosition(divers, telemetryById, 'agent-2');
    expect(followPosition).toEqual([59.91, 30.31]);
  });

  it('resolves primary diver position only from primary diver telemetry', () => {
    const divers = [createDiver({ uid: 'agent-1', id: '1' }), createDiver({ uid: 'agent-2', id: '2' })];
    const telemetryById: Record<string, DiverTelemetryPosition> = {
      '2': { lat: 59.91, lon: 30.31, course: 180 },
    };

    const primaryPosition = resolvePrimaryDiverPosition(divers, telemetryById);
    expect(primaryPosition).toBeNull();
  });
});
