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
2. Проверь `spec/spec.md` на наличие соответствующего требования (R-XXX):
   - если в спецификации нет подходящего пункта — создай новый `R-XXX` в `spec/spec.md` с чётким описанием (кратко: что, где, поведение, критерии приёмки) и добавь ссылку на issue;
   - если пункт есть, но не помечен `R-XXX`, пометь его нужным идентификатором и обнови текст при необходимости;
   - зафиксируй `Spec: R-XXX` в теле PR (обязательное поле для traceability).
3. Переведи issue в `status:in-progress` и назначь исполнителя по процессу.
4. Создай и checkout ветку от issue (предпочтительно через `gh issue develop ...` по процессу).
5. Создай в папке spec/tasks/ файл `task-<issue_number>.md` с задачей, полученной из issue (description и комментарии, с ссылкой на issue и spec, если есть).

## Output Contract
Верни:
- `Result`: `success` или `fail`.
- `Artifacts`: `issue_number`, `branch_name`.
- `Next`: например `spec-ensure-requirement`, `dev-implement-change`.

