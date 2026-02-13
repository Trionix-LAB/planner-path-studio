# Реализация требований spec/spec.md — аудит

Краткий отчёт о соответствии реализации требованиям спецификации (R-001…R-046).

## Статус по требованиям (сводная таблица)

| R-XXX | Статус | Краткая ссылка / заметки |
|---|---:|---|
| R-001 | OK | Map: `src/components/map/MapCanvas.tsx` |
| R-002 | PARTIAL | Scale/Grid: `ScaleBar`, `scaleUtils` (OK); `GridLayer` — приближение meters→degrees, не UTM |
| R-003 | OK | Agents + base station rendering: `MapCanvas.tsx` |
| R-004 | OK | Telemetry + connection UI: `features/mission/model/telemetry.ts` + RightPanel |
| R-005 | OK | Track rendering + segments: `adapters.ts`, `MapCanvas.tsx` |
| R-006 | OK | HUD: `RightPanel.tsx` |
| R-007 | OK | Follow / center: `MapWorkspace.tsx` + settings |
| R-008 | OK | Cursor coordinates: `StatusBar.tsx` + `MapCanvas.tsx` |
| R-009 | OK | Route drawing/editing: `MapCanvas.tsx`, `MapObjectProperties.tsx` |
| R-010 | OK | Zone + lane generation: `laneGeneration.ts`, `zoneLanes.ts` |
| R-011 | OK | Markers + tooltip: `MapCanvas.tsx` |
| R-012 | OK* | Layer manager: `LeftPanel.tsx` (agent layer non-toggleable) |
| R-013 | PARTIAL | Draft mode exists + autosave; converting draft → mission does NOT transfer draft contents |
| R-014 | PARTIAL | Recent missions hook & tests exist; missionsDir selection not globally synced across dialogs |
| R-015 | PARTIAL | Per-agent recording implemented; but global "resume" resumes all agents (behavioral mismatch) |
| R-016 | OK | Draft/new vs recover behavior + tests: `draftSession.ts` + StartScreen |
| R-017 | OK | Beacon ID behaviour + tests: `divers.ts`, SettingsDialog |
| R-018 | OK | Create/save mission flow + CreateMissionDialog + repository |
| R-019 | OK | Open mission dialog + repository |
| R-020 | PARTIAL | Mission folder/format OK; draft→mission conversion not performed automatically |
| R-021 | OK | Exporters GPX/KML/CSV: `features/export` |
| R-022 | OK | Multiple tracks / agent_id: `trackRecorder.ts` |
| R-023 | PARTIAL | Per-agent recording model OK; UI action semantics (global resume) differs |
| R-024 | OK | Timeout → visual gap, segment_id handling: telemetry + recorder |
| R-025 | OK | Tracks stored as CSV: `repository.ts` (format in docs) |
| R-026 | OK | Draft autosave implemented in `MapWorkspace.tsx` |
| R-027 | OK | Object CRUD + Delete key handling: `MapCanvas.tsx` |
| R-028 | OK | Route length & per-segment display modes implemented |
| R-029 | OK | Zone + lanes + regen on change implemented |
| R-030 | OK | Marker attributes & editing implemented |
| R-031 | OK | Agent layer non-toggleable; base_station default ON: settings/tests |
| R-032 | OK | Layer state persisted in mission/draft |
| R-033 | OK | Mission format matches `docs/mission-format.md` |
| R-034 | OK | `schema_version` supported in mission.json |
| R-035 | OK | GeoJSON for objects, CSV for tracks implemented |
| R-036 | OK | Autosave with debounce in mission & draft |
| R-037 | OK | mission.lock support in repository |
| R-038 | OK | Import out-of-scope (no implementation) |
| R-039 | OK | OSM online tiles accepted for MVP |
| R-040 | UNKNOWN | Performance simplification not found (no explicit geometry simplification) |
| R-041 | OK | Settings dialog + persistence implemented |
| R-042 | OK | Scale/grid/segment-lengths settings supported |
| R-043 | OK | Coordinate precision setting present (default 6) |
| R-044 | PARTIAL | Style controls exist; marker icon presets / label-visibility settings not evident |
| R-045 | OK | Global defaults + mission overrides implemented |
| R-046 | OK | follow_diver and default layer visibility respected |

---

## Главные замечания / расхождения (важно)

- Преобразование черновика в миссию (R-013 / R-020): текущая CreateMission не переносит содержимое `draft/current` в новую папку миссии — риск потери работы пользователя.
- Recent missions (R-014): выбор папки миссий не синхронизирован между StartScreen и OpenMissionDialog/CreateMissionDialog (UX inconsistency).
- Per-agent recording semantics (R-015 / R-023): есть глобальная кнопка "resume" которая включает запись для всех агентов — отличается от формулировки "включать запись явно для нужных агентов".
- Grid accuracy (R-002): метрическая сетка рисуется приближённо (degrees approximation), не через локальную UTM вычисление (рекомендовано в spec).

## Рекомендации (предложения по исправлению)

1. Implement draft → mission conversion: при создании миссии из черновика переносить объекты/треки/ui → mark draft as converted. (High)
2. Sync missionsDir across StartScreen/OpenMissionDialog/CreateMissionDialog (Medium).
3. Adjust global Resume behavior (or split UI) so Resume doesn't implicitly enable recording for all agents; prefer explicit per-agent start (Medium).
4. (Optional) Improve GridLayer to use local UTM conversion for higher accuracy (Low → Opt).

---

Если нужно — могу:
- Создать issue(ы) для трёх ключевых расхождений и предложить PR-план; или
- Внести небольшой PR, фиксирующий синхронизацию `missionsDir` или изменение поведения CreateMission для конвертации draft.

Файл сохранён в `spec/implementation-audit.md`.
