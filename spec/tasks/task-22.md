# Task — fix(start-screen): replace mocked "Recent missions" with real list (issue #22)

- Issue: https://github.com/Trionix-LAB/planner-path-studio/issues/22
- Status: in_progress (branch: `fix/start-screen-recent-missions-22`)
- Kind: fix
- Area: start-screen

## Summary
Заменить статический мок раздела **"Недавние миссии"** на реальный список, загружаемый из репозитория миссий (`fileStore.list`). UI и диалог открытия миссий должны использовать один и тот же источник данных и отображать согласованное меню последних миссий.

## Description (from issue)
- Убрать жестко закодированный массив в `StartScreen` и показывать реальные последние миссии из репозитория миссий.
- Синхронизировать поведение меню и диалога открытия миссий — оба должны показывать одно и то же реальное меню последних миссий.

## Acceptance criteria
- Стартовый экран больше не содержит жестко закодированного массива — данные загружаются из репозитория миссий.
- Логика/диалог открытия миссий обновлён для использования той же логики/источника данных.
- Список сортируется по времени последнего изменения (mtime).
- Отображается путь и human-readable дата; лимит отображаемых записей — 5 (configurable).
- Добавлены unit-тесты, проверяющие загрузку/сортировку/пустое состояние.
- UI корректно обрабатывает отсутствие доступных миссий и показывает понятный плейсхолдер.

## Implementation notes / recommended approach
- Использовать `fileStore.list` (через `platform` API) для получения списка миссий; при необходимости дополнять метаданные через `/metadata`.
- В компоненте `StartScreen` (и в диалоге открытия миссий) вынести общую функцию/хук, который возвращает последние миссии (сортировка по mtime, лимит 5).
- Ограничить изменение минимальным, покрыть unit-тестами для:
  - корректной загрузки и сортировки
  - пустого состояния
  - ограничения по лимиту
- Места с текущими моками: `src/pages/StartScreen.tsx` и соответствующий диалог (поиск по коду).
- Decision: использовать сортировку по `mtime` как источник порядка отображения.

## Files likely to change
- `src/pages/StartScreen.tsx` ✅
- диалог открытия миссий (по месту реализации) ✅
- unit-tests в `test/` — добавить тесты для загрузки/сортировки/empty state ✅

## Open questions
- Нужно ли сохранять MRU-порядок отдельно (user-scoped) или достаточно сортировки по файловой дате?
- Считать ли limit=5 фиксированным или вынести в config/settings (предпочтительно configurable)?

## Related spec / references
- Spec: (no existing R-XXX referenced in issue — `Spec: NEW`)
- Repo `fileStore` usage: see `src/platform/electron/platform.ts` and `platform` APIs
- Issue: https://github.com/Trionix-LAB/planner-path-studio/issues/22

## Acceptance test checklist (for PR)
- [ ] Start screen shows recent missions from repository (no hardcoded array)
- [ ] Dialog and StartScreen show the same list and behavior
- [ ] List sorted by mtime, limited to 5, shows path + readable date
- [ ] Unit tests added and passing
- [ ] PR links to issue #22 and updates spec if necessary

---

Created for work on issue #22 — implement minimal changes, add tests, open PR from `fix/start-screen-recent-missions-22`.