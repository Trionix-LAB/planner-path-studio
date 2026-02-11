---
name: issue-create-spec-change
description: Создавать issue на изменение требований (kind=spec) по процессу репозитория. Используй, когда пользователь просит "изменить поведение", "добавить требование", "уточнить spec", "неясны требования".
---

# Create Spec Change Issue

Источник правил: `docs/process/PROCESS.md`.

## Inputs
- Описание желаемого поведения (что должна делать система).
- Acceptance (2-6 чекбоксов) или список критериев.
- Опционально: ссылка на текущий `R-XXX` (если это изменение существующего требования).

## Procedure
1. Определи `area` и краткий `summary`.
2. Создай issue с `kind=spec` по процессу.
3. Если acceptance сформулирован и нет открытых вопросов, доведи issue до DoR и поставь статус `todo` по процессу; иначе оставь backlog и собери недостающие детали через Q&A.
4. Не обсуждай реализацию: только контракт поведения.

## Output Contract
Верни:
- `Result`: `success` или `fail`.
- `Artifacts`: `issue_number`, `title`.
- `Next`: например `spec-pr-update` (если готово менять `spec/spec.md`), или `issue-promote-to-todo`.

