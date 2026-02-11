---
name: issue-create-idea
description: Создавать backlog-issue для идеи по инженерному процессу репозитория. Используй, когда пользователь просит "зафиксируй идею", "добавь идею в backlog", "создай idea issue".
---

# Create Idea Issue

Источник правил: `docs/process/PROCESS.md`.

## Inputs
- Текст идеи (1-5 предложений).
- Опционально: `area`.
- Опционально: заметки и открытые вопросы.

## Procedure
1. Определи `area` (если неясно, задай 1 вопрос).
2. Сформируй краткий `summary` (без деталей реализации).
3. Создай GitHub issue с `kind=idea` и статусом backlog строго по процессу (см. `docs/process/PROCESS.md`).
4. В body зафиксируй минимум: Goal, Notes, Open questions (без попыток превратить backlog в контракт).

## Output Contract
Верни:
- `Result`: `success` или `fail` (+ причина).
- `Artifacts`: `issue_number` и краткий `title`.
- `Next`: 1-3 следующих шага (например `issue-promote-to-todo`, `issue-create-spec-change`).

