import { describe, expect, it } from 'vitest';
import { computeRealtimeVisibilityState } from '@/features/mission';

describe('computeRealtimeVisibilityState', () => {
  it('returns off state when source is disabled', () => {
    expect(
      computeRealtimeVisibilityState({
        isSourceEnabled: false,
        connectionStatus: 'timeout',
        hasTelemetry: false,
        hasTelemetryHistory: false,
      }),
    ).toEqual({
      connectionState: 'off',
      showTelemetryObjects: false,
      showNoDataWarning: false,
    });
  });

  it('returns waiting state before first telemetry fix', () => {
    expect(
      computeRealtimeVisibilityState({
        isSourceEnabled: true,
        connectionStatus: 'timeout',
        hasTelemetry: false,
        hasTelemetryHistory: false,
      }),
    ).toEqual({
      connectionState: 'waiting',
      showTelemetryObjects: false,
      showNoDataWarning: false,
    });
  });

  it('keeps objects and shows warning on timeout after data', () => {
    expect(
      computeRealtimeVisibilityState({
        isSourceEnabled: true,
        connectionStatus: 'timeout',
        hasTelemetry: false,
        hasTelemetryHistory: true,
      }),
    ).toEqual({
      connectionState: 'timeout',
      showTelemetryObjects: true,
      showNoDataWarning: true,
    });
  });
});
