---
name: triage-route-intent
description: Роутить запрос пользователя в последовательность process-skills (issues/spec/dev/pr) для этого репозитория. Используй, когда пользователь пишет свободной формой: "добавь фичу", "зафиксируй баг", "реализуй #123", "доработай поведение".
---

# Route Intent To Skill Pipeline

Источник правил: `docs/process/PROCESS.md`. Ожидаемые действия: создавать/уточнять артефакты так, чтобы сохранялась трассируемость `spec -> issue -> PR -> code`.

## Inputs
- Сообщение пользователя (рус/англ).
- Опционально: номера issue/PR, Spec ID.

## Procedure
1. Классифицируй интент:
   - идея/фича без контракта
   - баг
   - изменение требований
   - реализация по существующему issue/Spec
   - подготовка/проверка PR
2. Выбери pipeline (1-6 шагов), используя skill-названия из `.agents/skills/*`:
   - "добавь фичу" -> `issue-create-idea` -> `issue-create-spec-change` -> `issue-create-feature-task`
   - "зафиксируй баг" -> `issue-create-bug` -> `issue-promote-to-todo`
   - "доработай поведение" -> `issue-create-spec-change` -> `spec-pr-update`
   - "реализуй #123" -> `work-start-issue` -> `spec-ensure-requirement` -> `dev-implement-change` -> `pr-open-from-issue` -> `pr-review-prepare`
3. Если не хватает 1-2 критичных входов (issue#, R-XXX, acceptance), задай короткие вопросы и не фантазируй.

## Output Contract
Верни:
- `Result`: `success`.
- `Artifacts`: `pipeline` (массив skill names), `open_questions` (если есть).
- `Next`: первый skill из pipeline.

