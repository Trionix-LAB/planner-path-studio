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

## Форматирование тела issue — правила (важно)
- Используй корректный Markdown: реальные переносы строк и абзацы — не вставляй литералы `\n`.
- Для имён файлов, компонентов и меток используй `inline code` (`` `StartScreen`, `fileStore`, `platform`, `spec.md`, `status:backlog` ``).
- Для блоков кода используй fenced code blocks (```), не вставляй код в одну строку с `\n`.
- При создании/редактировании через CLI, если тело содержит backticks или специальные символы, передавай его через файл: `gh issue create --body-file <file>` — это предотвратит интерпретацию шеллом и потерю форматирования. После отправки, удали временный файл с телом issue.
- Списки и заголовки должны иметь пустую строку выше и ниже для корректного рендеринга в GitHub.

Пример корректного тела issue:

```md
Goal:
- Сделать X

Notes:
- Использовать `fileStore` и `platform` API.

Acceptance:
- [ ] X реализовано
```

## Output Contract
Верни:
- `Result`: `success` или `fail` (+ причина).
- `Artifacts`: `issue_number` и краткий `title`.
- `Next`: 1-3 следующих шага (например `issue-promote-to-todo`, `issue-create-spec-change`).

