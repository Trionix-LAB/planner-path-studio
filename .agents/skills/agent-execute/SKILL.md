---
name: agent-execute
description: "Implement an approved plan in the existing PR. Use when the user says `execute`/“реализуй” and the PR already has label `plan:approved`. This skill verifies preconditions (`plan:approved`, issue `status:todo`), transitions the issue to `status:in-progress`, posts a progress comment, makes code/test changes, runs tests locally, and pushes implementation commits to the same PR."
---

# Agent execute

## Overview

Выполнить реализацию строго после прохождения Plan Gate: писать код/тесты, прогонять проверки, обновлять PR.

## Preconditions (hard fail if not met)

- На PR стоит лейбл `plan:approved`.
- Issue в `status:todo` (или эквивалентном состоянии “готово к реализации”).

Проверки:

```bash
gh pr view <pr_number> --json labels
gh issue view <issue_number> --json labels
```

## Workflow

### 1) Start work (FSM transition + comment)

Перевести issue в `status:in-progress` и оставить комментарий о старте реализации:

```bash
gh issue edit <issue_number> --remove-label "status:todo" --add-label "status:in-progress"
gh issue comment <issue_number> --body "Started implementation on PR #<pr_number>."
```

### 2) Implement exactly the plan

- Открыть `tasks/T-<issue_number>.md`, выполнить шаги строго по порядку.
- **Правило Spec:** Любое изменение поведения должно соответствовать `spec.md`. Не добавляй незадокументированные фичи.
- Если нужно существенно менять требования/план — остановиться и сделать `replan`.

### 3) Add tests (Test-First)

- Для фичей и багов: сначала добавить падающий тест (регрессионный или новый), потом фикс/реализацию, потом убедиться что тест проходит.

### 4) Run local checks

Запускать самый узкий набор проверок, который даёт уверенность (unit tests, build, lint — что есть в проекте).

### 5) Commit and push to the same PR

**Строгий формат коммитов:**
- Заголовок: `R-XXX: Short description` (используй ID требования из `spec.md`).
- Тело: Обязательная строка `Why: ...` (2–5 строк мотивации).

Это необходимо для сохранения контекста при использовании `git blame`.

Пример:
```bash
git commit -m "R-021: add validation logic
Why: to prevent null pointer exceptions when user is not logged in"
```

## Output contract

```
RESULT=ok|fail
ISSUE=<issue_number>
PR=<pr_number>
NEXT=review <pr_number>
```
