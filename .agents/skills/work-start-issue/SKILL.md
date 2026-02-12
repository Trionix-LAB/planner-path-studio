---
name: work-start-issue
description: Брать issue в работу по процессу: перевод в `status:in-progress`, назначение исполнителя, создание/checkout ветки от issue. Используй, когда пользователь просит "начни работу по #123", "возьми задачу", "создай ветку от issue".
---

# Start Work On Issue

Источник правил: `docs/process/PROCESS.md`.

## Inputs
- Номер issue.

## Procedure
1. Убедись, что issue в `status:todo` и соответствует DoR по процессу.
2. Переведи issue в `status:in-progress` и назначь исполнителя по процессу.
3. Создай и checkout ветку от issue (предпочтительно через `gh issue develop ...` по процессу).
4. Создай в папке spec/tasks/ файл `task-<issue_number>.md` с задачей, полученной из issue (description и комментарии, с ссылкой на issue и spec, если есть).

## Output Contract
Верни:
- `Result`: `success` или `fail`.
- `Artifacts`: `issue_number`, `branch_name`.
- `Next`: например `spec-ensure-requirement`, `dev-implement-change`.

