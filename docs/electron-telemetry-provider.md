# Electron telemetry provider: implementation guide

## Context (MVP, February 9, 2026)
- Web runtime uses simulation telemetry (`createSimulationTelemetryProvider`).
- Electron runtime uses `createNoopTelemetryProvider` and does not show simulation controls in the toolbar.
- Runtime selection is done in `src/pages/MapWorkspace.tsx` via `platform.runtime.isElectron`.

## Current contract
- Provider interface: `TelemetryProvider` in `src/features/mission/model/telemetry.ts`.
- Required methods:
  - `start`, `stop`
  - `setEnabled`, `setSimulateConnectionError`
  - `onFix(listener) => unsubscribe`
  - `onConnectionState(listener) => unsubscribe`
- Connection states: `ok | timeout | error`.

## Recommended structure for a real Electron provider
1. Add a factory in `src/features/mission/model/telemetry.ts`:
   - `createElectronTelemetryProvider(options?): TelemetryProvider`.
2. Keep transport concerns out of React:
   - IPC / socket / serial parsing stays inside provider.
   - `MapWorkspace` only subscribes to provider callbacks.
3. Emit domain-ready data from provider:
   - `TelemetryFix` should already contain normalized numeric values and `received_at` (ms timestamp).
4. Manage lifecycle explicitly:
   - `start` opens stream and timers.
   - `stop` closes stream, clears timers, detaches listeners.
5. Preserve connection semantics used by recorder:
   - On restore after non-`ok` state emit `ok` so `MapWorkspace` can dispatch `connectionRestored` and increment `segment_id`.

## UI integration rules
- Keep simulation buttons hidden in Electron (`TopToolbar.showSimulationControls = false`).
- Do not add direct filesystem/device calls to UI components.
- Keep platform-specific behavior behind `src/platform/*` and telemetry provider factory selection.

## Testing checklist
- Unit tests in `src/test/telemetry*.test.ts`:
  - `onFix` emission format.
  - state transitions `ok -> timeout/error -> ok`.
  - no duplicate events for same state.
  - `start/stop` idempotency and listener cleanup.
- Recorder integration behavior:
  - when connection restores during active recording, next fix uses incremented `segment_id`.
- Regression check:
  - Web simulation behavior must remain unchanged.

## Migration steps from noop to real provider
1. Implement `createElectronTelemetryProvider`.
2. Switch runtime branch in `MapWorkspace` from noop to the new provider.
3. Keep `createNoopTelemetryProvider` as fallback for dev/offline mode.
4. Run `npm run verify` and smoke test:
   - `npm run dev` for Web simulation.
   - `npm run electron:dev` for Electron live telemetry flow.
