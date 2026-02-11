---
name: spec-pr-update
description: Обновлять `spec/spec.md` через PR по процессу репозитория (добавление нового `R-XXX`, изменение текста, деприкация). Используй, когда нужно "узаконить" поведение в spec перед/вместе с реализацией.
---

# Spec-Only PR Update

Источники правил: `docs/process/PROCESS.md`, `spec/spec.md`.

## Inputs
- Номер `spec(...)` issue (предпочтительно) или контекст изменения.

## Procedure
1. Работай только через PR (не меняй spec напрямую в основной ветке).
2. Для нового requirement: добавь новый `R-XXX` в конец `spec/spec.md` по правилам процесса; для изменения: правь текст под тем же ID; для удаления: деприцируй по процессу.
3. Открой PR с трассировкой `Fixes #...` и указанием `Spec: R-XXX` в описании по процессу.

## Output Contract
Верни:
- `Result`: `success` или `fail`.
- `Artifacts`: `pr_url`, `spec_id` (если применимо).
- `Next`: например `issue-create-feature-task` или `dev-implement-change`.

