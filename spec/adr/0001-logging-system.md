# ADR-0001: Logging system for Electron + web runtimes

Context:
- Issue #45 proposes adding a logging system to improve debugging and monitoring.
- Current code uses ad‑hoc `console.log` calls in both Electron main and renderer.
- There are no existing ADRs; repository follows a simple numeric scheme under `spec/adr`.
- Application runs in two environments: web (browser) and Electron (main + renderer via preload), with platform abstraction layers in `src/platform`.
- Logs should support multiple levels (debug/info/warn/error) and ideally be unified across processes.

Decision:
1. Adopt `electron-log` as the core logging library in the Electron main process.
   - Configure it to write to a file under `app.getPath('userData')/logs` with size-based rotation and mirror outputs to `console` at appropriate levels.
2. Provide a small wrapper module (`src/lib/logger.ts`) exposing the standard methods (`debug`, `info`, `warn`, `error`) and a scoped child API.
   - In Electron main this wrapper will delegate directly to `electron-log`.
   - In renderer, it will detect the presence of `window.electronAPI.log` (added by preload) and forward calls via IPC; if absent (web runtime) it will fallback to `console`.
3. Extend the preload bridge (`electron/preload.cjs`) with a `log` namespace sending messages to main using `ipcRenderer.send`.
   - Messages will be validated (level string, message length capped) to avoid abuse.
4. Introduce an IPC channel `planner:log` handled in `electron/main.cjs`, which writes to the same `electron-log` instance.
5. Keep the web build unchanged; it will continue using `console` with minimal wrapper overhead.
6. Do not implement any remote log shipping in this ADR; storing logs locally (files + console) satisfies MVP. A separate issue may address remote aggregation.

Consequences:
- Developers gain a consistent logging API usable from any code path without worrying about environment.
- Electron main process logs to a persistent, rotated file; renderer logs also bleed into that file via IPC, giving a single timeline for debugging.
- Web-only sessions remain lightweight and rely on browser console.
- The system is extensible: later we can wire additional transports (e.g. network, Sentry) by enhancing `logger.ts` and main handlers.
- Initial implementation effort focuses on wrapper, IPC plumbing, and minimal config; future changes will follow from this ADR.

