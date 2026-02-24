---
name: agent-plan
description: "Prepare an Issue for Plan Gate by creating a plan-only PR. Use when the user says `plan`/`prepare` (or asks to “подготовить задачу к апруву плана”), and you need to: normalize the issue title, create a branch, write/update `tasks/T-XXXX.md`, open/update a PR with required body fields, and ensure no changes land in `src/` or `tests/` before `plan:approved`."
---

# Agent plan (aka prepare)

## Overview

Подготовить задачу к Plan Gate: создать ветку и PR, содержащий только артефакты плана (`tasks/T-XXXX.md`, при необходимости `spec.md` и/или `adr/`), без изменений в коде. Даже для `chore`/refactoring задач сохраняй “один PR — две фазы”: (1) plan-only коммит, (2) последующие коммиты реализации после `plan:approved`.

## Preconditions

- Issue существует и находится в `status:backlog` (или эквивалентном входящем состоянии).
- Есть доступ к `gh` и `git`, настроены remotes.

## Workflow

### 1) Read and normalize the Issue

```bash
gh issue view <issue_number>
```

Выбрать тип и нормализовать заголовок:

- Если меняется внешнее поведение/контракт: используй `feat(area): ...` или `fix(area): ...` (и обнови `spec.md` по необходимости).
- Если поведение **не меняется** и `spec.md` **не трогаешь** (tech debt / infra / refactoring): используй `chore(area): ...`.

```bash
gh issue edit <issue_number> --title "<normalized title>"
```

### 2) Create/switch branch

Рекомендуемый шаблон: `<type>/<area>-<issue_number>-<slug>`.

```bash
git fetch
git checkout -b "<branch>"
```

### 3) Create/update the plan artifact `tasks/T-XXXX.md`

Создать директорию `tasks/` (если её нет), затем файл плана `tasks/T-<issue_number>.md`.

**Строгий шаблон плана:**
```markdown
# T-XXXX: [Название задачи]

**Issue:** #[Номер]
**Spec:** [R-XXX | New requirement | N/A]

## Why
* [1-2 предложения: зачем это нужно бизнесу или системе?]

## Goal
* [Что конкретно изменится после выполнения?]

## Plan
* [ ] Шаг 1: [Например, добавить R-XXX в spec.md]
* [ ] Шаг 2: [Написать падающий тест для R-XXX]
* [ ] Шаг 3: [Реализовать логику в src/...]
* [ ] Шаг 4: [Проверить прохождение тестов]

## Acceptance
* [ ] [Критерий 1: проверяемый результат]
* [ ] [Критерий 2: успешный тест]
```
*Правила плана:* 3–7 проверяемых чекбоксов. Никакого кода в плане. Обязательный шаг с тестами (Test-First).

### 4) Update `spec.md` (if behavior changes)

`spec.md` — единственный источник истины о поведении системы.
- **Формат:** `* **R-XXX:** [Component] MUST [Action] WHEN [Condition].`
- Если задача меняет поведение или фиксит баг без спецификации — добавь/обнови требование `R-XXX` в `spec.md`.
- Если задача `chore`/refactoring — **не изменять** `spec.md`.

### 5) Enforce “no code changes” rule (Plan Gate)

Перед коммитом убедиться, что не менялись `src/` и `tests/`:

```bash
git status --porcelain
git diff --name-only --diff-filter=ACMRT
```

Если есть изменения в `src/`/`tests/` — остановиться и вынести их в фазу `execute` после `plan:approved`.

### 6) Commit plan artifacts

```bash
git add tasks
# git add spec.md adr   # только если это нужно для плана
git commit -m "plan: T-<issue_number>"
git push -u origin "<branch>"
```

### 7) Create/update PR for Plan Gate

Создать PR (или обновить существующий) и заполнить body:

- `Fixes #<issue_number>`
- `Spec: R-XXX` / `Spec: New requirement` / `Spec: n/a` (или `Spec: Internal change`)
- `Plan: tasks/T-<issue_number>.md`
- `Why: ...` (2–5 строк, техническая мотивация; для `chore` задач это ключевое поле)

Команды (примерно):

```bash
gh pr create --fill
gh pr edit <pr_number> --body "<body>"
```

### 8) Move through FSM (Plan Gate)

- Открыть plan-only PR (issue остаётся в `status:backlog`).
- Дождаться лейбла `plan:approved`.
- Перевести issue в `status:todo` / `in-progress` и пушить последующие коммиты реализации в **тот же PR**.

## Output contract

```
RESULT=ok|fail
ISSUE=<issue_number>
PR=<pr_number>
NEXT=wait for plan:approved, then push implementation commits to the same PR
```
