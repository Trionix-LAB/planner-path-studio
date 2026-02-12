import type { TelemetryConnectionState } from './telemetry';

export type RealtimeUiConnectionState = 'off' | 'waiting' | 'ok' | 'timeout' | 'error';

type RealtimeVisibilityInput = {
  isSourceEnabled: boolean;
  connectionStatus: TelemetryConnectionState;
  hasTelemetry: boolean;
  hasTelemetryHistory: boolean;
};

export type RealtimeVisibilityState = {
  connectionState: RealtimeUiConnectionState;
  showTelemetryObjects: boolean;
  showNoDataWarning: boolean;
};

export const computeRealtimeVisibilityState = (
  input: RealtimeVisibilityInput,
): RealtimeVisibilityState => {
  if (!input.isSourceEnabled) {
    return {
      connectionState: 'off',
      showTelemetryObjects: false,
      showNoDataWarning: false,
    };
  }

  if (input.connectionStatus === 'ok' && input.hasTelemetry) {
    return {
      connectionState: 'ok',
      showTelemetryObjects: true,
      showNoDataWarning: false,
    };
  }

  if (input.connectionStatus === 'error') {
    return {
      connectionState: input.hasTelemetryHistory ? 'error' : 'waiting',
      showTelemetryObjects: input.hasTelemetryHistory,
      showNoDataWarning: input.hasTelemetryHistory,
    };
  }

  if (input.connectionStatus === 'timeout') {
    if (!input.hasTelemetryHistory) {
      return {
        connectionState: 'waiting',
        showTelemetryObjects: false,
        showNoDataWarning: false,
      };
    }
    return {
      connectionState: 'timeout',
      showTelemetryObjects: true,
      showNoDataWarning: true,
    };
  }

  return {
    connectionState: 'waiting',
    showTelemetryObjects: false,
    showNoDataWarning: false,
  };
};
