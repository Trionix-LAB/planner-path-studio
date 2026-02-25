# A-0067: Performance & architecture audit

Связано: Issue #67 (`chore(arch): performance & architecture audit`).

## Scope

Цели и ограничения определяются документами-источниками истины:
- Процесс: `docs/process/PROCESS.md`
- Требования и perf ориентиры: `spec/spec.md` (в частности R-040)
- UX/flows: `docs/screens.md`
- Формат миссии на диске: `docs/mission-format.md`

Этот документ не меняет поведение системы и не подменяет требования; он фиксирует текущее состояние архитектуры и выявленные риски.

## Current architecture (high level)

**UI shell / routing**
- Точка входа: `src/main.tsx`
- Роутинг: `src/App.tsx` + `src/platform/router.tsx` (Electron → `HashRouter`, Web → `BrowserRouter`)

**Pages (routes)**
- `src/pages/StartScreen.tsx`
- `src/pages/MapWorkspace.tsx`
- `src/pages/EquipmentScreen.tsx`

**Domain / features**
- Mission lifecycle + persistence + telemetry + recording: `src/features/mission/*`
- Map object types: `src/features/map/model/types.ts`
- Export: `src/features/export/*`
- Settings: `src/features/settings/*`
- Devices/protocols/schemas: `src/features/devices/*`

**Platform boundary**
- Contract: `src/platform/contracts.ts`
- Runtime selection: `src/platform/index.ts`, `src/platform/runtime.ts`
- Web impl (localStorage-backed fileStore/settings): `src/platform/web/platform.ts`
- Electron impl (window.electronAPI IPC bridge): `src/platform/electron/platform.ts`
- Electron main/preload (FS + UDP bridges): `electron/main.cjs`, `electron/preload.cjs`

**Map rendering**
- Leaflet/React-Leaflet canvas: `src/components/map/MapCanvas.tsx`
- Grid overlay: `src/components/map/GridLayer.tsx`

## Key runtime flows (observed)

### Mission load / draft restore
В `src/pages/MapWorkspace.tsx` инициализация:
- Загружает app settings через `platform.settings`.
- В зависимости от path/query:
  - открывает диалоги create/open,
  - или открывает миссию из `?mission=...`,
  - или грузит draft-сессию.

### Autosave
Текущий autosave запускается эффектом в `src/pages/MapWorkspace.tsx` и (через `MissionRepository`) пишет:
- `mission.json`
- `routes.geojson`, `markers.geojson`
- CSV треков

См. требования autosave: `spec/spec.md` (R-036).

### Telemetry runtime
- В web runtime используется simulation provider.
- В Electron runtime используется IPC/UDP bridge (см. `docs/electron-telemetry-provider.md`, `electron/*`, `src/features/mission/model/telemetry.ts`).

### Track recording
- Редьюсер: `src/features/mission/model/trackRecorder.ts`
- Важные семантики: `segment_id` инкрементируется на `connectionRestored` для активной записи.

## Performance targets (source of truth)

См. `spec/spec.md`:
- R-040: трек до 200 000 точек без критичных лагов UI (возможны downsample/simplification).
- R-040: объекты планирования до ~1 000 вершин суммарно без заметной деградации.

## Risk register (findings)

Ниже — наиболее “нагруженные” риски, которые мешают достижению R-040 и усложняют расширение/поддержку.

### P0 — Track rendering: 200k points vs current polyline approach
**Evidence**
- Трек рисуется как набор `<Polyline>` из `trackSegments` в `src/components/map/MapCanvas.tsx`.

**Risk**
- При большом количестве точек SVG polyline и частые обновления слоёв приведут к лагам.

**Mitigation (follow-up)**
- Canvas renderer (`preferCanvas`) + zoom-based simplification/decimation для трека.
- Ограничить частоту обновления отрисовки трека (throttle) и отделить “raw points” от “view model”.

### P0 — Track recording: O(n) append in React state
**Evidence**
- Добавление точки создаёт новый массив через spread в `src/features/mission/model/trackRecorder.ts`.

**Risk**
- O(n) копирование на каждую точку → рост CPU/GC, деградация по мере роста трека.

**Mitigation (follow-up)**
- Хранить точки в структуре данных с амортизированным O(1) append (chunked buffers) и публиковать в UI агрегированное/упрощённое представление.

### P0 — Autosave rewrites full track CSV
**Evidence**
- `MissionRepository.saveMission` сериализует CSV для каждого трека на сохранении.
- Autosave триггерится при изменениях state в `src/pages/MapWorkspace.tsx`.

**Risk**
- Перезапись больших CSV с коротким debounce → фризы UI и IO-узкое место; риск несоответствия R-040.

**Mitigation (follow-up)**
- Разделить persistence: миссия/GeoJSON autosave отдельно, а трек — отдельный writer (append/flush on interval, pause/stop).

### P1 — `MapWorkspace` complexity / change risk
**Evidence**
- `src/pages/MapWorkspace.tsx` содержит много независимых состояний/эффектов и платформенных ветвлений.

**Risk**
- Рост стоимости изменений, сложнее тестировать и локализовать perf регрессии.

**Mitigation (follow-up)**
- Декомпозиция в хуки/модули по ответственностям (mission lifecycle, autosave, telemetry runtime, UI state).

### P1 — Web fileStore via localStorage does not scale for large missions
**Evidence**
- `src/platform/web/platform.ts` хранит “файлы” в `localStorage`.

**Risk**
- Ограничения по объёму и синхронные операции; большие треки/миссии физически не поместятся.

**Mitigation (follow-up)**
- Явно ограничить web demo (если это допустимо по продукту) или заменить механизм хранения (например, IndexedDB) для web runtime.

## Measurement plan (proposal)

Минимальный набор сценариев для профилирования (без изменения поведения сейчас):
- “Track stress”: 200k точек в одном/нескольких треках, pan/zoom, toggle layers.
- “Recording stress”: поступление фиксов (например 1–10 Hz) + запись + autosave.
- “Mission IO”: открыть/сохранить миссию с большим треком.

Метрики:
- FPS / input latency (пан/зум).
- Время autosave и частота writes.
- CPU/heap профилирование в DevTools.

## Follow-up work items (to be captured as issues)

Предлагаемые направления для отдельных задач:
1) Incremental track persistence (не переписывать CSV на autosave).
2) Track rendering optimization (canvas + simplification + throttling).
3) Refactor `MapWorkspace` (выделить boundaries и уменьшить coupling).
4) Web persistence scalability (localStorage → более подходящее хранилище или явный scope).

## Non-goals

- Реализация оптимизаций в этом PR.
- Изменение требований в `spec/spec.md`.
