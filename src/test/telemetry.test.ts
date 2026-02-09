import { createNoopTelemetryProvider } from '@/features/mission';

describe('noop telemetry provider', () => {
  it('does not emit fixes and keeps connection state stable', () => {
    vi.useFakeTimers();
    const provider = createNoopTelemetryProvider();
    const onFix = vi.fn();
    const onConnectionState = vi.fn();

    const unsubscribeFix = provider.onFix(onFix);
    const unsubscribeConnection = provider.onConnectionState(onConnectionState);

    provider.start();
    provider.setEnabled(false);
    provider.setSimulateConnectionError(true);
    vi.advanceTimersByTime(30_000);
    provider.stop();

    expect(onFix).not.toHaveBeenCalled();
    expect(onConnectionState).toHaveBeenCalledTimes(1);
    expect(onConnectionState).toHaveBeenLastCalledWith('ok');

    unsubscribeFix();
    unsubscribeConnection();
    vi.useRealTimers();
  });
});
