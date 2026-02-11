---
name: pr-open-from-issue
description: Открывать PR из текущей ветки с обязательной трассировкой на issue и Spec по `docs/process/PROCESS.md`. Используй, когда пользователь просит "открой PR", "создай PR по #123".
---

# Open PR From Issue

Источник правил: `docs/process/PROCESS.md`.

## Inputs
- Номер issue.

## Procedure
1. Убедись, что есть изменения в ветке и они соответствуют Acceptance у issue.
2. Создай PR и оформи описание по процессу: `Fixes #...` и `Spec: R-XXX` (или объяснение для неповеденческих изменений).
3. Проверь, что PR не нарушает инварианты процесса (особенно про обновление spec при изменении поведения).

## Output Contract
Верни:
- `Result`: `success` или `fail`.
- `Artifacts`: `pr_url`.
- `Next`: например `pr-review-prepare`.

