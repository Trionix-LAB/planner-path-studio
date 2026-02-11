---
name: issue-promote-to-todo
description: Доводить backlog-issue до Definition of Ready и переводить в `status:todo` строго по `docs/process/PROCESS.md`. Используй, когда пользователь просит "оформи в todo", "подготовь задачу к работе", "сделай контракт".
---

# Promote Issue To TODO (DoR)

Источник правил: `docs/process/PROCESS.md`.

## Inputs
- Номер issue.

## Procedure
1. Открой issue и проверь текущий статус.
2. Дополни body до требований DoR по процессу (Spec-ссылка или новый requirement, Acceptance, отсутствие открытых вопросов, атомарность).
3. Переведи статус в `todo` по процессу, сохраняя ровно один `status:*` label.

## Output Contract
Верни:
- `Result`: `success` или `fail` (+ что мешает DoR).
- `Artifacts`: `issue_number`, `updated_fields` (коротко).
- `Next`: например `work-start-issue` или `issue-create-spec-change`.

