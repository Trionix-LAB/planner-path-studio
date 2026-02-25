---
name: agent-execute
description: "The main autonomous execution cycle. Use when an Issue is in `status:todo`. This skill handles FSM transition, planning (tasks/), coding, and opening the final PR."
---

# Agent execute (Main Cycle)

## Overview

Декларативное выполнение задачи. Срабатывает, когда человек перевел Issue в `status:todo`. Агент автономно проходит путь от планирования до готового PR.

## Preconditions
- Issue находится в `status:todo`.

## Workflow

### 1) Start & FSM Transition
Перевести issue в `status:in-progress`. Проверить наличие существующей ветки или PR:

```bash
# Проверить наличие PR для этой задачи
gh pr list --search "Fixes #<issue_number>" --state open --json number,headRefName
```

- **Если PR существует:** Перейти в существующую ветку (`git checkout <branch>`), подтянуть изменения.
- **Если PR нет:** Создать новую ветку `git checkout -b "<type>/<area>-<issue_number>-<slug>"` (от `main`).

Обновить статус:
```bash
gh issue edit <issue_number> --remove-label "status:todo" --add-label "status:in-progress"
```

### 2) Declarative Planning (`tasks/T-XXXX.md`)
Создать лог намерений (Chain-of-Thought) в `tasks/T-<issue_number>.md`.
**Шаблон:**
- **Why:** Зачем это нужно?
- **Goal:** Что изменится?
- **Plan:** 3–7 чекбоксов реализации (включая тесты).
- **Acceptance:** Ссылка на DoD из Issue.

*Примечание: План фиксируется для наблюдаемости, ручной апрув плана не требуется.*

### 3) Update Spec (`spec.md`)
Если задача меняет поведение или фиксит баг без спецификации — обновить `spec.md`, добавив/изменив правила `R-XXX`.

### 4) Implementation & Verification
- **Test-First:** Сначала падающий тест, потом код.
- Выполнить шаги из `tasks/`.
- Прогнать локальные проверки (build, lint, test).

### 5) PR & Why
Создать Pull Request. Каждый коммит и PR обязан содержать `Why: ...`.

**Шаблон PR Body:**
- `Fixes #<issue_number>`
- `Spec: R-XXX` (или `New requirement` / `n/a`)
- `Plan: tasks/T-<issue_number>.md`
- `Why: <мотивация>`

## Guardrails
- Один PR на задачу: требования + план + код.
- Если человек пишет "Request Changes" в PR, агент корректирует `tasks/` и код в этом же PR.

## Output contract
```
RESULT=ok|fail
ISSUE=<issue_number>
PR=<pr_number>
NEXT=await review/merge
```
